import { beforeEach, describe, expect, it } from "vitest";
import { GUPTA_PROOF_AMOUNT_TEXT, GUPTA_PROOF_UTR } from "@tagada/seed";
import { createApp } from "./app.ts";
import { memoryFiles, memoryStore } from "./memory-store.ts";
import { payTokens } from "./pay-token.ts";
import type { ProofReader } from "./proof-read.ts";

const USER = "64f0c2a91be7d3e85f10";
const jwt = { authorization: "Bearer jwt-asha" };

let db: ReturnType<typeof memoryStore>;
let app: ReturnType<typeof createApp>;
let read: ProofReader["read"];
let pending: Promise<void>[];

beforeEach(async () => {
  db = memoryStore();
  pending = [];
  read = async () => ({
    utr: GUPTA_PROOF_UTR,
    amountText: GUPTA_PROOF_AMOUNT_TEXT,
    dateText: "01/11/2026",
    payeeVpa: "tripura@upi",
    confidence: 0.9,
  });
  app = createApp({
    probeAppwrite: async () => {},
    demo: {
      userFromJwt: async (token) => (token === "jwt-asha" ? USER : null),
      worlds: db.store,
      later: (task) => void pending.push(task),
      tokens: payTokens("test-secret", () => Date.parse("2026-11-02T06:00:00Z")),
    },
    files: memoryFiles().files,
    voice: { async speak() { return new Uint8Array(); } },
    proof: { read: (image) => read(image) },
  });
  await app.request("/api/demo/start", { method: "POST", headers: jwt });
  while (pending.length) await pending.shift();
});

const customerId = (name: string) => db.table("customers").find((row) => row.name === name)?.$id;
const openInvoice = (name: string) => {
  const found = db.table("invoices").find((row) => row.customerId === customerId(name) && row.status !== "paid");
  if (!found || typeof found.payToken !== "string") throw new Error(`no open invoice for ${name}`);
  return found;
};
const gupta = () => openInvoice("Gupta Traders");
const txns = () => db.table("bank_txns");
const proofs = () => db.table("proof_checks");

function screenshot(amountText = GUPTA_PROOF_AMOUNT_TEXT, utr = GUPTA_PROOF_UTR) {
  read = async () => ({ utr, amountText, dateText: "01/11/2026", payeeVpa: "tripura@upi", confidence: 60_000 });
  const form = new FormData();
  form.append("file", new File([new Uint8Array([0xff, 0xd8, 0xff])], "upi.jpg", { type: "image/jpeg" }));
  return app.request(`/api/pay/${gupta().payToken}/screenshot`, { method: "POST", body: form });
}

const post = (path: string, body: unknown) =>
  app.request(path, { method: "POST", headers: { ...jwt, "content-type": "application/json" }, body: JSON.stringify(body) });

