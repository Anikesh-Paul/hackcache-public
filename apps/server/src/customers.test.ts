import { beforeEach, describe, expect, it } from "vitest";
import { gstinCheckDigit } from "@tagada/money";
import { createApp } from "./app.ts";
import { indianMobile } from "@tagada/domain";
import type { Mail, Mailer } from "./email.ts";
import { OWN_ADDRESS_LIMIT } from "./ladder.ts";
import { memoryFiles, memoryStore } from "./memory-store.ts";
import { payTokens } from "./pay-token.ts";

const USERS: Record<string, string> = { "jwt-asha": "64f0c2a91be7d3e85f10", "jwt-ravi": "7a1b2c3d4e5f60718293" };
const WORKSPACE = "w64f0c2a91be7d3e85f10";
const INBOX = "demo-inbox@example.com";

let db: ReturnType<typeof memoryStore>;
let mails: Mail[];

function appWith(mailCustomers: boolean) {
  const pending: Promise<void>[] = [];
  const mailer: Mailer = {
    async send(mail) {
      mails.push(mail);
      return { ok: true, id: `msg_${mails.length}` };
    },
  };
  const app = createApp({
    probeAppwrite: async () => {},
    demo: {
      userFromJwt: async (jwt) => USERS[jwt] ?? null,
      worlds: db.store,
      later: (task) => void pending.push(task),
      tokens: payTokens("test-secret"),
    },
    files: memoryFiles().files,
    voice: { speak: async () => new Uint8Array() },
    ladder: { mailer, demoInbox: INBOX, mailCustomers, webOrigin: "https://tagada.example", runId: () => `run${mails.length}` },
  });
  const seed = async (jwt = "jwt-asha") => {
    await app.request("/api/demo/start", { method: "POST", headers: { authorization: `Bearer ${jwt}` } });
    while (pending.length) await pending.shift();
  };
  return { app, seed };
}

let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  db = memoryStore();
  mails = [];
  const made = appWith(false);
  app = made.app;
  await made.seed();
});

