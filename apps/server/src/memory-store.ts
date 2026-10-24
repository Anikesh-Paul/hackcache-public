// The Appwrite tables and buckets, in memory, for tests. Keyed by table, then row ID.
import type { OwnedRow, WorldStore } from "./demo.ts";
import type { FileStore } from "./pay.ts";

export function memoryStore() {
  const tables = new Map<string, Map<string, OwnedRow>>();
  let writes = 0;
  let lists = 0;
  // Like Appwrite, a new row gets `$createdAt`; an overwrite keeps it. Each one later than the last.
  let lastCreated = 0;
  const created = () => new Date((lastCreated = Math.max(Date.now(), lastCreated + 1))).toISOString();
  const store: WorldStore = {
    async exists(workspaceId) {
      return tables.get("workspaces")?.has(workspaceId) ?? false;
    },
    async remove(workspaceId) {
      for (const rows of tables.values()) {
        for (const [id, row] of rows) if (row.workspaceId === workspaceId) rows.delete(id);
      }
    },
    async write(world) {
      writes++;
      for (const [tableId, rows] of Object.entries(world)) {
        const table = tables.get(tableId) ?? new Map<string, OwnedRow>();
        for (const row of rows) table.set(row.$id, Object.assign(row, { $createdAt: table.get(row.$id)?.$createdAt ?? created() }));
        tables.set(tableId, table);
      }
    },
    async create(tableId, row) {
      const table = tables.get(tableId) ?? new Map<string, OwnedRow>();
      tables.set(tableId, table);
      if (table.has(row.$id)) return "exists";
      writes++;
      table.set(row.$id, { ...row, $createdAt: created() });
      return "created";
    },
    async get(tableId, rowId) {
      return tables.get(tableId)?.get(rowId) ?? null;
    },
    async update(tableId, rowId, patch) {
      writes++;
      const row = tables.get(tableId)?.get(rowId);
      if (!row) throw new Error(`no row ${tableId}/${rowId}`);
      Object.assign(row, patch);
    },
    async list(tableId, workspaceId, where = {}) {
      lists++;
      return [...(tables.get(tableId)?.values() ?? [])].filter(
        (row) => row.workspaceId === workspaceId && Object.entries(where).every(([key, value]) => row[key] === value),
      );
    },
  };
  const every = () => [...tables.values()].flatMap((table) => [...table.values()]);
  return {
    store,
    rows: every,
    rowsOf: (workspaceId: string) => every().filter((row) => row.workspaceId === workspaceId),
    table: (tableId: string) => [...(tables.get(tableId)?.values() ?? [])],
    writes: () => writes,
    lists: () => lists,
  };
}

export function memoryFiles() {
  const screenshots = new Map<string, { ownerUserId: string; name: string; bytes: Uint8Array }>();
  const audio = new Map<string, Uint8Array>();
  const files: FileStore = {
    async saveScreenshot({ fileId, ...file }) {
      screenshots.set(fileId, file);
    },
    async audio(fileId) {
      return audio.get(fileId) ?? null;
    },
    async saveAudio(fileId, bytes) {
      audio.set(fileId, bytes);
    },
    async readScreenshot(fileId) {
      const file = screenshots.get(fileId);
      if (!file) return null;
      const mime = file.name.endsWith(".png") ? "image/png" : file.name.endsWith(".webp") ? "image/webp" : "image/jpeg";
      return { bytes: file.bytes, mime };
    },
  };
  return { files, screenshots, audio };
}
