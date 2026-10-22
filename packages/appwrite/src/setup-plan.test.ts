import { describe, expect, it } from "vitest";
import { schema, planSetup, type ExistingState } from "./index.ts";

const empty: ExistingState = { database: false, tables: {}, buckets: [] };

function everythingExists(): ExistingState {
  return {
    database: true,
    tables: Object.fromEntries(
      schema.tables.map((t) => [
        t.id,
        { columns: t.columns.map((c) => c.key), indexes: t.indexes.map((i) => i.key) },
      ]),
    ),
    buckets: schema.buckets.map((b) => b.id),
  };
}

describe("schema", () => {
  it("declares the 13 tables of the data model in database main", () => {
    expect(schema.databaseId).toBe("main");
    expect(schema.tables.map((t) => t.id).sort()).toEqual(
      [
        "workspaces",
        "customers",
        "invoices",
        "invoice_lines",
        "events",
        "promises",
        "calls",
        "bank_txns",
        "proof_checks",
        "reminders",
        "workflow_runs",
        "inbox",
        "cash_items",
      ].sort(),
    );
  });

  it("puts workspaceId on every table and turns row security on", () => {
    for (const t of schema.tables) {
      expect(t.columns.map((c) => c.key), t.id).toContain("workspaceId");
      expect(t.rowSecurity, t.id).toBe(true);
    }
  });

  it("grants clients nothing at table level", () => {
    for (const t of schema.tables) expect(t.permissions, t.id).toEqual([]);
  });

  it("declares the indexes the build plan asks for", () => {
    const idx = (table: string) => schema.tables.find((t) => t.id === table)!.indexes;
    expect(idx("invoices")).toContainEqual(
      expect.objectContaining({ type: "key", columns: ["workspaceId", "status"] }),
    );
    expect(idx("invoices")).toContainEqual(
      expect.objectContaining({ type: "unique", columns: ["payToken"] }),
    );
    expect(idx("events")).toContainEqual(
      expect.objectContaining({ columns: ["invoiceId", "at"] }),
    );
    expect(idx("bank_txns")).toContainEqual(
      expect.objectContaining({ columns: ["workspaceId", "matchStatus"] }),
    );
    expect(idx("inbox")).toContainEqual(
      expect.objectContaining({ columns: ["workspaceId", "read"] }),
    );
  });

  it("only indexes columns that exist", () => {
    for (const t of schema.tables) {
      const keys = new Set(t.columns.map((c) => c.key));
      for (const i of t.indexes) for (const c of i.columns) expect(keys, `${t.id}.${i.key}`).toContain(c);
    }
  });

  it("declares the screenshots and documents buckets", () => {
    expect(schema.buckets.map((b) => b.id).sort()).toEqual(["documents", "screenshots"]);
  });
});

describe("planSetup", () => {
  it("creates the database, every table and both buckets in an empty project", () => {
    const ops = planSetup(schema, empty);
    expect(ops[0]).toEqual({ kind: "createDatabase", databaseId: "main" });
    expect(ops.filter((o) => o.kind === "createTable")).toHaveLength(13);
    expect(ops.filter((o) => o.kind === "createBucket")).toHaveLength(2);
    expect(ops.filter((o) => o.kind === "createColumn" || o.kind === "createIndex")).toHaveLength(0);
  });

  it("is a no-op when everything already exists", () => {
    expect(planSetup(schema, everythingExists())).toEqual([]);
  });

  it("adds only what is missing from an existing table", () => {
    const existing = everythingExists();
    const inv = existing.tables["invoices"]!;
    inv.columns = inv.columns.filter((c) => c !== "payToken");
    inv.indexes = inv.indexes.filter((i) => i !== "payToken_unique");
    delete existing.tables["inbox"];
    existing.buckets = ["screenshots"];

    const ops = planSetup(schema, existing);
    expect(ops.map((o) => [o.kind, "tableId" in o ? o.tableId : "", keyOf(o)])).toEqual([
      ["createColumn", "invoices", "payToken"],
      ["createIndex", "invoices", "payToken_unique"],
      ["createTable", "", "inbox"],
      ["createBucket", "", "documents"],
    ]);
  });
});

function keyOf(o: ReturnType<typeof planSetup>[number]): string {
  switch (o.kind) {
    case "createDatabase":
      return o.databaseId;
    case "createTable":
      return o.table.id;
    case "createColumn":
      return o.column.key;
    case "createIndex":
      return o.index.key;
    case "createBucket":
      return o.bucket.id;
  }
}
