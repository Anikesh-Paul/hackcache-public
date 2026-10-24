import { Account, AppwriteException, Client, Permission, Query, Role, Storage, TablesDB } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { DATABASE_ID, tables } from "@tagada/appwrite";
import type { StoredRow, WorldStore } from "./demo.ts";
import type { FileStore } from "./pay.ts";
import { requireEnv } from "./env.ts";

export function adminClient(): Client {
  return new Client()
    .setEndpoint(requireEnv("APPWRITE_ENDPOINT"))
    .setProject(requireEnv("APPWRITE_PROJECT"))
    .setKey(requireEnv("APPWRITE_KEY"));
}

/** One cheap read that needs the key's rows.read scope. */
export async function probeAppwrite(client: Client): Promise<void> {
  await new TablesDB(client).listRows({
    databaseId: DATABASE_ID,
    tableId: "workspaces",
    queries: [Query.limit(1)],
    total: false,
  });
}

/** The user a browser session JWT belongs to, or null when Appwrite rejects it. */
export async function userFromJwt(jwt: string): Promise<string | null> {
  const client = new Client()
    .setEndpoint(requireEnv("APPWRITE_ENDPOINT"))
    .setProject(requireEnv("APPWRITE_PROJECT"))
    .setJWT(jwt);
  try {
    return (await new Account(client).get()).$id;
  } catch (e) {
    if (e instanceof AppwriteException && e.code === 401) return null;
    throw e;
  }
}

const isNotFound = (e: unknown) => e instanceof AppwriteException && e.code === 404;

/** Appwrite asks for a retry on 503 (database_unavailable) and 429. */
const isTransient = (e: unknown) => e instanceof AppwriteException && (e.code === 503 || e.code === 429);

/** Runs an idempotent call again, up to three times in all, when Appwrite says the failure is transient. */
export async function withRetry<T>(call: () => Promise<T>, waitMs = 250): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (e) {
      if (attempt >= 3 || !isTransient(e)) throw e;
      await new Promise((resolve) => setTimeout(resolve, waitMs * attempt));
    }
  }
}

/** Demo worlds in the live database, written with the server key. */
export function appwriteWorlds(client: Client): WorldStore {
  const db = new TablesDB(client);
  return {
    async exists(workspaceId) {
      return db.getRow({ databaseId: DATABASE_ID, tableId: "workspaces", rowId: workspaceId }).then(
        () => true,
        (e: unknown) => (isNotFound(e) ? false : Promise.reject(e)),
      );
    },

    async remove(workspaceId) {
      // The workspace row goes first, so a half-deleted world never looks complete.
      const removeFrom = (tableId: string) =>
        withRetry(() =>
          db.deleteRows({ databaseId: DATABASE_ID, tableId, queries: [Query.equal("workspaceId", workspaceId)] }),
        );
      await removeFrom("workspaces");
      await Promise.all(
        Object.keys(tables)
          .filter((tableId) => tableId !== "workspaces")
          .map(removeFrom),
      );
    },

    async write(world) {
      // Upserts: the seed is deterministic, so a second write of the same world is harmless.
      // Appwrite's time grows with rows per call, so small batches in parallel are faster.
      await Promise.all(
        Object.entries(world).flatMap(([tableId, rows]) =>
          batches(rows, 25).map((batch) =>
            withRetry(() => db.upsertRows({ databaseId: DATABASE_ID, tableId, rows: batch })),
          ),
        ),
      );
    },

    async create(tableId, row) {
      const { $id: rowId, $permissions: permissions, ...data } = row;
      try {
        await withRetry(() => db.createRow({ databaseId: DATABASE_ID, tableId, rowId, data, permissions }));
        return "created";
      } catch (e) {
        // The row ID is the key: a second create for the same one is refused by Appwrite itself.
        if (e instanceof AppwriteException && e.code === 409) return "exists";
        throw e;
      }
    },

    async get(tableId, rowId) {
      return db.getRow({ databaseId: DATABASE_ID, tableId, rowId }).then(
        (row) => row as unknown as StoredRow,
        (e: unknown) => (isNotFound(e) ? null : Promise.reject(e)),
      );
    },

    async update(tableId, rowId, patch) {
      await withRetry(() => db.updateRow({ databaseId: DATABASE_ID, tableId, rowId, data: patch }));
    },

    async delete(tableId, rowId) {
      await withRetry(() => db.deleteRow({ databaseId: DATABASE_ID, tableId, rowId })).catch((e: unknown) => {
        if (!isNotFound(e)) throw e;
      });
    },

    async list(tableId, workspaceId, where = {}) {
      const { rows } = await withRetry(() =>
        db.listRows({
          databaseId: DATABASE_ID,
          tableId,
          queries: [
            Query.equal("workspaceId", workspaceId),
            ...Object.entries(where).map(([key, value]) => Query.equal(key, value)),
            Query.limit(500),
          ],
          total: false,
        }),
      );
      // The SDK types a row as an open record. These columns are the schema's.
      return rows as unknown as StoredRow[];
    },
  };
}

