import { beforeEach, describe, expect, it } from "vitest";
import { gstinCheckDigit } from "@tagada/money";
import { createApp } from "./app.ts";
import { memoryFiles, memoryStore } from "./memory-store.ts";
import { payTokens } from "./pay-token.ts";

const USERS: Record<string, string> = { "jwt-asha": "64f0c2a91be7d3e85f10" };
const WORKSPACE = "w64f0c2a91be7d3e85f10";

let db: ReturnType<typeof memoryStore>;
let app: ReturnType<typeof createApp>;
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
      tokens: payTokens("test-secret"),
    },
    files: memoryFiles().files,
    voice: { speak: async () => new Uint8Array() },
  });
});

const named = (name: string) => {
  const found = db.rows().find((row) => row.name === name);
  if (!found) throw new Error(`no row named ${name}`);
  return found;
};

async function seed() {
  const res = await app.request("/api/demo/start", {
    method: "POST",
    headers: { authorization: "Bearer jwt-asha" },
  });
  expect(res.status).toBe(200);
  await settle();
}

function postInvoice(body: unknown, jwt = "jwt-asha") {
  return app.request("/api/invoices", {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const chair = {
  description: "Cane lounge chair",
  hsn: "940382",
  quantity: 1,
  ratePaise: 1_000_000,
  discountPercent: 10,
  gstRatePercent: 18,
};

describe("POST /api/invoices", () => {
  it("is 401 without a session, and does not write", async () => {
    const res = await app.request("/api/invoices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerId: "c1", lines: [chair] }),
    });
    expect(res.status).toBe(401);
    expect(db.rows()).toHaveLength(0);
  });

  it("saves an inter-state Invoice with IGST, the next FY number and its own totals", async () => {
    await seed();
    const gupta = named("Gupta Traders");
    const res = await postInvoice({
      customerId: gupta.$id,
      lines: [chair],
      // A tampered browser total, number and document type, which the server must ignore.
      totalPaise: 1,
      igstPaise: 1,
      number: "HACK/26-27/9999",
      docType: "invoice",
      payToken: "stolen",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      invoice: Record<string, unknown>;
      customer: { name: string };
    };
    // ₹10,000 less 10% is ₹9,000 taxable; 18% IGST is ₹1,620; total ₹10,620.
    expect(body.invoice).toMatchObject({
      number: "TBW/26-27/0032",
      docType: "tax_invoice",
      customerId: gupta.$id,
      issueDate: "2026-11-02",
      dueDate: "2026-12-02",
      taxablePaise: 900_000,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 162_000,
      roundOffPaise: 0,
      totalPaise: 1_062_000,
      paidPaise: 0,
      status: "sent",
    });
    expect(body.invoice.payToken).toEqual(expect.any(String));
    expect(body.invoice.payToken).not.toBe("stolen");
    expect(body.customer.name).toBe("Gupta Traders");

    const again = await postInvoice({
      customerId: gupta.$id,
      lines: [{ ...chair, discountPercent: 0, ratePaise: 500_000, gstRatePercent: 5 }],
    });
    const second = (await again.json()) as { invoice: { number: string; totalPaise: number; igstPaise: number } };
    expect(second.invoice).toMatchObject({ number: "TBW/26-27/0033", taxablePaise: 500_000, igstPaise: 25_000, totalPaise: 525_000 });
  });

  it("picks a Bill of Supply for a composition seller and a plain Invoice when unregistered", async () => {
    await seed();
    const saha = named("Saha Furniture Mart");
    const workspace = db.rows().find((row) => row.$id === WORKSPACE);
    if (!workspace) throw new Error("no workspace");
    const line = { description: "Bamboo bowl set", hsn: "441919", quantity: 2, ratePaise: 10_000, discountPercent: 0, gstRatePercent: 5 };

    workspace.registrationType = "composition";
    const composition = await postInvoice({ customerId: saha.$id, lines: [line], docType: "tax_invoice" });
    expect(composition.status).toBe(200);
    expect(await composition.json()).toMatchObject({
      invoice: { docType: "bill_of_supply", taxablePaise: 20_000, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, totalPaise: 20_000 },
    });

    workspace.registrationType = "unregistered";
    const plain = await postInvoice({ customerId: saha.$id, lines: [line], docType: "tax_invoice" });
    expect(await plain.json()).toMatchObject({ invoice: { docType: "invoice", number: "TBW/26-27/0033", igstPaise: 0, totalPaise: 20_000 } });
  });

  it("refuses an inter-state supply from a composition seller, and an unknown Customer", async () => {
    await seed();
    const before = db.rows().length;
    const workspace = db.rows().find((row) => row.$id === WORKSPACE);
    if (!workspace) throw new Error("no workspace");
    workspace.registrationType = "composition";
    const refused = await postInvoice({ customerId: named("Gupta Traders").$id, lines: [chair] });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: "composition_interstate" });

    workspace.registrationType = "regular";
    const missing = await postInvoice({ customerId: "nobody", lines: [chair] });
    expect(missing.status).toBe(400);
    expect(db.rows()).toHaveLength(before);
  });

  it("creates a Customer only when the GSTIN check digit passes", async () => {
    await seed();
    const stem = "19AABCU9603R1Z";
    const good = `${stem}${gstinCheckDigit(stem)}`;
    const bad = `${stem}${gstinCheckDigit(stem) === "0" ? "1" : "0"}`;
    const customer = { name: "New Customer", gstin: bad, stateCode: "19", creditDays: 15, lang: "hi", address: "1 Park Street, Kolkata" };
    const before = db.rows().filter((row) => row.name === "New Customer").length;

    const rejected = await postInvoice({ customer, lines: [chair] });
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({ error: "invalid_gstin" });
    expect(db.rows().filter((row) => row.name === "New Customer")).toHaveLength(before);

    const saved = await postInvoice({ customer: { ...customer, gstin: good }, lines: [chair] });
    expect(saved.status).toBe(200);
    const body = (await saved.json()) as { invoice: { igstPaise: number; dueDate: string }; customer: Record<string, unknown> };
    expect(body.customer).toMatchObject({ name: "New Customer", gstin: good, stateCode: "19", creditDays: 15, lang: "hi" });
    expect(body.invoice.igstPaise).toBe(162_000);
    expect(body.invoice.dueDate).toBe("2026-11-17");
  });

  it("rejects a GST rate that is not configured", async () => {
    await seed();
    const before = db.rows().length;
    const res = await postInvoice({
      customerId: named("Gupta Traders").$id,
      lines: [{ ...chair, gstRatePercent: 12 }],
    });
    expect(res.status).toBe(400);
    expect(db.rows()).toHaveLength(before);
  });
});
