import { Account, AppwriteException, Client, Query, TablesDB } from "node-appwrite";
import { DATABASE_ID, tables } from "@tagada/appwrite";
import type { StoredRow, WorldStore } from "./demo.ts";
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

    async list(tableId, workspaceId) {
      const { rows } = await withRetry(() =>
        db.listRows({
          databaseId: DATABASE_ID,
          tableId,
          queries: [Query.equal("workspaceId", workspaceId), Query.limit(500)],
          total: false,
        }),
      );
      // The SDK types a row as an open record. These columns are the schema's.
      return rows as unknown as StoredRow[];
    },
  };
}

function batches<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
