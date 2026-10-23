import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { memoryFiles, memoryStore } from "./memory-store.ts";
import { payTokens } from "./pay-token.ts";

const USER = "64f0c2a91be7d3e85f10";
const WS = `w${USER}`;
const jwt = { authorization: "Bearer jwt-asha" };

let db: ReturnType<typeof memoryStore>;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  db = memoryStore();
  const pending: Promise<void>[] = [];
  app = createApp({
    probeAppwrite: async () => {},
    demo: {
      userFromJwt: async (token) => (token === "jwt-asha" ? USER : null),
      worlds: db.store,
      later: (task) => void pending.push(task),
      tokens: payTokens("test-secret"),
    },
    files: memoryFiles().files,
    voice: { async speak() { return new Uint8Array(); } },
  });
  await app.request("/api/demo/start", { method: "POST", headers: jwt });
  while (pending.length) await pending.shift();
});

const save = (body: unknown, headers: Record<string, string> = jwt) =>
  app.request("/api/settings", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) });
const workspace = () => db.table("workspaces").find((w) => w.$id === WS)!;

describe("POST /api/settings", () => {
  it("saves the business, registration, turnover, Plan rule, Auto-send stages, owner email and language", async () => {
    const res = await save({
      businessName: "Tripura Bamboo & Cane",
      address: "Plot 14, Lichubagan, Agartala",
      registrationType: "composition",
      aggregateTurnoverPaise: 60_000_000_00,
      planRule: { minFirstPct: 40, firstWithinDays: 10, restWithinDays: 45 },
      autoSendStages: [1, 2, 3],
      ownerEmail: "owner@example.com",
      lang: "bn",
    });
    expect(res.status).toBe(200);
    expect(workspace()).toMatchObject({
      businessName: "Tripura Bamboo & Cane",
      registrationType: "composition",
      aggregateTurnoverPaise: 60_000_000_00,
      autoSendStages: [1, 2, 3],
      ownerEmail: "owner@example.com",
      lang: "bn",
    });
    expect(JSON.parse(workspace().planRule as string)).toEqual({ minFirstPct: 40, firstWithinDays: 10, restWithinDays: 45 });
  });

  it("changes only what it is given", async () => {
    expect((await save({ autoSendStages: [] })).status).toBe(200);
    expect(workspace()).toMatchObject({ autoSendStages: [], businessName: "Tripura Bamboo Works" });
  });

  it("never lets the Payment Demand Letter, the call or the case file be sent automatically", async () => {
    for (const stage of [4, 5, 6]) {
      const res = await save({ autoSendStages: [1, stage] });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "invalid_settings", field: "autoSendStages" });
    }
    expect(workspace().autoSendStages).toEqual([1, 2]);
  });

  it("refuses a Plan rule whose rest falls before the first instalment", async () => {
    const res = await save({ planRule: { minFirstPct: 50, firstWithinDays: 30, restWithinDays: 7 } });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ field: "planRule" });
  });

  it("refuses an email, a turnover, a language or a name it cannot use", async () => {
    for (const [field, value] of [
      ["ownerEmail", "not an email"],
      ["aggregateTurnoverPaise", -1],
      ["lang", "fr"],
      ["businessName", "  "],
      ["registrationType", "llp"],
    ] as const) {
      const res = await save({ [field]: value });
      expect(res.status, field).toBe(400);
      expect(await res.json()).toMatchObject({ field });
    }
  });

  it("lets the owner email be cleared, and refuses a stranger", async () => {
    expect((await save({ ownerEmail: null })).status).toBe(200);
    expect(workspace().ownerEmail).toBeNull();
    expect((await save({ lang: "hi" }, { authorization: "Bearer nope" })).status).toBe(401);
  });
});
