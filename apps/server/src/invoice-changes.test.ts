import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import type { Mail, Mailer } from "./email.ts";
import { memoryFiles, memoryStore } from "./memory-store.ts";
import { payTokens } from "./pay-token.ts";

const USERS: Record<string, string> = { "jwt-asha": "64f0c2a91be7d3e85f10", "jwt-ravi": "7a1b2c3d4e5f60718293" };
const TODAY = "2026-11-02";

let db: ReturnType<typeof memoryStore>;
let app: ReturnType<typeof createApp>;
let mails: Mail[];

beforeEach(async () => {
  db = memoryStore();
  mails = [];
  const pending: Promise<void>[] = [];
  const mailer: Mailer = {
    async send(mail) {
      mails.push(mail);
      return { ok: true, id: `msg_${mails.length}` };
    },
  };
  let runs = 0;
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
    ladder: { mailer, demoInbox: "demo-inbox@example.com", webOrigin: "https://tagada.example", runId: () => `run${++runs}` },
  });
  await app.request("/api/demo/start", { method: "POST", headers: { authorization: "Bearer jwt-asha" } });
  while (pending.length) await pending.shift();
});

const post = (path: string, body: unknown, jwt: string | null = "jwt-asha") =>
  app.request(path, {
    method: "POST",
    headers: { ...(jwt ? { authorization: `Bearer ${jwt}` } : {}), "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const invoice = (id: string) => db.table("invoices").find((row) => row.$id === id)!;
const eventsOf = (id: string) => db.table("events").filter((row) => row.invoiceId === id);
const customerId = (name: string) => db.table("customers").find((row) => row.name === name)!.$id;

const chair = { description: "Cane lounge chair", hsn: "940382", quantity: 1, ratePaise: 1_000_000, discountPercent: 0, gstRatePercent: 18 };

/** A fresh Invoice to Gupta Traders (another state, so IGST): ₹11,800 with nothing paid. */
async function fresh(): Promise<string> {
  const res = await post("/api/invoices", { customerId: customerId("Gupta Traders"), lines: [chair] });
  expect(res.status).toBe(200);
  return ((await res.json()) as { invoice: { $id: string } }).invoice.$id;
}

describe("POST /api/invoices/:id/payment", () => {
  it("is 401 without a session", async () => {
    const id = await fresh();
    const res = await post(`/api/invoices/${id}/payment`, { amountPaise: 100_000, date: TODAY, mode: "cash" }, null);
    expect(res.status).toBe(401);
    expect(invoice(id).paidPaise).toBe(0);
  });

  it("records part of it in cash, then the rest by UPI, and the Invoice is paid", async () => {
    const id = await fresh();
    expect(invoice(id).totalPaise).toBe(1_180_000);
    const part = await post(`/api/invoices/${id}/payment`, { amountPaise: 500_000, date: TODAY, mode: "cash" });
    expect(part.status).toBe(200);
    expect(await part.json()).toEqual({ status: "part", paidPaise: 500_000, totalPaise: 1_180_000 });
    expect(invoice(id)).toMatchObject({ status: "part", paidPaise: 500_000 });

    const rest = await post(`/api/invoices/${id}/payment`, { amountPaise: 680_000, date: TODAY, mode: "upi", reference: "UTR 123456789012" });
    expect(await rest.json()).toEqual({ status: "paid", paidPaise: 1_180_000, totalPaise: 1_180_000 });

    const payments = eventsOf(id).filter((e) => e.type === "payment");
    expect(payments).toHaveLength(2);
    expect(payments.map((e) => JSON.parse(e.payload as string))).toEqual([
      { amountPaise: 500_000, mode: "cash", date: TODAY, reference: null },
      { amountPaise: 680_000, mode: "upi", date: TODAY, reference: "UTR 123456789012" },
    ]);
    expect(payments[1]).toMatchObject({ actor: "owner" });
    expect(payments[1]?.summary).toBe("Recorded ₹6,800 received by UPI on 2 Nov (UTR 123456789012). This Invoice is paid in full.");
  });

  it("dates the event the day the money came", async () => {
    const saha = db.table("invoices").find((row) => row.customerId === customerId("Saha Furniture Mart") && row.status !== "paid")!;
    const res = await post(`/api/invoices/${saha.$id}/payment`, { amountPaise: 1_000, date: "2026-10-30", mode: "cheque" });
    expect(res.status).toBe(200);
    const event = eventsOf(saha.$id).find((e) => e.type === "payment" && String(e.summary).startsWith("Recorded"));
    expect(event?.at).toMatch(/^2026-10-30T/);
  });

  it("refuses more than is owed, a date after the Demo date or before the issue date, an unknown mode and no amount", async () => {
    const id = await fresh();
    const cases: [Record<string, unknown>, string][] = [
      [{ amountPaise: 1_180_001 }, "more_than_owed"],
      [{ amountPaise: 0 }, "invalid_amount"],
      [{ amountPaise: 10.5 }, "invalid_amount"],
      [{ date: "2026-11-03" }, "invalid_date"],
      [{ date: "2026-11-01" }, "invalid_date"],
      [{ date: "2 Nov" }, "invalid_date"],
      [{ mode: "barter" }, "invalid_mode"],
      [{ reference: "x".repeat(65) }, "invalid_reference"],
    ];
    for (const [patch, error] of cases) {
      const res = await post(`/api/invoices/${id}/payment`, { amountPaise: 100_000, date: TODAY, mode: "cash", ...patch });
      expect(res.status, JSON.stringify(patch)).toBe(400);
      expect(await res.json()).toEqual({ error });
    }
    expect(invoice(id).paidPaise).toBe(0);
  });

  it("refuses a paid Invoice, and another visitor's", async () => {
    const id = await fresh();
    await post(`/api/invoices/${id}/payment`, { amountPaise: 1_180_000, date: TODAY, mode: "bank_transfer" });
    const again = await post(`/api/invoices/${id}/payment`, { amountPaise: 1, date: TODAY, mode: "cash" });
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "not_open" });

    const other = await fresh();
    const theirs = await post(`/api/invoices/${other}/payment`, { amountPaise: 1, date: TODAY, mode: "cash" }, "jwt-ravi");
    expect(theirs.status).toBe(404);
    expect(invoice(other).paidPaise).toBe(0);
  });
});

describe("POST /api/invoices/:id/cancel", () => {
  it("cancels an unpaid Invoice: the number stays used, the pay link says so, and the next Invoice takes the next number", async () => {
    const id = await fresh();
    const number = invoice(id).number as string;
    const res = await post(`/api/invoices/${id}/cancel`, { reason: "Raised twice by mistake" });
    expect(res.status).toBe(200);
    expect(invoice(id)).toMatchObject({ status: "cancelled", number, pauseReason: "cancelled" });
    const event = eventsOf(id).find((e) => e.type === "cancelled");
    expect(event?.summary).toBe(`Invoice cancelled: "Raised twice by mistake". Its number ${number} stays used, and nothing more is sent.`);

    const slip = await app.request(`/api/pay/${invoice(id).payToken as string}`);
    expect(await slip.json()).toMatchObject({ state: "cancelled", invoice: { balancePaise: 0 } });
    const claim = await app.request(`/api/pay/${invoice(id).payToken as string}/paid`, { method: "POST" });
    expect(claim.status).toBe(409);
    expect(await claim.json()).toEqual({ error: "already_cancelled" });

    const next = await fresh();
    const serial = (n: string) => Number(n.split("/").pop());
    expect(serial(invoice(next).number as string)).toBe(serial(number) + 1);
  });

  it("stops the Ladder for it", async () => {
    const saha = db.table("invoices").find((row) => row.customerId === customerId("Saha Furniture Mart") && row.status !== "paid")!;
    expect(saha.paidPaise).toBe(0);
    await post(`/api/invoices/${saha.$id}/cancel`, { reason: "Goods returned" });
    const run = await post("/api/ladder/run", { date: "2026-11-05" });
    expect(run.status).toBe(200);
    expect(mails.filter((mail) => mail.subject.includes(saha.number as string))).toEqual([]);
    expect(db.table("reminders").filter((r) => r.invoiceId === saha.$id && r.sentDate === "2026-11-05")).toEqual([]);
  });

  it("refuses one with money paid against it, one already cancelled, and no reason", async () => {
    const id = await fresh();
    const noReason = await post(`/api/invoices/${id}/cancel`, { reason: "  " });
    expect(noReason.status).toBe(400);
    await post(`/api/invoices/${id}/payment`, { amountPaise: 100, date: TODAY, mode: "cash" });
    const paid = await post(`/api/invoices/${id}/cancel`, { reason: "Wrong" });
    expect(paid.status).toBe(409);
    expect(await paid.json()).toEqual({ error: "has_payments" });

    const other = await fresh();
    await post(`/api/invoices/${other}/cancel`, { reason: "Wrong" });
    const twice = await post(`/api/invoices/${other}/cancel`, { reason: "Wrong" });
    expect(await twice.json()).toEqual({ error: "already_cancelled" });
  });
});

describe("POST /api/invoices/:id/edit", () => {
  it("replaces the lines, works the totals out again and moves the due date; the number stays", async () => {
    const id = await fresh();
    const number = invoice(id).number;
    const res = await post(`/api/invoices/${id}/edit`, {
      lines: [
        { ...chair, quantity: 2, unit: "pcs" },
        { description: "Bamboo mat", hsn: "4601", quantity: 2.5, ratePaise: 40_000, gstRatePercent: 5, unit: "m" },
      ],
      dueDate: "2026-12-15",
      totalPaise: 1,
    });
    expect(res.status).toBe(200);
    // 2 × ₹10,000 at 18% IGST = ₹23,600; 2.5 m × ₹400 at 5% = ₹1,050.
    expect(invoice(id)).toMatchObject({ number, taxablePaise: 2_100_000, igstPaise: 365_000, totalPaise: 2_465_000, dueDate: "2026-12-15" });
    const lines = db.table("invoice_lines").filter((row) => row.invoiceId === id);
    expect(lines.map((line) => [line.description, line.qtyMilli, line.unit ?? null])).toEqual([
      ["Cane lounge chair", 2000, "pcs"],
      ["Bamboo mat", 2500, "m"],
    ]);
    const event = eventsOf(id).find((e) => e.type === "edited");
    expect(event?.summary).toBe("Invoice corrected: total ₹11,800 → ₹24,650; due 15 Dec.");
  });

  it("refuses a part-paid or cancelled Invoice, a due date before the issue date, and a bad line", async () => {
    const id = await fresh();
    const body = { lines: [chair], dueDate: "2026-12-01" };
    expect((await post(`/api/invoices/${id}/edit`, { ...body, dueDate: "2026-11-01" })).status).toBe(400);
    expect((await post(`/api/invoices/${id}/edit`, { ...body, lines: [{ ...chair, hsn: "12" }] })).status).toBe(400);
    await post(`/api/invoices/${id}/payment`, { amountPaise: 100, date: TODAY, mode: "cash" });
    const part = await post(`/api/invoices/${id}/edit`, body);
    expect(part.status).toBe(409);
    expect(await part.json()).toEqual({ error: "not_editable" });

    const other = await fresh();
    await post(`/api/invoices/${other}/cancel`, { reason: "Wrong" });
    expect((await post(`/api/invoices/${other}/edit`, body)).status).toBe(409);
    expect(db.table("invoice_lines").filter((row) => row.invoiceId === other)).toHaveLength(1);
  });

  it("cannot touch another visitor's Invoice", async () => {
    const id = await fresh();
    const res = await post(`/api/invoices/${id}/edit`, { lines: [chair], dueDate: "2026-12-01" }, "jwt-ravi");
    expect(res.status).toBe(404);
  });
});