/** Every workspace and its Demo date, a page at a time. */
export async function* everyWorkspace(client: Client): AsyncGenerator<{ workspaceId: string; today: string }> {
  const db = new TablesDB(client);
  let after: string | null = null;
  for (;;) {
    const cursor: string | null = after;
    const { rows }: { rows: { $id: string; today?: unknown }[] } = await withRetry(() =>
      db.listRows({
        databaseId: DATABASE_ID,
        tableId: "workspaces",
        queries: [Query.select(["$id", "today"]), Query.limit(100), ...(cursor ? [Query.cursorAfter(cursor)] : [])],
        total: false,
      }),
    );
    for (const row of rows) {
      if (typeof row.today === "string") yield { workspaceId: row.$id, today: row.today };
    }
    if (rows.length < 100) return;
    after = rows[rows.length - 1]?.$id ?? null;
  }
}

/** The `screenshots` and `audio` buckets, written with the server key. */
export function appwriteFiles(client: Client): FileStore {
  const storage = new Storage(client);
  // Clips heard since this process started, so a missing or slow bucket never means paying ElevenLabs twice.
  const heard = new Map<string, Uint8Array>();
  return {
    async saveScreenshot({ fileId, ownerUserId, name, bytes }) {
      await storage.createFile({
        bucketId: "screenshots",
        fileId,
        file: InputFile.fromBuffer(bytes, name),
        permissions: [Permission.read(Role.user(ownerUserId))],
      });
    },
    async audio(fileId) {
      const recent = heard.get(fileId);
      if (recent) return recent;
      return storage.getFileDownload({ bucketId: "audio", fileId }).then(
        (buffer) => new Uint8Array(buffer),
        (e: unknown) => (isNotFound(e) ? null : Promise.reject(e)),
      );
    },
    async readScreenshot(fileId) {
      return storage.getFileDownload({ bucketId: "screenshots", fileId }).then(
        (buffer) => {
          const bytes = new Uint8Array(buffer);
          return { bytes, mime: imageMime(bytes) };
        },
        (e: unknown) => (isNotFound(e) ? null : Promise.reject(e)),
      );
    },
    async deleteScreenshot(fileId) {
      await withRetry(() => storage.deleteFile({ bucketId: "screenshots", fileId })).catch((e: unknown) => {
        if (!isNotFound(e)) throw e;
      });
    },
    async saveAudio(fileId, bytes) {
      if (heard.size >= 500) heard.delete(heard.keys().next().value ?? "");
      heard.set(fileId, bytes);
      try {
        // No permissions: only the server reads it, and plays it to the pay link.
        await storage.createFile({ bucketId: "audio", fileId, file: InputFile.fromBuffer(bytes, `${fileId}.mp3`) });
      } catch (e) {
        // Two first listens at once: the other one stored the same words.
        if (!(e instanceof AppwriteException && e.code === 409)) throw e;
      }
    },
  };
}

function imageMime(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return "image/webp";
  return "image/jpeg";
}

function batches<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
