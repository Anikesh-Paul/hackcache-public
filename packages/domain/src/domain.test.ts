import { describe, expect, it } from "vitest";
import {
  LADDER_STAGES,
  INVOICE_FILTERS,
  invoiceStanding,
  ladderRungs,
  matchesFilter,
  msmedInterest,
  section43bh,
  type InvoiceFacts,
} from "./index.ts";

const TODAY = "2026-11-02";

const gupta: InvoiceFacts & { issueDate: string } = {
  issueDate: "2026-08-26",
  totalPaise: 11_800_000,
  paidPaise: 0,
  status: "sent",
  dueDate: "2026-09-25",
  ladderStage: 3,
  pausedUntil: null,
  pauseReason: null,
};

describe("invoiceStanding", () => {
  it("owes nothing on a cancelled Invoice, however late it would be", () => {
    expect(invoiceStanding({ ...gupta, status: "cancelled" }, [], TODAY)).toEqual({
      state: "cancelled",
      balancePaise: 0,
      daysLate: 0,
      daysToDue: -38,
    });
    expect(msmedInterest({ udyamType: "micro", isTrader: false }, gupta, invoiceStanding({ ...gupta, status: "cancelled" }, [], TODAY), TODAY)).toBeNull();
  });

  it("is overdue with the whole amount owed, counted in whole days from the due date", () => {
    expect(invoiceStanding(gupta, [], TODAY)).toEqual({
      state: "overdue",
      balancePaise: 11_800_000,
      daysLate: 38,
      daysToDue: -38,
    });
  });

  it("is open, not overdue, on the due date itself", () => {
    const s = invoiceStanding({ ...gupta, dueDate: TODAY }, [], TODAY);
    expect(s.state).toBe("open");
    expect(s.daysLate).toBe(0);
  });

  it("owes only the rest after a part payment", () => {
    const s = invoiceStanding({ ...gupta, paidPaise: 2_000_000, status: "part" }, [], TODAY);
    expect(s.balancePaise).toBe(9_800_000);
    expect(s.state).toBe("overdue");
  });

  it("is paid when the status says so, owing nothing", () => {
    const s = invoiceStanding({ ...gupta, paidPaise: 11_800_000, status: "paid" }, [], TODAY);
    expect(s).toMatchObject({ state: "paid", balancePaise: 0, daysLate: 0 });
  });

  it("is disputed while a Dispute is open, whatever the date", () => {
    expect(invoiceStanding({ ...gupta, status: "disputed" }, [], TODAY).state).toBe("disputed");
  });

  it("is promised while an approved Promise or Plan is running", () => {
    const promise = { status: "approved" as const, instalments: [{ amountPaise: 6_000_000, date: "2026-11-06" }] };
    expect(invoiceStanding(gupta, [promise], TODAY).state).toBe("promised");
  });

  it("is overdue again once a Promise was broken or kept", () => {
    const broken = { status: "broken" as const, instalments: [{ amountPaise: 6_000_000, date: "2026-10-30" }] };
    expect(invoiceStanding(gupta, [broken], TODAY).state).toBe("overdue");
  });
});

describe("invoice filters", () => {
  const overdue = invoiceStanding(gupta, [], TODAY);
  const paid = invoiceStanding({ ...gupta, status: "paid", paidPaise: 11_800_000 }, [], TODAY);

  it("offers all, overdue, promised, disputed and paid", () => {
    expect(INVOICE_FILTERS).toEqual(["all", "overdue", "promised", "disputed", "paid"]);
  });

  it("puts each Invoice under its state, and every Invoice under all", () => {
    expect(matchesFilter(overdue, "overdue")).toBe(true);
    expect(matchesFilter(overdue, "paid")).toBe(false);
    expect(matchesFilter(paid, "paid")).toBe(true);
    expect(matchesFilter(paid, "all")).toBe(true);
  });
});

describe("the Ladder", () => {
  it("has six stages by name, with the letter never automatic", () => {
    expect(LADDER_STAGES.map((s) => s.name)).toEqual([
      "Friendly heads-up",
      "Due-date reminder",
      "Overdue reminder with pay link",
      "Reminder call",
      "Payment Demand Letter",
      "ODR case file",
    ]);
    expect(LADDER_STAGES[4]?.how).toMatch(/never automatic/);
  });

  it("shows climbed rungs, today's rung and future rungs for an overdue Invoice", () => {
    const rungs = ladderRungs(gupta, invoiceStanding(gupta, [], TODAY));
    expect(rungs.map((r) => r.state)).toEqual(["climbed", "climbed", "climbed", "today", "next", "next"]);
    expect(rungs[3]?.name).toBe("Reminder call");
  });

  it("has no today's rung while the Ladder is paused by a Dispute", () => {
    const disputed = { ...gupta, status: "disputed" as const, ladderStage: 2, pauseReason: "dispute" };
    const rungs = ladderRungs(disputed, invoiceStanding(disputed, [], TODAY));
    expect(rungs.map((r) => r.state)).toEqual(["climbed", "climbed", "next", "next", "next", "next"]);
  });

  it("has no today's rung for a paid Invoice", () => {
    const paid = { ...gupta, status: "paid" as const, paidPaise: 11_800_000, ladderStage: 1 };
    const rungs = ladderRungs(paid, invoiceStanding(paid, [], TODAY));
    expect(rungs.filter((r) => r.state === "today")).toEqual([]);
  });
});

