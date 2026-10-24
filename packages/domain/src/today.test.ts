import { describe, expect, it } from "vitest";
import { differencePaise, sumPaise } from "@tagada/money";
import {
  AGEING_BUCKETS,
  CHASE_WHY,
  ageingBucket,
  expectedNewSales,
  payPackets,
  salaryDayIn,
  todayBook,
  type BookInput,
  type BookInvoice,
} from "./index.ts";

const TODAY = "2026-11-02"; // a Monday

function invoice(id: string, over: Partial<BookInvoice> = {}): BookInvoice {
  return {
    $id: id,
    customerId: "c1",
    number: `TBW/26-27/${id}`,
    issueDate: "2026-10-01",
    dueDate: "2026-10-31",
    totalPaise: 1_000_000,
    paidPaise: 0,
    status: "sent",
    ladderStage: 0,
    pausedUntil: null,
    pauseReason: null,
    ...over,
  };
}

/** A small book: ₹50,000 in the bank, ₹1,00,000 salaries on Tue 10 Nov, nothing owed. */
function book(over: Partial<BookInput> = {}): BookInput {
  return {
    today: TODAY,
    openingCashPaise: 5_000_000,
    customers: [
      { $id: "c1", name: "Alpha Stores", consentCalls: false },
      { $id: "c2", name: "Beta Traders", consentCalls: true },
    ],
    invoices: [],
    promises: [],
    events: [],
    bankCredits: [],
    cashItems: [
      { kind: "salary", label: "Salaries", amountPaise: 10_000_000, date: "2026-11-10", recurrence: "monthly" },
    ],
    ...over,
  };
}

/** A paid Invoice `late` days after its due date, so the Customer has a habit. */
function paidLate(id: string, customerId: string, late: number) {
  const due = "2026-08-31";
  const day = new Date(Date.UTC(2026, 7, 31 + late)).toISOString().slice(0, 10);
  return {
    invoice: invoice(id, { customerId, issueDate: "2026-08-01", dueDate: due, status: "paid", paidPaise: 1_000_000 }),
    event: { invoiceId: id, type: "payment", date: day },
  };
}

describe("expected receipts", () => {
  it("expects an open Invoice on its due date plus the Customer's usual delay", () => {
    const history = paidLate("h1", "c1", 6);
    const b = todayBook(
      book({
        invoices: [history.invoice, invoice("i1", { dueDate: "2026-11-03" })],
        events: [history.event],
      }),
    );
    expect(b.receipts).toEqual([
      expect.objectContaining({ invoiceId: "i1", date: "2026-11-09", amountPaise: 1_000_000, basis: "usual" }),
    ]);
  });

  it("counts an approved Promise on its own dates instead", () => {
    const b = todayBook(
      book({
        invoices: [invoice("i1")],
        promises: [
          {
            invoiceId: "i1",
            status: "approved",
            instalments: [
              { amountPaise: 600_000, date: "2026-11-06" },
              { amountPaise: 400_000, date: "2026-12-02" },
            ],
          },
        ],
      }),
    );
    expect(b.receipts.map((r) => [r.date, r.amountPaise, r.basis])).toEqual([
      ["2026-11-06", 600_000, "promise"],
      ["2026-12-02", 400_000, "promise"],
    ]);
  });

  it("does not count a Dispute, an Invoice later than the Customer usually pays, or money already in the bank", () => {
    const b = todayBook(
      book({
        invoices: [
          invoice("disputed", { status: "disputed", dueDate: "2026-11-20" }),
          invoice("late", { dueDate: "2026-09-25" }),
          invoice("banked", { dueDate: "2026-11-20" }),
          invoice("part", { dueDate: "2026-11-20" }),
        ],
        bankCredits: [
          {
            matchStatus: "suggested",
            allocations: [
              { invoiceId: "banked", amountPaise: 980_000, tdsPaise: 20_000 },
              { invoiceId: "part", amountPaise: 300_000 },
            ],
          },
          // Not matched yet, so it says nothing about which Invoice it pays.
          { matchStatus: "unmatched", allocations: [{ invoiceId: "late", amountPaise: 1_000_000 }] },
        ],
      }),
    );
    expect(b.receipts).toEqual([expect.objectContaining({ invoiceId: "part", amountPaise: 700_000 })]);
    const why = Object.fromEntries(b.receivables.map((r) => [r.invoiceId, r.counted]));
    expect(why).toEqual({ disputed: "disputed", late: "later_than_usual", banked: "in_bank", part: "usual" });
    expect(b.receivables.find((r) => r.invoiceId === "banked")).toMatchObject({
      balancePaise: 1_000_000,
      inBankPaise: 1_000_000,
      toComePaise: 0,
    });
  });
});

