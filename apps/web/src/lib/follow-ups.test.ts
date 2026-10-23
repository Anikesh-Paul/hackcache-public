import { describe, expect, it } from "vitest";
import type { CustomerRow, EventRow, InvoiceRow, ReminderRow } from "@tagada/appwrite";
import { followUps, type FollowUpInput } from "./follow-ups.ts";

const customer = (id: string, name: string, over: Partial<CustomerRow> = {}): CustomerRow => ({
  $id: id,
  workspaceId: "w1",
  name,
  address: null,
  gstin: null,
  stateCode: "19",
  place: "Kolkata",
  phone: null,
  email: null,
  buyerType: "goods",
  creditDays: 30,
  avgDelayDays: null,
  grade: null,
  gradeReason: null,
  consentCalls: false,
  consentAt: null,
  lang: "en",
  gender: "neutral",
  ...over,
});

const invoice = (id: string, customerId: string, over: Partial<InvoiceRow> = {}): InvoiceRow => ({
  $id: id,
  workspaceId: "w1",
  number: `TBW/26-27/${id}`,
  docType: "tax_invoice",
  customerId,
  issueDate: "2026-08-26",
  dueDate: "2026-09-25",
  agreedDueDate: null,
  taxablePaise: 11_238_100,
  cgstPaise: 0,
  sgstPaise: 0,
  igstPaise: 561_905,
  roundOffPaise: -5,
  totalPaise: 11_800_000,
  paidPaise: 0,
  status: "sent",
  ladderStage: 3,
  pausedUntil: null,
  pauseReason: null,
  payToken: `tok-${id}`,
  ...over,
});

const reminder = (invoiceId: string, customerId: string, stage: number, over: Partial<ReminderRow>): ReminderRow => ({
  $id: `rem_${invoiceId}_s${stage}`,
  workspaceId: "w1",
  invoiceId,
  customerId,
  sentDate: "2026-11-02",
  stage,
  channel: "email",
  status: "sent",
  attempts: 1,
  providerMessageId: null,
  error: null,
  runId: "run1",
  ...over,
});

const base = (over: Partial<FollowUpInput> = {}): FollowUpInput => ({
  workspace: { today: "2026-11-02", autoSendStages: [1, 2], businessName: "Tripura Bamboo Works", ownerEmail: "owner@example.com" },
  invoices: [invoice("0019", "gupta")],
  customers: new Map([
    ["gupta", customer("gupta", "Gupta Traders", { consentCalls: true, lang: "hi" })],
    ["saha", customer("saha", "Saha Furniture Mart")],
    ["paul", customer("paul", "Paul Gift House")],
  ]),
  promisesByInvoice: new Map(),
  reminders: [],
  events: [],
  payUrl: (token) => `https://tagada.example/pay/${token}`,
  ...over,
});

describe("followUps", () => {
  it("offers the Owner the stage the Ladder wants, with a ready message, WhatsApp and email, and the call when agreed", () => {
    const [gupta] = followUps(base());
    expect(gupta).toMatchObject({
      invoiceId: "0019",
      customerName: "Gupta Traders",
      stage: 4,
      stageName: "Firm reminder",
      state: "ready",
      canCall: true,
      amountPaise: 11_800_000,
    });
    expect(gupta?.text).toContain("https://tagada.example/pay/tok-0019");
    expect(gupta?.text).toMatch(/[ऀ-ॿ]/);
    expect(gupta?.whatsapp).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(gupta?.mailto).toMatch(/^mailto:\?subject=/);
  });

  it("shows an automatic stage the run has not reached yet as going out with the daily run", () => {
    const [saha] = followUps(base({ invoices: [invoice("0029", "saha", { dueDate: "2026-11-05", ladderStage: 0 })] }));
    expect(saha).toMatchObject({ stage: 1, state: "due", stageName: "Friendly heads-up" });
  });

  it("marks what the daily run already sent today, with the time it went", () => {
    const sent = invoice("0029", "saha", { dueDate: "2026-11-05", ladderStage: 1 });
    const event: EventRow = {
      $id: "rem_0029_s1e",
      workspaceId: "w1",
      invoiceId: "0029",
      at: "2026-11-02T10:00:04.000+05:30",
      type: "reminder",
      actor: "workflow",
      summary: "Friendly heads-up sent by email",
      payload: null,
    };
    const [saha] = followUps(base({ invoices: [sent], reminders: [reminder("0029", "saha", 1, {})], events: [event] }));
    expect(saha).toMatchObject({ stage: 1, state: "sent", sentAt: "10:00", channel: "email" });
  });

  it("lists a failed send first, with its retry, and a stage switched off as ready", () => {
    const paul = invoice("0030", "paul", { dueDate: "2026-11-05", ladderStage: 0 });
    const list = followUps(
      base({
        invoices: [invoice("0019", "gupta"), paul],
        reminders: [reminder("0030", "paul", 1, { status: "failed", error: "Resend 500", attempts: 1 })],
      }),
    );
    expect(list.map((f) => [f.customerName, f.state])).toEqual([
      ["Paul Gift House", "failed"],
      ["Gupta Traders", "ready"],
    ]);
  });

  it("says a capped message rolls to tomorrow, and never shows a Reminder's key or stage number", () => {
    const list = followUps(
      base({
        invoices: [invoice("0029", "saha", { dueDate: "2026-11-05", ladderStage: 0 })],
        reminders: [reminder("0029", "saha", 1, { status: "skipped_cap", attempts: 0 })],
      }),
    );
    expect(list[0]?.state).toBe("capped");
    for (const f of list) {
      for (const shown of [f.stageName, f.subject, f.text, f.error ?? ""]) expect(shown).not.toMatch(/rem_|stage \d/i);
    }
  });

  it("holds a Customer's next step until tomorrow once they had a message today", () => {
    const list = followUps(
      base({
        invoices: [invoice("0019", "gupta", { ladderStage: 4, dueDate: "2026-09-25" })],
        reminders: [reminder("0019", "gupta", 4, { channel: "whatsapp_link", runId: null })],
      }),
    );
    expect(list.map((f) => [f.stage, f.state])).toEqual([
      [5, "capped"],
      [4, "sent"],
    ]);
  });

  it("leaves out paid, disputed and paused Invoices", () => {
    const list = followUps(
      base({
        invoices: [
          invoice("a", "gupta", { status: "paid", paidPaise: 11_800_000 }),
          invoice("b", "gupta", { status: "disputed" }),
          invoice("c", "gupta"),
        ],
        promisesByInvoice: new Map([["c", [{ status: "approved", instalments: [{ amountPaise: 1, date: "2026-11-20" }] }]]]),
      }),
    );
    expect(list).toEqual([]);
  });
});