const post = (path: string, body: unknown, jwt = "jwt-asha") =>
  app.request(path, {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const customer = (name: string) => db.table("customers").find((row) => row.name === name)!;

const judge = {
  name: "Judge Stores",
  stateCode: "19",
  creditDays: 15,
  lang: "en",
  address: "1 Park Street, Kolkata",
  email: "judge@example.org",
  phone: "98300 12345",
  consentCalls: true,
};

describe("POST /api/customers", () => {
  it("is 401 without a session, and does not write", async () => {
    const before = db.table("customers").length;
    const res = await app.request("/api/customers", { method: "POST", body: JSON.stringify(judge) });
    expect(res.status).toBe(401);
    expect(db.table("customers")).toHaveLength(before);
  });

  it("adds a Customer to the visitor's own world, with the phone as +91 and the call consent dated", async () => {
    const res = await post("/api/customers", judge);
    expect(res.status).toBe(200);
    const { customer: saved } = (await res.json()) as { customer: Record<string, unknown> };
    expect(saved).toMatchObject({
      name: "Judge Stores",
      gstin: null,
      stateCode: "19",
      place: "West Bengal",
      email: "judge@example.org",
      phone: "+919830012345",
      consentCalls: true,
      creditDays: 15,
      lang: "en",
    });
    expect(saved.consentAt).toMatch(/^2026-11-02T/);
    const row = customer("Judge Stores");
    expect(row.workspaceId).toBe(WORKSPACE);
    expect(row.$permissions).toEqual(['read("user:64f0c2a91be7d3e85f10")', 'update("user:64f0c2a91be7d3e85f10")']);
  });

  it("checks every field as a new Customer on an Invoice is checked", async () => {
    const stem = "19AABCU9603R1Z";
    const bad = `${stem}${gstinCheckDigit(stem) === "0" ? "1" : "0"}`;
    const cases: [Record<string, unknown>, string][] = [
      [{ name: "" }, "invalid_customer"],
      [{ gstin: bad }, "invalid_gstin"],
      [{ stateCode: "99" }, "invalid_customer"],
      [{ gstin: `${stem}${gstinCheckDigit(stem)}`, stateCode: "16" }, "invalid_customer"],
      [{ creditDays: 400 }, "invalid_customer"],
      [{ lang: "fr" }, "invalid_customer"],
      [{ email: "not an email" }, "invalid_email"],
      [{ phone: "12345" }, "invalid_phone"],
      [{ consentCalls: "yes" }, "invalid_customer"],
    ];
    const before = db.table("customers").length;
    for (const [patch, error] of cases) {
      const res = await post("/api/customers", { ...judge, ...patch });
      expect(res.status, JSON.stringify(patch)).toBe(400);
      expect(await res.json()).toEqual({ error });
    }
    expect(db.table("customers")).toHaveLength(before);
  });
});

describe("POST /api/customers/:id", () => {
  it("edits the Customer's details and keeps their grade and history", async () => {
    const gupta = customer("Gupta Traders");
    const res = await post(`/api/customers/${gupta.$id}`, {
      name: "Gupta Traders & Sons",
      gstin: gupta.gstin,
      stateCode: gupta.stateCode,
      creditDays: 45,
      lang: "hi",
      address: "Burrabazar, Kolkata",
      email: "gupta@example.org",
      phone: "+91 98310 00000",
      consentCalls: true,
    });
    expect(res.status).toBe(200);
    expect(customer("Gupta Traders & Sons")).toMatchObject({
      $id: gupta.$id,
      creditDays: 45,
      email: "gupta@example.org",
      phone: "+919831000000",
      grade: gupta.grade,
      buyerType: gupta.buyerType,
    });
  });

  it("keeps the date consent was first given, and clears it when withdrawn", async () => {
    const gupta = customer("Gupta Traders");
    const given = gupta.consentAt;
    expect(given).toBeTruthy();
    const base = { name: "Gupta Traders", gstin: gupta.gstin, stateCode: gupta.stateCode, creditDays: 30, lang: "hi" };
    await post(`/api/customers/${gupta.$id}`, { ...base, consentCalls: true });
    expect(customer("Gupta Traders").consentAt).toBe(given);
    await post(`/api/customers/${gupta.$id}`, { ...base, consentCalls: false });
    expect(customer("Gupta Traders")).toMatchObject({ consentCalls: false, consentAt: null });
  });

  it("does not move a Customer with Invoices to another state: the place of supply on them would change", async () => {
    const gupta = customer("Gupta Traders");
    const res = await post(`/api/customers/${gupta.$id}`, { name: "Gupta Traders", stateCode: "16", creditDays: 30, lang: "hi" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "state_locked" });
    expect(customer("Gupta Traders").stateCode).toBe(gupta.stateCode);
  });

  it("moves a Customer with no Invoices yet", async () => {
    await post("/api/customers", judge);
    const added = customer("Judge Stores");
    const res = await post(`/api/customers/${added.$id}`, { ...judge, stateCode: "16" });
    expect(res.status).toBe(200);
    expect(customer("Judge Stores")).toMatchObject({ stateCode: "16", place: "Tripura" });
  });

  it("cannot touch another visitor's Customer", async () => {
    const gupta = customer("Gupta Traders");
    const res = await post(`/api/customers/${gupta.$id}`, { ...judge, stateCode: gupta.stateCode, gstin: gupta.gstin }, "jwt-ravi");
    expect(res.status).toBe(404);
    expect(customer("Gupta Traders").name).toBe("Gupta Traders");
  });
});

describe("a Customer's own email address", () => {
  const sahaEmail = async (target: ReturnType<typeof createApp>) => {
    const saha = customer("Saha Furniture Mart");
    const res = await target.request(`/api/customers/${saha.$id}`, {
      method: "POST",
      headers: { authorization: "Bearer jwt-asha", "content-type": "application/json" },
      body: JSON.stringify({
        name: saha.name,
        gstin: saha.gstin,
        stateCode: saha.stateCode,
        creditDays: saha.creditDays,
        lang: saha.lang,
        email: "judge@example.org",
      }),
    });
    expect(res.status).toBe(200);
  };
  const step = (target: ReturnType<typeof createApp>, date: string) =>
    target.request("/api/ladder/run", {
      method: "POST",
      headers: { authorization: "Bearer jwt-asha", "content-type": "application/json" },
      body: JSON.stringify({ date }),
    });

  it("gets the Ladder's reminder when the server sends from its own domain", async () => {
    db = memoryStore();
    const made = appWith(true);
    await made.seed();
    await sahaEmail(made.app);
    await step(made.app, "2026-11-05");
    expect(mails.map((mail) => mail.to)).toEqual(["judge@example.org"]);
  });

  it("goes to the Demo inbox instead when the server can only send from resend.dev", async () => {
    await sahaEmail(app);
    await step(app, "2026-11-05");
    expect(mails.map((mail) => mail.to)).toEqual([INBOX]);
  });

  it(`sends at most ${OWN_ADDRESS_LIMIT} emails a world to typed-in addresses, then uses the Demo inbox`, async () => {
    db = memoryStore();
    const made = appWith(true);
    await made.seed();
    await sahaEmail(made.app);
    const used = Array.from({ length: OWN_ADDRESS_LIMIT }, (_, n) => ({
      $id: `used${n}`,
      workspaceId: WORKSPACE,
      $permissions: [],
      invoiceId: "x",
      at: "2026-11-01T10:00:00.000+05:30",
      type: "reminder",
      actor: "workflow",
      summary: "sent",
      payload: JSON.stringify({ email: { to: "someone@example.org" } }),
    }));
    await db.store.write({ events: used });
    await step(made.app, "2026-11-05");
    expect(mails.map((mail) => mail.to)).toEqual([INBOX]);
  });
});

describe("indianMobile", () => {
  it("reads the usual ways of writing an Indian mobile", () => {
    for (const written of ["9830012345", "+91 98300 12345", "+91-98300-12345", "098300 12345", "919830012345"]) {
      expect(indianMobile(written), written).toBe("+919830012345");
    }
    for (const written of ["12345", "5830012345", "+1 415 555 0100"]) expect(indianMobile(written), written).toBeNull();
  });
});