describe("13-week forecast", () => {
  it("has 13 weeks from the Demo date, each closing on the last plus what came in less what went out", () => {
    const b = todayBook(
      book({
        invoices: [invoice("i1", { dueDate: "2026-11-04" })],
        cashItems: [
          { kind: "salary", label: "Salaries", amountPaise: 10_000_000, date: "2026-11-10", recurrence: "monthly" },
          { kind: "rent", label: "Rent", amountPaise: 1_800_000, date: "2026-10-05", recurrence: "monthly" },
          { kind: "supplier", label: "Bamboo", amountPaise: 500_000, date: "2026-11-07", recurrence: null },
        ],
      }),
    );
    expect(b.weeks).toHaveLength(13);
    expect(b.weeks[0]).toMatchObject({ start: "2026-11-02", end: "2026-11-08", inPaise: 1_000_000, salary: false });
    // rent 5 Nov + bamboo 7 Nov
    expect(b.weeks[0]).toMatchObject({ outPaise: 2_300_000, closePaise: 3_700_000 });
    expect(b.weeks[1]).toMatchObject({ start: "2026-11-09", outPaise: 10_000_000, closePaise: -6_300_000, salary: true });
    expect(b.weeks[12]?.end).toBe("2027-01-31");
    // Monthly items repeat: salaries on 10 Nov, 10 Dec and 10 Jan; rent on 5 Nov, 5 Dec and 5 Jan.
    expect(b.outflows.filter((o) => o.kind === "salary").map((o) => o.date)).toEqual([
      "2026-11-10",
      "2026-12-10",
      "2027-01-10",
    ]);
    expect(b.outflows.filter((o) => o.kind === "rent").map((o) => o.date)).toEqual([
      "2026-11-05",
      "2026-12-05",
      "2027-01-05",
    ]);
    let cash = 5_000_000;
    for (const week of b.weeks) {
      cash = differencePaise(sumPaise([cash, week.inPaise, week.newSalesPaise]), week.outPaise);
      expect(week.closePaise).toBe(cash);
    }
  });
});

describe("salary day", () => {
  it("is the next salary payment, with the cash left after it and the working", () => {
    const b = todayBook(book({ invoices: [invoice("i1", { dueDate: "2026-11-04" })] }));
    expect(b.salary).toMatchObject({
      date: "2026-11-10",
      daysAway: 8,
      salaryPaise: 10_000_000,
      cashAfterPaise: -4_000_000,
    });
    expect(b.salary?.receipts.map((r) => r.invoiceId)).toEqual(["i1"]);
    expect(b.salary?.outflows.map((o) => o.label)).toEqual(["Salaries"]);
  });

  it("is null when there is no salary in the books", () => {
    expect(todayBook(book({ cashItems: [] })).salary).toBeNull();
  });

  it("flips when a Promise arrives before it", () => {
    const owed = book({ invoices: [invoice("i1", { dueDate: "2026-09-25", totalPaise: 9_000_000 })] });
    expect(todayBook(owed).salary?.cashAfterPaise).toBe(-5_000_000);
    const promised = todayBook({
      ...owed,
      promises: [{ invoiceId: "i1", status: "approved", instalments: [{ amountPaise: 6_000_000, date: "2026-11-06" }] }],
    });
    expect(promised.salary?.cashAfterPaise).toBe(1_000_000);
  });
});