describe("bank import and proof check", () => {
  it("keeps Gupta's screenshot as not found yet, then Matched after statement 2, and unpaid until Confirm", async () => {
    const before = gupta();
    expect((await screenshot()).status).toBe(200);
    expect(proofs()[0]).toMatchObject({ result: "not_found_yet", invoiceId: before.$id });
    expect(db.table("events").some((event) => String(event.summary).includes("Not found yet"))).toBe(true);
    expect(JSON.stringify(db.rows())).not.toMatch(/fake/i);

    const imported = await post("/api/bank/import", { sample: true });
    expect(await imported.json()).toEqual({ ok: true, already: 0, added: 1, summary: "0 already imported, 1 new" });
    expect(proofs()[0]?.result).toBe("found");
    expect(db.table("events").some((event) => event.summary === "The UTR on the screenshot is in the bank statement. Matched ✓.")).toBe(true);
    expect(gupta()).toMatchObject({ status: "sent", paidPaise: 0 });

    const again = await post("/api/bank/import", { sample: true });
    expect(await again.json()).toMatchObject({ already: 1, added: 0, summary: "1 already imported, 0 new" });
    expect(txns().filter((row) => row.utr === GUPTA_PROOF_UTR)).toHaveLength(1);

    const credit = txns().find((row) => row.utr === GUPTA_PROOF_UTR);
    expect(credit).toMatchObject({ matchStatus: "suggested", matchKind: "part", amountPaise: 6_000_000 });
    const confirmed = await post("/api/bank/confirm", { ids: [credit?.$id] });
    expect(await confirmed.json()).toEqual({ ok: true, confirmed: 1 });
    expect(gupta()).toMatchObject({ status: "part", paidPaise: 6_000_000 });
    expect(txns().find((row) => row.$id === credit?.$id)?.matchStatus).toBe("confirmed");
    expect(JSON.stringify(db.rows())).not.toMatch(/fake/i);
  });

  it("matches a screenshot sent after the Owner already confirmed its credit", async () => {
    await post("/api/bank/import", { sample: true });
    const credit = txns().find((row) => row.utr === GUPTA_PROOF_UTR);
    await post("/api/bank/confirm", { ids: [credit?.$id] });
    expect(gupta()).toMatchObject({ status: "part", paidPaise: 6_000_000 });
    expect((await screenshot()).status).toBe(200);
    expect(proofs()[0]?.result).toBe("found");
  });

  it("says amount differs for a screenshot above what is owed, and never says fake", async () => {
    expect((await screenshot("₹1,50,000.00")).status).toBe(200);
    expect(proofs()[0]?.result).toBe("amount_mismatch");
    const event = db.table("events").find((row) => row.type === "proof_uploaded");
    expect(event?.summary).toContain("Amount differs");
    expect(`${event?.summary} ${proofs()[0]?.extracted}`).not.toMatch(/fake/i);
  });

  it("parses the printed amount and does not store a number from the model", async () => {
    await post("/api/bank/import", { sample: true });
    expect((await screenshot("60000")).status).toBe(200);
    const proof = proofs()[0];
    const extracted = JSON.parse(String(proof?.extracted)) as Record<string, unknown>;
    expect(extracted.amountText).toBe("60000");
    expect(extracted).not.toHaveProperty("amountPaise");
    expect(extracted.confidence).toBe(60_000);
    expect(proof?.result).toBe("found");
  });

  it("confirms every exact credit and leaves part, TDS and the unknown deposit alone", async () => {
    const sen = openInvoice("Sen Handicrafts");
    const hotel = openInvoice("Hotel Gomati View");
    const confirmed = await post("/api/bank/confirm", { allExact: true });
    expect(((await confirmed.json()) as { confirmed: number }).confirmed).toBe(1);
    expect(db.table("invoices").find((row) => row.$id === sen.$id)?.status).toBe("paid");
    expect(db.table("invoices").find((row) => row.$id === hotel.$id)?.status).toBe("sent");
    expect(txns().find((row) => String(row.narration).includes("HOTEL"))?.matchStatus).toBe("suggested");
    expect(txns().find((row) => row.matchKind === "unknown")?.matchStatus).toBe("unmatched");
    expect(gupta().status).toBe("sent");
  });

  it("imports a CSV a second time, in another order, as already imported", async () => {
    const csv = `date,narration,utr,amount
2026-11-01,UPI GUPTA TRADERS,609812345678,"₹60,000.00"
2026-11-01,UPI ROY FURNISHINGS,609800000001,"₹500.00"
`;
    const reversed = csv.split("\n").slice(0, 1).concat(csv.trim().split("\n").slice(1).reverse()).join("\n") + "\n";
    expect(await (await post("/api/bank/import", { csv })).json()).toMatchObject({ added: 2, already: 0 });
    expect(await (await post("/api/bank/import", { csv: reversed })).json()).toMatchObject({
      added: 0,
      already: 2,
      summary: "2 already imported, 0 new",
    });
  });

  it("refuses an import with no session", async () => {
    const res = await app.request("/api/bank/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sample: true }),
    });
    expect(res.status).toBe(401);
  });
});