describe("MSMED §16 interest meter", () => {
  const seller = { udyamType: "micro" as const, isTrader: false };

  it("runs from the day after the due date to the Demo date, at 16.5% then 17.25%", () => {
    const meter = msmedInterest(seller, gupta, invoiceStanding(gupta, [], TODAY), TODAY);
    expect(meter?.from).toBe("2026-09-26");
    expect(meter?.interestPaise).toBe(205_765); // ₹2,057.65
    const rates = meter?.rests.flatMap((r) => r.rates.map((p) => p.annualBps));
    expect(rates).toContain(1650);
    expect(rates).toContain(1725);
  });

  it("is not shown for a trader, a medium enterprise or a seller without Udyam", () => {
    const standing = invoiceStanding(gupta, [], TODAY);
    expect(msmedInterest({ udyamType: "micro", isTrader: true }, gupta, standing, TODAY)).toBeNull();
    expect(msmedInterest({ udyamType: "medium", isTrader: false }, gupta, standing, TODAY)).toBeNull();
    expect(msmedInterest({ udyamType: null, isTrader: false }, gupta, standing, TODAY)).toBeNull();
  });

  it("runs from 45 days after the Invoice date when the agreed terms are longer (§15)", () => {
    // Issued 1 Sep with 60 days' credit: due 31 Oct, but the appointed day is 16 Oct.
    const long = { ...gupta, issueDate: "2026-09-01", dueDate: "2026-10-31" };
    const meter = msmedInterest(seller, long, invoiceStanding(long, [], TODAY), TODAY);
    expect(meter?.from).toBe("2026-10-17");
    // Not yet late by its own terms, but past the appointed day: interest still runs.
    const early = { ...long, dueDate: "2026-12-31" };
    expect(invoiceStanding(early, [], TODAY).daysLate).toBe(0);
    expect(msmedInterest(seller, early, invoiceStanding(early, [], TODAY), TODAY)?.from).toBe("2026-10-17");
  });

  it("is not shown before the due date has passed, or once paid", () => {
    const notDue = { ...gupta, issueDate: "2026-10-03", dueDate: TODAY };
    expect(msmedInterest(seller, notDue, invoiceStanding(notDue, [], TODAY), TODAY)).toBeNull();
    const paid = { ...gupta, status: "paid" as const, paidPaise: 11_800_000 };
    expect(msmedInterest(seller, paid, invoiceStanding(paid, [], TODAY), TODAY)).toBeNull();
  });
});

describe("Income Tax Act §43B(h) deduction clock", () => {
  const seller = { udyamType: "micro" as const, isTrader: false };

  it("keeps the Invoice's own year until 31 March of that year, even past the appointed day", () => {
    // Issued 26 Aug 2026, due 25 Sep: late, but paid by 31 Mar 2027 it is still FY 26-27.
    expect(section43bh(seller, gupta, TODAY)).toEqual({
      appointed: "2026-09-25",
      claimBy: "2027-03-31",
      claimYear: "26-27",
      sameYear: true,
    });
    expect(section43bh(seller, gupta, "2027-03-31")?.sameYear).toBe(true);
  });

  it("moves the claim to the year it is paid once that 31 March has passed", () => {
    expect(section43bh(seller, gupta, "2027-04-01")).toEqual({
      appointed: "2026-09-25",
      claimBy: "2028-03-31",
      claimYear: "27-28",
      sameYear: false,
    });
  });

  it("keeps the Invoice's year up to the appointed day when that falls after 31 March", () => {
    // Issued 20 Mar 2027 with 30 days: paid by 19 Apr, §15 is met and the bill stays in FY 26-27.
    const march = { issueDate: "2027-03-20", dueDate: "2027-04-19" };
    expect(section43bh(seller, march, "2027-04-10")).toMatchObject({ claimBy: "2027-04-19", claimYear: "26-27", sameYear: true });
    expect(section43bh(seller, march, "2027-04-20")).toMatchObject({ claimBy: "2028-03-31", claimYear: "27-28", sameYear: false });
  });

  it("caps longer terms at 45 days after the Invoice date (§15)", () => {
    const long = { issueDate: "2027-02-20", dueDate: "2027-05-21" };
    expect(section43bh(seller, long, "2027-04-01")).toMatchObject({ appointed: "2027-04-06", claimBy: "2027-04-06", sameYear: true });
    expect(section43bh(seller, long, "2027-04-07")?.sameYear).toBe(false);
  });

  it("covers a small enterprise, and not a trader, a medium enterprise or a seller without Udyam", () => {
    expect(section43bh({ udyamType: "small", isTrader: false }, gupta, TODAY)).not.toBeNull();
    expect(section43bh({ udyamType: "micro", isTrader: true }, gupta, TODAY)).toBeNull();
    expect(section43bh({ udyamType: "medium", isTrader: false }, gupta, TODAY)).toBeNull();
    expect(section43bh({ udyamType: "none", isTrader: false }, gupta, TODAY)).toBeNull();
    expect(section43bh({ udyamType: null, isTrader: false }, gupta, TODAY)).toBeNull();
  });
});