describe("cash on the Demo date", () => {
  const credit = (date: string, amountPaise: number, matchStatus: "suggested" | "confirmed" = "confirmed") => ({
    date,
    amountPaise,
    matchStatus,
    allocations: [],
  });

  it("is the opening balance, plus credits since its date, less what has already gone out", () => {
    const b = todayBook(
      book({
        today: "2026-11-09",
        cashAsOf: "2026-11-02",
        // 30 Oct is in the opening balance already; 6 Nov came in since.
        bankCredits: [credit("2026-10-30", 1_000_000), credit("2026-11-06", 6_000_000, "suggested")],
        cashItems: [
          { kind: "salary", label: "Salaries", amountPaise: 10_000_000, date: "2026-11-10", recurrence: "monthly" },
          { kind: "rent", label: "Rent", amountPaise: 1_800_000, date: "2026-11-05", recurrence: null },
        ],
      }),
    );
    expect(b.cashTodayPaise).toBe(9_200_000);
    expect(b.salary?.cashAfterPaise).toBe(-800_000);
    expect(b.weeks[0]?.closePaise).toBe(-800_000);
  });

  it("is the opening balance when the books do not say when it was counted", () => {
    const b = todayBook(book({ bankCredits: [credit("2026-11-06", 6_000_000)] }));
    expect(b.cashTodayPaise).toBe(5_000_000);
  });
});

describe("salaryDayIn", () => {
  it("says today, tomorrow, or in so many days", () => {
    expect(salaryDayIn(0)).toBe("Salary day today");
    expect(salaryDayIn(1)).toBe("Salary day tomorrow");
    expect(salaryDayIn(8)).toBe("Salary day in 8 days");
  });
});

describe("expected new sales", () => {
  // ₹13,00,000 invoiced in the 3 months before 2 Nov: ₹1,00,000 a week.
  const recent = [
    invoice("n1", { issueDate: "2026-08-10", totalPaise: 6_500_000, status: "paid", paidPaise: 6_500_000 }),
    invoice("n2", { issueDate: "2026-10-20", totalPaise: 6_500_000 }),
    invoice("old", { issueDate: "2026-07-01", totalPaise: 9_900_000, status: "paid", paidPaise: 9_900_000 }),
    invoice("draft", { issueDate: "2026-10-25", totalPaise: 9_900_000, status: "draft" }),
  ];

  it("is a week's share of the last 3 months' invoicing, from when new Invoices would be paid", () => {
    expect(expectedNewSales(recent, TODAY, 30)).toEqual({ weeklyPaise: 1_000_000, fromDate: "2026-12-02" });
  });

  it("is an estimate, so it is rounded to ₹100", () => {
    const odd = [invoice("o1", { issueDate: "2026-10-20", totalPaise: 1_234_567 })];
    expect(expectedNewSales(odd, TODAY, 30).weeklyPaise).toBe(90_000); // ₹12,345.67 / 13 = ₹949.67
  });

  it("waits 30 days when the books do not know how long Customers take", () => {
    expect(expectedNewSales(recent, TODAY, null).fromDate).toBe("2026-12-02");
  });

  it("adds to the forecast weeks from that date, but never to the salary-day headline", () => {
    const b = todayBook(book({ invoices: recent }));
    expect(b.weeks[12]?.newSalesPaise).toBe(1_000_000);
    expect(b.weeks[0]?.newSalesPaise).toBe(0);
    expect(b.newSales.weeklyPaise).toBe(1_000_000);
    expect(b.salary?.cashAfterPaise).toBe(todayBook(book()).salary?.cashAfterPaise);
    let cash = 5_000_000;
    for (const week of b.weeks) {
      cash = differencePaise(sumPaise([cash, week.inPaise, week.newSalesPaise]), week.outPaise);
      expect(week.closePaise).toBe(cash);
    }
  });
});

describe("pay packets", () => {
  it("says about how much each holds, and how full each one is", () => {
    const packets = payPackets({ salaryPaise: 15_800_000, cashAfterPaise: -4_800_000 }, 9);
    expect(packets.aboutEachPaise).toBe(1_750_000);
    expect(packets.fundedPaise).toBe(11_000_000);
    expect(packets.full).toBe(6);
    expect(packets.fills.map((f) => Math.round(f * 100))).toEqual([100, 100, 100, 100, 100, 100, 27, 0, 0]);
    expect(payPackets({ salaryPaise: 15_800_000, cashAfterPaise: 1_200_000 }, 9).full).toBe(9);
  });
});

