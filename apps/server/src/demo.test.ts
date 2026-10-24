import { beforeEach, describe, expect, it } from "vitest";
import { tables } from "@tagada/appwrite";
import { createApp } from "./app.ts";
import type { DemoStarted } from "./demo.ts";
import { memoryFiles, memoryStore } from "./memory-store.ts";
import { payTokens } from "./pay-token.ts";

const USERS: Record<string, string> = { "jwt-asha": "64f0c2a91be7d3e85f10", "jwt-ravi": "64f0c2a91be7d3e85f20" };

let db: ReturnType<typeof memoryStore>;
let files: ReturnType<typeof memoryFiles>;
let app: ReturnType<typeof createApp>;
/** Work the server does after answering; tests wait for it with settle(). */
let pending: Promise<void>[];
const settle = async () => {
  while (pending.length) await pending.shift();
};

beforeEach(() => {
  db = memoryStore();
  files = memoryFiles();
  pending = [];
  app = createApp({
    probeAppwrite: async () => {},
    demo: {
      userFromJwt: async (jwt) => USERS[jwt] ?? null,
      worlds: db.store,
      later: (task) => void pending.push(task),
      // A fixed clock: a reset that falls in the next second would otherwise sign different pay links.
      tokens: payTokens("test-secret", () => Date.parse("2026-11-02T06:00:00Z")),
    },
    files: files.files,
    voice: { speak: async () => new Uint8Array() },
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
    // A reset writes new rows, so only their creation time differs.
    const story = (workspaceId: string) => JSON.stringify(db.rowsOf(workspaceId).map(({ $createdAt: _, ...row }) => row));
    const startingStory = story("w64f0c2a91be7d3e85f10");
    const ravisWorld = JSON.stringify(db.rowsOf("w64f0c2a91be7d3e85f20"));

    // Asha experiments: pays an invoice and adds a stray row.
    const invoice = db.rowsOf("w64f0c2a91be7d3e85f10").find((r) => r.$id.startsWith("i19_"))!;
    (invoice as Record<string, unknown>).status = "paid";
    await db.store.write({ inbox: [{ ...invoice, $id: "stray_w64f0c2a91be7d3e85f10" }] });

    const res = await post("/api/demo/reset", "jwt-asha");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ workspaceId: "w64f0c2a91be7d3e85f10", seeded: true });
    await settle();
    expect(story("w64f0c2a91be7d3e85f10")).toBe(startingStory);
    expect(JSON.stringify(db.rowsOf("w64f0c2a91be7d3e85f20"))).toBe(ravisWorld);
  });
});

describe("POST /api/demo/delete", () => {
  const ASHA = "w64f0c2a91be7d3e85f10";
  const RAVI = "w64f0c2a91be7d3e85f20";
  const story = (workspaceId: string) => JSON.stringify(db.rowsOf(workspaceId).map(({ $createdAt: _, ...row }) => row));

  /** A row of the visitor's own in every table, and a screenshot a Customer sent. */
  const experiment = async (workspaceId: string, userId: string) => {
    const permissions = [`read("user:${userId}")`];
    await db.store.write(
      Object.fromEntries(
        Object.keys(tables).map((tableId) => [
          tableId,
          [{ $id: `mine_${tableId}_${workspaceId}`, workspaceId, $permissions: permissions, fileId: `s_${workspaceId}` }],
        ]),
      ),
    );
    await files.files.saveScreenshot({ fileId: `s_${workspaceId}`, ownerUserId: userId, name: "paid.png", bytes: new Uint8Array([1]) });
  };

  beforeEach(async () => {
    await post("/api/demo/start", "jwt-asha");
    await post("/api/demo/start", "jwt-ravi");
    await settle();
  });

  it("is 401 without a session JWT, or with one Appwrite does not know, and deletes nothing", async () => {
    await experiment(ASHA, "64f0c2a91be7d3e85f10");
    const rows = db.rows().length;
    expect((await post("/api/demo/delete")).status).toBe(401);
    expect((await post("/api/demo/delete", "jwt-forged")).status).toBe(401);
    expect(db.rows()).toHaveLength(rows);
    expect(files.screenshots.size).toBe(1);
  });

  it("deletes a row of the visitor's in every table, and every screenshot, then starts a fresh world", async () => {
    const startingStory = story(ASHA);
    await experiment(ASHA, "64f0c2a91be7d3e85f10");
    expect(db.rowsOf(ASHA).filter((row) => row.$id.startsWith("mine_"))).toHaveLength(Object.keys(tables).length);

    const res = await post("/api/demo/delete", "jwt-asha");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ workspaceId: ASHA, seeded: true });
    await settle();

    for (const tableId of Object.keys(tables)) {
      expect(db.table(tableId).some((row) => row.$id === `mine_${tableId}_${ASHA}`), tableId).toBe(false);
    }
    expect(files.screenshots.has(`s_${ASHA}`)).toBe(false);
    // The fresh world is the starting story, and it counts as there.
    expect(story(ASHA)).toBe(startingStory);
    expect(await db.store.exists(ASHA)).toBe(true);
  });

  it("touches no other visitor's rows or files", async () => {
    await experiment(ASHA, "64f0c2a91be7d3e85f10");
    await experiment(RAVI, "64f0c2a91be7d3e85f20");
    const ravisWorld = JSON.stringify(db.rowsOf(RAVI));

    await post("/api/demo/delete", "jwt-asha");
    await settle();

    expect(JSON.stringify(db.rowsOf(RAVI))).toBe(ravisWorld);
    expect(files.screenshots.has(`s_${RAVI}`)).toBe(true);
  });

  it("deletes no row while a screenshot could not be deleted, so it can be asked again", async () => {
    await experiment(ASHA, "64f0c2a91be7d3e85f10");
    const rows = db.rowsOf(ASHA).length;
    files.files.deleteScreenshot = async () => {
      throw new Error("storage unavailable");
    };
    const res = await post("/api/demo/delete", "jwt-asha");
    expect(res.status).toBe(500);
    expect(db.rowsOf(ASHA)).toHaveLength(rows);
  });
});
