import { describe, expect, it } from "vitest";
import { dsoOn, impact, MINUTES_PER_CHASE, type ImpactEvent, type ImpactInput } from "./impact.ts";
import type { BookInvoice } from "./today.ts";

const invoice = (id: string, issueDate: string, dueDate: string, totalPaise: number, status: BookInvoice["status"] = "sent"): BookInvoice => ({
  $id: id,
  customerId: `c${id}`,
  number: `N/${id}`,
  issueDate,
  dueDate,
  totalPaise,
  paidPaise: 0,
  status,
  ladderStage: 0,
  pausedUntil: null,
  pauseReason: null,
});

const paid = (invoiceId: string, date: string, amountPaise: number, tdsPaise?: number): ImpactEvent => ({
  invoiceId,
  type: "payment",
  actor: "owner",
  date,
  amountPaise,
  ...(tdsPaise === undefined ? {} : { tdsPaise }),
});

function input(over: Partial<ImpactInput>): ImpactInput {
  return { today: "2026-11-09", since: "2026-11-02", customers: [], invoices: [], events: [], promises: [], ...over };
}

describe("dsoOn", () => {
  it("is owed ÷ the 3 months' sales × their days, ignoring drafts and cancelled Invoices", () => {
    const invoices = [
      invoice("a", "2026-10-01", "2026-10-31", 100_000),
      invoice("b", "2026-06-01", "2026-07-01", 50_000),
      invoice("c", "2026-10-02", "2026-11-01", 900_000, "cancelled"),
      invoice("d", "2026-10-03", "2026-11-02", 900_000, "draft"),
    ];
    // Owed ₹1,500 (₹1,000 + the old ₹500); sold ₹1,000 from 2 Aug to 1 Nov, 92 days.
    expect(dsoOn(invoices, [], "2026-11-01")).toEqual({
      date: "2026-11-01",
      from: "2026-08-02",
      windowDays: 92,
      owedPaise: 150_000,
      salesPaise: 100_000,
      days: 138,
    });
  });

  it("takes off payments and TDS made by then, and nothing after", () => {
    const invoices = [invoice("a", "2026-10-01", "2026-10-31", 100_000)];
    const events = [paid("a", "2026-10-20", 40_000, 2_000), paid("a", "2026-11-05", 58_000)];
    expect(dsoOn(invoices, events, "2026-11-01").owedPaise).toBe(58_000);
    expect(dsoOn(invoices, events, "2026-11-05")).toMatchObject({ owedPaise: 0, days: 0 });
  });

  it("is null when nothing was invoiced in the 3 months", () => {
    expect(dsoOn([invoice("b", "2026-01-01", "2026-01-31", 50_000)], [], "2026-11-01").days).toBeNull();
  });
});

describe("money brought forward", () => {
  // Paid 20 days late on the first Invoice, so the habit is 20 days late.
  const history = [invoice("old", "2026-06-01", "2026-07-01", 10_000, "paid")];
  const habit = [{ ...paid("old", "2026-07-21", 10_000), invoiceId: "old" }];
  const sameCustomer = (i: BookInvoice) => ({ ...i, customerId: "cold" });

  it("counts a payment whose usual day falls after this month", () => {
    const late = sameCustomer(invoice("x", "2026-10-20", "2026-11-19", 70_000));
    const result = impact(input({ invoices: [...history.map(sameCustomer), late], events: [...habit, paid("x", "2026-11-05", 70_000)] }));
    expect(result.forward.rows).toEqual([
      expect.objectContaining({ invoiceId: "x", countedPaise: 70_000, avgDelayDays: 20, usualDate: "2026-12-09", why: "later" }),
    ]);
  });

  it("leaves out a payment that came on its usual day inside this month", () => {
    const due = sameCustomer(invoice("y", "2026-10-01", "2026-10-31", 70_000));
    // Usually 20 days late: 20 Nov, inside November.
    const result = impact(input({ invoices: [...history.map(sameCustomer), due], events: [...habit, paid("y", "2026-11-05", 70_000)] }));
    expect(result.forward.rows).toEqual([]);
  });

  it("leaves out a payment made before Tagada started, or in another month", () => {
    const late = sameCustomer(invoice("x", "2026-10-20", "2026-11-19", 70_000));
    const events = [...habit, paid("x", "2026-11-01", 30_000), paid("x", "2026-11-03", 40_000)];
    const invoices = [...history.map(sameCustomer), late];
    expect(impact(input({ invoices, events })).forward.totalPaise).toBe(40_000);
    expect(impact(input({ invoices, events, today: "2026-12-01" })).forward.totalPaise).toBe(0);
  });

  it("counts a Plan agreed since Tagada started for its instalments in this month, at most what was owed", () => {
    const old = invoice("z", "2026-08-01", "2026-08-31", 50_000);
    const result = impact(
      input({
        invoices: [old],
        events: [{ invoiceId: "z", type: "plan_accepted", actor: "customer", date: "2026-11-03", promiseId: "p1" }],
        promises: [
          {
            $id: "p1",
            invoiceId: "z",
            status: "approved",
            instalments: [
              { amountPaise: 60_000, date: "2026-11-20" },
              { amountPaise: 10_000, date: "2026-12-10" },
            ],
          },
          // Agreed before Tagada started: not Tagada's doing.
          { $id: "p0", invoiceId: "z", status: "approved", instalments: [{ amountPaise: 50_000, date: "2026-11-04" }] },
        ],
      }),
    );
    // No paid history, so the usual day is the due date, which had gone by.
    expect(result.forward.rows).toEqual([expect.objectContaining({ promisedPaise: 60_000, countedPaise: 50_000, why: "passed" })]);
  });
});

describe("chasing and its cost", () => {
  const events: ImpactEvent[] = [
    { invoiceId: "a", type: "reminder", actor: "workflow", date: "2026-11-03", channel: "email" },
    { invoiceId: "a", type: "reminder", actor: "owner", date: "2026-11-04", channel: "whatsapp_link" },
    { invoiceId: "b", type: "reminder", actor: "owner", date: "2026-11-04", channel: "email" },
    // One call writes its outcome and its close, with the credits on the close.
    { invoiceId: "c", type: "call_plan", actor: "ai", date: "2026-11-05", callId: "k1" },
    { invoiceId: "c", type: "call", actor: "ai", date: "2026-11-05", callId: "k1", credits: 1005 },
    { invoiceId: "c", type: "call", actor: "ai", date: "2026-10-20" },
    paid("c", "2026-11-06", 6_000_000, 10_000),
  ];
  const result = impact(input({ events }));

  it("counts the Ladder's Reminders and Munim's calls since Tagada started, not the Owner's own", () => {
    expect(result.chasing).toEqual({ reminders: 1, calls: 1, minutesPerChase: MINUTES_PER_CHASE, minutes: 30 });
  });

  it("prices every email sent and the call's credits against the cash collected", () => {
    // 2 emails ₹0.07, the call ₹19.46: ₹19.53 to collect ₹60,000 is 3 paise per ₹100.
    expect(result.cost).toEqual({
      emails: 2,
      emailPaise: 7,
      calls: 1,
      callPaise: 1946,
      costPaise: 1953,
      collectedPaise: 6_000_000,
      perHundredPaise: 3,
    });
  });
});