describe("totals and Ageing", () => {
  it("adds up what is owed, overdue, expected and due out in the next 30 days", () => {
    const b = todayBook(
      book({
        invoices: [
          invoice("i1", { dueDate: "2026-11-04" }),
          invoice("i2", { dueDate: "2026-10-01", totalPaise: 500_000 }),
          invoice("paid", { status: "paid", paidPaise: 1_000_000 }),
        ],
      }),
    );
    expect(b.totals).toMatchObject({
      receivablesPaise: 1_500_000,
      receivablesCount: 2,
      overduePaise: 500_000,
      overdueCount: 1,
      expectedPaise: 1_000_000,
      expectedUntil: "2026-12-01",
      upcomingPaise: 10_000_000,
    });
  });

  it("puts not-yet-due Invoices in 0–30 and sorts the rest by whole days past due", () => {
    expect(AGEING_BUCKETS.map((b) => b.label)).toEqual(["0–30", "31–60", "61–90", "90+"]);
    expect([0, 30, 31, 60, 61, 90, 91, 112].map((d) => ageingBucket(d))).toEqual([
      "0-30",
      "0-30",
      "31-60",
      "31-60",
      "61-90",
      "61-90",
      "90+",
      "90+",
    ]);
  });

  it("has Ageing buckets that sum to total receivables", () => {
    const b = todayBook(
      book({
        invoices: [
          invoice("a", { dueDate: "2026-11-20" }),
          invoice("b", { dueDate: "2026-09-25", totalPaise: 2_000_000 }),
          invoice("c", { dueDate: "2026-07-13", totalPaise: 840_000, status: "disputed" }),
        ],
      }),
    );
    expect(b.ageing.map((x) => [x.key, x.amountPaise, x.count])).toEqual([
      ["0-30", 1_000_000, 1],
      ["31-60", 2_000_000, 1],
      ["61-90", 0, 0],
      ["90+", 840_000, 1],
    ]);
    expect(sumPaise(b.ageing.map((x) => x.amountPaise))).toBe(b.totals.receivablesPaise);
  });
});

