import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import type { DemoStarted, OwnedRow, WorldStore } from "./demo.ts";

/** An in-memory stand-in for the Appwrite tables, keyed by table then row ID. */
function memoryStore() {
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
  };
  return {
    store,
    rows: () => [...tables.values()].flatMap((t) => [...t.values()]),
    rowsOf: (workspaceId: string) =>
      [...tables.values()].flatMap((t) => [...t.values()]).filter((r) => r.workspaceId === workspaceId),
    writes: () => writes,
  };
}

const USERS: Record<string, string> = { "jwt-asha": "64f0c2a91be7d3e85f10", "jwt-ravi": "64f0c2a91be7d3e85f20" };

let db: ReturnType<typeof memoryStore>;
let app: ReturnType<typeof createApp>;
/** Work the server does after answering; tests wait for it with settle(). */
let pending: Promise<void>[];
const settle = async () => {
  while (pending.length) await pending.shift();
};

beforeEach(() => {
  db = memoryStore();
  pending = [];
  app = createApp({
    probeAppwrite: async () => {},
    demo: {
      userFromJwt: async (jwt) => USERS[jwt] ?? null,
      worlds: db.store,
      later: (task) => void pending.push(task),
    },
  });
});

const post = (path: string, jwt?: string) =>
  app.request(path, { method: "POST", headers: jwt ? { authorization: `Bearer ${jwt}` } : {} });

