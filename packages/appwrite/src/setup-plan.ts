import type { BucketSpec, ColumnSpec, IndexSpec, Schema, TableSpec } from "./schema.ts";

/** What the Appwrite project already has, by ID/key. */
export type ExistingState = {
  database: boolean;
  tables: Record<string, { columns: string[]; indexes: string[] }>;
  buckets: string[];
};

export type SetupOp =
  | { kind: "createDatabase"; databaseId: string }
  | { kind: "createTable"; table: TableSpec }
  | { kind: "createColumn"; tableId: string; column: ColumnSpec }
  | { kind: "createIndex"; tableId: string; index: IndexSpec }
  | { kind: "createBucket"; bucket: BucketSpec };

/**
 * The operations that bring a project up to `schema`. Only creates what is
 * missing, so running it against a finished project returns no operations.
 * Existing columns are never altered.
 */
export function planSetup(schema: Schema, existing: ExistingState): SetupOp[] {
  const ops: SetupOp[] = [];
  if (!existing.database) ops.push({ kind: "createDatabase", databaseId: schema.databaseId });

  for (const table of schema.tables) {
    const have = existing.tables[table.id];
    if (!have) {
      ops.push({ kind: "createTable", table });
      continue;
    }
    for (const column of table.columns)
      if (!have.columns.includes(column.key)) ops.push({ kind: "createColumn", tableId: table.id, column });
    for (const index of table.indexes)
      if (!have.indexes.includes(index.key)) ops.push({ kind: "createIndex", tableId: table.id, index });
  }

  for (const bucket of schema.buckets)
    if (!existing.buckets.includes(bucket.id)) ops.push({ kind: "createBucket", bucket });

  return ops;
}