describe("Chase these first", () => {
  const gap = () => {
    const habit = paidLate("h1", "c2", 12);
    return book({
      invoices: [
        habit.invoice,
        // Beta Traders: ₹1,18,000, 38 days late, reminders done, calls allowed
        invoice("big", { customerId: "c2", dueDate: "2026-09-25", totalPaise: 11_800_000, ladderStage: 3 }),
        invoice("small", { customerId: "c1", dueDate: "2026-10-20", totalPaise: 840_000 }),
        invoice("promised", { customerId: "c1", dueDate: "2026-10-20" }),
        invoice("disputed", { customerId: "c1", dueDate: "2026-10-20", status: "disputed" }),
        // Expected on 4 Nov anyway, so chasing it does not change salary day
        invoice("coming", { customerId: "c1", dueDate: "2026-11-04" }),
      ],
      events: [habit.event, { invoiceId: "big", type: "reminder", date: "2026-10-02" }],
      promises: [{ invoiceId: "promised", status: "approved", instalments: [{ amountPaise: 1_000_000, date: "2026-11-20" }] }],
    });
  };

  it("ranks what closes the salary gap, weighted by how reliably they pay and how much work it is", () => {
    const b = todayBook(gap());
    expect(b.salary?.cashAfterPaise).toBe(-4_000_000);
    expect(b.chase.map((c) => c.invoiceId)).toEqual(["big", "small"]);
    expect(b.chase[0]).toMatchObject({
      customerName: "Beta Traders",
      amountPaise: 11_800_000,
      gapClosedPaise: 4_000_000,
      action: "call",
      reason: "Closes the whole salary gap. Usually pays 12 days late; no reminder in 31 days.",
      why: { gap: "all", gapPaise: 4_000_000, avgDelayDays: 12, reminderAgoDays: 31 },
    });
    expect(b.chase[1]).toMatchObject({
      action: "open",
      reason: "Closes ₹8,400 of the ₹40,000 salary gap. No Invoice paid yet; no reminder yet.",
      why: { gap: "part", gapPaise: 4_000_000, avgDelayDays: null, reminderAgoDays: null },
    });
  });

  it("ranks by what each brings in once salary day is covered", () => {
    const covered = todayBook({ ...gap(), openingCashPaise: 50_000_000 });
    expect(covered.salary?.cashAfterPaise).toBeGreaterThan(0);
    expect(covered.chase[0]).toMatchObject({ invoiceId: "big", reason: expect.stringMatching(/^Brings in ₹1,18,000\./) });
    expect(covered.chase[0]?.why.gap).toBe("none");
  });

  it("adds lateness: a smaller Invoice three months late ranks above a larger one 5 days late", () => {
    const b = todayBook(
      book({
        openingCashPaise: 50_000_000,
        invoices: [
          invoice("recent", { dueDate: "2026-10-28", totalPaise: 1_000_000 }),
          invoice("old", { dueDate: "2026-08-04", totalPaise: 800_000 }),
        ],
      }),
    );
    expect(b.chase.map((c) => [c.invoiceId, c.daysLate])).toEqual([
      ["old", 90],
      ["recent", 5],
    ]);
  });

  it("leaves not-yet-due Invoices out while any Invoice is overdue", () => {
    const b = todayBook(
      book({
        openingCashPaise: 50_000_000,
        invoices: [
          invoice("notdue", { dueDate: "2026-11-26", totalPaise: 67_200_000 }),
          invoice("late", { dueDate: "2026-07-13", totalPaise: 840_000 }),
        ],
      }),
    );
    expect(b.chase.map((c) => c.invoiceId)).toEqual(["late"]);
  });

  it("chases a not-yet-due Invoice when nothing is overdue", () => {
    const b = todayBook(book({ openingCashPaise: 50_000_000, invoices: [invoice("notdue", { dueDate: "2026-11-26" })] }));
    expect(b.chase.map((c) => c.invoiceId)).toEqual(["notdue"]);
  });

  it("explains the lateness and not-yet-due rules in the Why", () => {
    expect(CHASE_WHY).toMatch(/days late/);
    expect(CHASE_WHY).toMatch(/not yet due/);
  });

  it("shows at most five", () => {
    const many = Array.from({ length: 8 }, (_, n) => invoice(`i${n}`, { dueDate: "2026-10-01" }));
    expect(todayBook(book({ invoices: many })).chase).toHaveLength(5);
  });
});

describe("days to get paid", () => {
  it("averages days from Invoice date to payment over the last 6 months", () => {
    const b = todayBook(
      book({
        invoices: [
          invoice("a", { issueDate: "2026-08-01", status: "paid", paidPaise: 1_000_000 }),
          invoice("b", { issueDate: "2026-09-01", status: "paid", paidPaise: 1_000_000 }),
          invoice("old", { issueDate: "2026-01-01", status: "paid", paidPaise: 1_000_000 }),
        ],
        events: [
          { invoiceId: "a", type: "payment", date: "2026-08-20" }, // a part payment first
          { invoiceId: "a", type: "payment", date: "2026-09-10" }, // paid in full: 40 days
          { invoiceId: "b", type: "payment", date: "2026-10-03" }, // 32 days
          { invoiceId: "old", type: "payment", date: "2026-03-01" }, // before the 6 months
        ],
      }),
    );
    expect(b.daysToGetPaid).toEqual({ days: 36, count: 2, ifKeptDays: null, promisedCount: 0 });
  });

  it("says what it would be if every open Promise is kept on its last date", () => {
    const b = todayBook(
      book({
        invoices: [
          invoice("a", { issueDate: "2026-08-01", status: "paid", paidPaise: 1_000_000 }),
          invoice("p", { issueDate: "2026-10-01" }),
        ],
        events: [{ invoiceId: "a", type: "payment", date: "2026-09-10" }],
        promises: [
          {
            invoiceId: "p",
            status: "approved",
            instalments: [
              { amountPaise: 500_000, date: "2026-11-06" },
              { amountPaise: 500_000, date: "2026-11-20" }, // 50 days after the Invoice date
            ],
          },
        ],
      }),
    );
    expect(b.daysToGetPaid).toEqual({ days: 40, count: 1, ifKeptDays: 45, promisedCount: 1 });
  });
});
