// Server-only: applies the schema to a live Appwrite project. Imported by
// scripts/appwrite-setup.ts, never by the browser.
import {
  AppwriteException,
  Compression,
  Query,
  Storage,
  TablesDB,
  TablesDBIndexType,
  type Client,
} from "node-appwrite";
import type { ColumnSpec, IndexSpec, Schema } from "./schema.ts";
import { planSetup, type ExistingState, type SetupOp } from "./setup-plan.ts";

const FIRST_100 = [Query.limit(100)];

export async function readExistingState(client: Client, schema: Schema): Promise<ExistingState> {
  const db = new TablesDB(client);
  const storage = new Storage(client);
  const databaseId = schema.databaseId;

  const database = await db.get({ databaseId }).then(
    () => true,
    (e: unknown) => (isNotFound(e) ? false : Promise.reject(e)),
  );

  const tables: ExistingState["tables"] = {};
  if (database) {
    const { tables: list } = await db.listTables({ databaseId, queries: FIRST_100 });
    for (const t of list) {
      const [{ columns }, { indexes }] = await Promise.all([
        db.listColumns({ databaseId, tableId: t.$id, queries: FIRST_100 }),
        db.listIndexes({ databaseId, tableId: t.$id, queries: FIRST_100 }),
      ]);
      tables[t.$id] = { columns: columns.map((c) => c.key), indexes: indexes.map((i) => i.key) };
    }
  }

  const { buckets } = await storage.listBuckets({ queries: FIRST_100 });
  return { database, tables, buckets: buckets.map((b) => b.$id) };
}

/** Plans and applies the missing parts of `schema`. Returns what it did. */
export async function setupAppwrite(
  client: Client,
  schema: Schema,
  log: (line: string) => void = () => {},
): Promise<SetupOp[]> {
  const ops = planSetup(schema, await readExistingState(client, schema));
  const db = new TablesDB(client);
  const storage = new Storage(client);
  const databaseId = schema.databaseId;
  const touchedTables = new Set<string>();

  // Columns first, then wait for them, then indexes: Appwrite builds columns
  // asynchronously and rejects an index on a column that is still processing.
  const order: SetupOp["kind"][] = ["createDatabase", "createTable", "createColumn", "createBucket", "createIndex"];
  ops.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));

  for (const op of ops) {
    switch (op.kind) {
      case "createDatabase":
        await db.create({ databaseId, name: databaseId });
        log(`created database ${databaseId}`);
        break;
      case "createTable":
        await db.createTable({
          databaseId,
          tableId: op.table.id,
          name: op.table.name,
          permissions: op.table.permissions,
          rowSecurity: op.table.rowSecurity,
          columns: op.table.columns.map(inlineColumn),
          indexes: op.table.indexes.map(inlineIndex),
        });
        log(`created table ${op.table.id} (${op.table.columns.length} columns, ${op.table.indexes.length} indexes)`);
        break;
      case "createColumn":
        await createColumn(db, databaseId, op.tableId, op.column);
        touchedTables.add(op.tableId);
        log(`added column ${op.tableId}.${op.column.key}`);
        break;
      case "createBucket":
        await storage.createBucket({
          bucketId: op.bucket.id,
          name: op.bucket.name,
          permissions: [],
          fileSecurity: true,
          maximumFileSize: op.bucket.maximumFileSize,
          allowedFileExtensions: op.bucket.allowedFileExtensions,
          compression: Compression.None,
          encryption: op.bucket.encryption,
          antivirus: op.bucket.antivirus,
        });
        log(`created bucket ${op.bucket.id}`);
        break;
      case "createIndex":
        if (touchedTables.has(op.tableId)) {
          await waitForColumns(db, databaseId, op.tableId);
          touchedTables.delete(op.tableId);
        }
        await db.createIndex({
          databaseId,
          tableId: op.tableId,
          key: op.index.key,
          type: op.index.type === "unique" ? TablesDBIndexType.Unique : TablesDBIndexType.Key,
          columns: op.index.columns,
        });
        log(`added index ${op.tableId}.${op.index.key}`);
        break;
    }
  }
  return ops;
}

function inlineColumn(c: ColumnSpec): object {
  const { default: dflt, ...rest } = c as ColumnSpec & { default?: unknown };
  return dflt === undefined ? rest : { ...rest, default: dflt };
}

function inlineIndex(i: IndexSpec): object {
  return { key: i.key, type: i.type, attributes: i.columns };
}

async function createColumn(db: TablesDB, databaseId: string, tableId: string, c: ColumnSpec) {
  const base = { databaseId, tableId, key: c.key, required: c.required };
  switch (c.type) {
    case "varchar":
      return db.createVarcharColumn({ ...base, size: c.size, array: c.array });
    case "text":
      return db.createTextColumn(base);
    case "longtext":
      return db.createLongtextColumn(base);
    case "integer":
      return db.createIntegerColumn({ ...base, min: c.min, max: c.max, array: c.array });
    case "boolean":
      return db.createBooleanColumn({ ...base, xdefault: c.default });
    case "datetime":
      return db.createDatetimeColumn(base);
    case "enum":
      return db.createEnumColumn({ ...base, elements: [...c.elements] });
  }
}

async function waitForColumns(db: TablesDB, databaseId: string, tableId: string) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const { columns } = await db.listColumns({ databaseId, tableId, queries: FIRST_100 });
    const failed = columns.find((c) => c.status === "failed");
    if (failed) throw new Error(`column ${tableId}.${failed.key} failed: ${failed.error}`);
    if (columns.every((c) => c.status === "available")) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`columns on ${tableId} still processing after 60 s`);
}

function isNotFound(e: unknown): boolean {
  return e instanceof AppwriteException && e.code === 404;
}