describe("POST /api/demo/start", () => {
  it("is 401 without a session JWT, or with one Appwrite does not know", async () => {
    expect((await post("/api/demo/start")).status).toBe(401);
    expect((await post("/api/demo/start", "jwt-forged")).status).toBe(401);
    expect(db.rows()).toHaveLength(0);
  });

  it("seeds this visitor's own Demo world once, then reuses it", async () => {
    const first = await post("/api/demo/start", "jwt-asha");
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ workspaceId: "w64f0c2a91be7d3e85f10", seeded: true });
    await settle();
    const count = db.rows().length;
    expect(count).toBeGreaterThan(100);
    const writes = db.writes();

    const again = await post("/api/demo/start", "jwt-asha");
    expect(await again.json()).toEqual({ workspaceId: "w64f0c2a91be7d3e85f10", seeded: false });
    await settle();
    expect(db.writes()).toBe(writes);
    expect(db.rows()).toHaveLength(count);
  });

  it("answers once the first screens' rows are saved, and saves the rest right after", async () => {
    // Hold every write after the first until the answer has been checked.
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const write = db.store.write;
    let calls = 0;
    db.store.write = async (rows) => {
      if (calls++ > 0) await gate;
      return write(rows);
    };
    const res = await post("/api/demo/start", "jwt-asha");
    expect(res.status).toBe(200);
    const tableOf = (id: string) => db.rowsOf("w64f0c2a91be7d3e85f10").filter((r) => r.$id.startsWith(id));
    expect(tableOf("i")).toHaveLength(31);
    expect(tableOf("c")).toHaveLength(12);
    expect(tableOf("l")).toHaveLength(0);
    // The world does not count as there until its last row is saved.
    expect(await db.store.exists("w64f0c2a91be7d3e85f10")).toBe(false);

    release();
    await settle();
    expect(tableOf("l").length).toBeGreaterThan(31);
    expect(tableOf("e").length).toBeGreaterThan(31);
    expect(tableOf("bt_")).toHaveLength(7);
    expect(await db.store.exists("w64f0c2a91be7d3e85f10")).toBe(true);
  });

  it("hands a fresh world straight back, so the browser need not read it again", async () => {
    const body = (await (await post("/api/demo/start", "jwt-asha")).json()) as DemoStarted;
    if (!body.seeded) throw new Error("expected a fresh seed");
    expect(Object.keys(body.world).sort()).toEqual(["customers", "invoices", "promises", "workspaces"]);
    expect(body.world.invoices).toHaveLength(31);
    expect(body.world.workspaces[0]?.$id).toBe("w64f0c2a91be7d3e85f10");
    expect(JSON.stringify(body.world)).not.toContain("$permissions");
  });

  it("lets only this visitor read and update every row it writes", async () => {
    await post("/api/demo/start", "jwt-asha");
    await settle();
    for (const row of db.rows()) {
      expect(row.$permissions).toEqual(['read("user:64f0c2a91be7d3e85f10")', 'update("user:64f0c2a91be7d3e85f10")']);
    }
  });

  it("gives two visitors separate worlds that share no row", async () => {
    await post("/api/demo/start", "jwt-asha");
    await post("/api/demo/start", "jwt-ravi");
    await settle();
    const asha = db.rowsOf("w64f0c2a91be7d3e85f10");
    const ravi = db.rowsOf("w64f0c2a91be7d3e85f20");
    expect(asha.length).toBe(ravi.length);
    expect(asha.length + ravi.length).toBe(db.rows().length);
    for (const row of ravi) expect(row.$permissions.join()).not.toContain("64f0c2a91be7d3e85f10");
  });

  it("trusts the user Appwrite confirms, not the one a token claims", async () => {
    // A JWT-shaped token whose payload claims Asha, which Appwrite says belongs to Ravi.
    const claimsAsha = `x.${btoa(JSON.stringify({ userId: "64f0c2a91be7d3e85f10" }))}.y`;
    USERS[claimsAsha] = "64f0c2a91be7d3e85f20";
    await post("/api/demo/start", "jwt-asha");
    const res = await post("/api/demo/start", claimsAsha);
    expect(await res.json()).toMatchObject({ workspaceId: "w64f0c2a91be7d3e85f20", seeded: true });
    await settle();
    expect(db.rowsOf("w64f0c2a91be7d3e85f20").length).toBeGreaterThan(100);
    delete USERS[claimsAsha];
  });

  it("reuses a world it looked up while checking the token", async () => {
    const asha = `x.${btoa(JSON.stringify({ userId: "64f0c2a91be7d3e85f10" }))}.y`;
    USERS[asha] = "64f0c2a91be7d3e85f10";
    await post("/api/demo/start", asha);
    await settle();
    const writes = db.writes();
    expect(await (await post("/api/demo/start", asha)).json()).toEqual({
      workspaceId: "w64f0c2a91be7d3e85f10",
      seeded: false,
    });
    expect(db.writes()).toBe(writes);
    delete USERS[asha];
  });

  it("answers 500 without details when Appwrite fails", async () => {
    db.store.write = async () => {
      throw new Error("401 key sk_live_abc is invalid");
    };
    const res = await post("/api/demo/start", "jwt-asha");
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("sk_live");
  });
});

describe("POST /api/demo/reset", () => {
  it("is 401 without a session JWT", async () => {
    expect((await post("/api/demo/reset")).status).toBe(401);
  });

  it("puts back the starting story for this visitor only", async () => {
    await post("/api/demo/start", "jwt-asha");
    await post("/api/demo/start", "jwt-ravi");
    await settle();
    const startingStory = JSON.stringify(db.rowsOf("w64f0c2a91be7d3e85f10"));
    const ravisWorld = JSON.stringify(db.rowsOf("w64f0c2a91be7d3e85f20"));

    // Asha experiments: pays an invoice and adds a stray row.
    const invoice = db.rowsOf("w64f0c2a91be7d3e85f10").find((r) => r.$id.startsWith("i19_"))!;
    (invoice as Record<string, unknown>).status = "paid";
    await db.store.write({ inbox: [{ ...invoice, $id: "stray_w64f0c2a91be7d3e85f10" }] });

    const res = await post("/api/demo/reset", "jwt-asha");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ workspaceId: "w64f0c2a91be7d3e85f10", seeded: true });
    await settle();
    expect(JSON.stringify(db.rowsOf("w64f0c2a91be7d3e85f10"))).toBe(startingStory);
    expect(JSON.stringify(db.rowsOf("w64f0c2a91be7d3e85f20"))).toBe(ravisWorld);
  });
});
