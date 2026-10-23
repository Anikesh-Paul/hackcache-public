// The Appwrite tables, in memory, for tests. Keyed by table, then row ID.
import type { OwnedRow, WorldStore } from "./demo.ts";

export function memoryStore() {
  const tables = new Map<string, Map<string, OwnedRow>>();
  let writes = 0;
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
        for (const row of rows) table.set(row.$id, row);
        tables.set(tableId, table);
      }
    },
    async list(tableId, workspaceId) {
      return [...(tables.get(tableId)?.values() ?? [])].filter((row) => row.workspaceId === workspaceId);
    },
  };
  const every = () => [...tables.values()].flatMap((table) => [...table.values()]);
  return {
    store,
    rows: every,
    rowsOf: (workspaceId: string) => every().filter((row) => row.workspaceId === workspaceId),
    writes: () => writes,
  };
}
