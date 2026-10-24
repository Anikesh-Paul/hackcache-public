// Ticket 06's acceptance numbers, computed from the seed by the same domain code Today uses.
import { describe, expect, it } from "vitest";
import { payPackets, todayBook, type BookInput, type BookPromise } from "@tagada/domain";
import { differencePaise, formatInr, sumPaise } from "@tagada/money";
import { DEMO_TODAY, seedWorld } from "./index.ts";

const world = seedWorld({ workspaceId: "w64f0c2a91be7d3e85f10", ownerUserId: "64f0c2a91be7d3e85f10" });
const [workspace] = world.workspaces;

const seededPromises: BookPromise[] = world.promises.map((p) => ({
  invoiceId: p.invoiceId,
  status: p.status,
  instalments: JSON.parse(p.instalments) as BookPromise["instalments"],
}));

function input(promises = seededPromises): BookInput {
  return {
    today: workspace!.today,
    openingCashPaise: workspace!.openingCashPaise ?? 0,
    customers: world.customers,
    invoices: world.invoices,
    promises,
    events: world.events.map((e) => ({ invoiceId: e.invoiceId, type: e.type, date: e.at.slice(0, 10) })),
    bankCredits: world.bank_txns.map((t) => ({
      matchStatus: t.matchStatus,
      allocations: t.allocations ? JSON.parse(t.allocations) : [],
    })),
    cashItems: world.cash_items,
  };
}

const gupta = world.invoices.find((i) => i.totalPaise === 11_800_000 && i.status === "sent")!;
const guptaPlan: BookPromise = {
  invoiceId: gupta.$id,
  status: "approved",
  instalments: [
    { amountPaise: 6_000_000, date: "2026-11-06" },
    { amountPaise: 5_800_000, date: "2026-12-02" },
  ],
};

const before = todayBook(input());
const after = todayBook(input([...seededPromises, guptaPlan]));

describe("Today on the seeded Demo date", () => {
  it("is ₹48,000 short on salary day, Tue 10 Nov, 8 days away", () => {
    expect(DEMO_TODAY).toBe("2026-11-02");
    expect(before.salary).toMatchObject({
      date: "2026-11-10",
      daysAway: 8,
      salaryPaise: 15_800_000,
      cashAfterPaise: -4_800_000,
    });
  });

  it("works it out from ₹74,500 in the bank, ₹62,000 expected, rent, power and bamboo, and salaries", () => {
    const s = before.salary!;
    expect(sumPaise(s.receipts.map((r) => r.amountPaise))).toBe(6_200_000);
    expect(s.receipts.map((r) => [r.customerName, r.date, formatInr(r.amountPaise), r.basis])).toEqual([
      ["Das & Sons", "2026-11-06", "₹14,340", "promise"],
      ["Kalita Traders", "2026-11-07", "₹27,500", "usual"],
      ["Saha Furniture Mart", "2026-11-09", "₹20,160", "usual"],
    ]);
    expect(s.outflows.map((o) => [o.label, o.date, formatInr(o.amountPaise)])).toEqual([
      ["Workshop rent", "2026-11-05", "₹18,000"],
      ["Power bill and raw bamboo", "2026-11-07", "₹8,500"],
      ["Salaries: 8 artisans and 1 accountant", "2026-11-10", "₹1,58,000"],
    ]);
  });

  it("does not count Gupta Traders or Paul Gift House's 112-day Invoice before they promise a date", () => {
    const counted = Object.fromEntries(before.receivables.map((r) => [`${r.customerName} ${r.number}`, r.counted]));
    expect(counted[`Gupta Traders ${gupta.number}`]).toBe("later_than_usual");
    const old = before.receivables.find((r) => r.customerName === "Paul Gift House" && r.daysLate === 112);
    expect(old?.counted).toBe("later_than_usual");
  });

  it("is ₹12,000 spare once Gupta Traders' ₹60,000 on Fri 6 Nov is approved", () => {
    expect(after.salary?.cashAfterPaise).toBe(1_200_000);
    expect(after.salary?.receipts.find((r) => r.customerName === "Gupta Traders")).toMatchObject({
      date: "2026-11-06",
      amountPaise: 6_000_000,
      basis: "promise",
    });
  });

  it("fills about ₹17,500 pay packets: 6 and a quarter of 9 before, all 9 after", () => {
    const short = payPackets(before.salary!, 9);
    expect(formatInr(short.aboutEachPaise)).toBe("₹17,500");
    expect(short.fundedPaise).toBe(11_000_000);
    expect(short.full).toBe(6);
    expect(short.fills[6]).toBeGreaterThan(0.25);
    expect(short.fills[6]).toBeLessThan(0.3);
    expect(payPackets(after.salary!, 9).full).toBe(9);
  });

  it("shows the same Shortfall at the end of the salary week, which only the Promise changes", () => {
    expect(before.weeks[1]).toMatchObject({ start: "2026-11-09", salary: true, closePaise: -4_800_000 });
    expect(after.weeks[1]?.closePaise).toBe(1_200_000);
    expect(differencePaise(after.weeks[0]!.inPaise, before.weeks[0]!.inPaise)).toBe(6_000_000);
  });

  it("has Ageing buckets that sum to total receivables, none of them empty", () => {
    expect(sumPaise(before.ageing.map((b) => b.amountPaise))).toBe(before.totals.receivablesPaise);
    for (const bucket of before.ageing) expect(bucket.count).toBeGreaterThan(0);
    const owed = world.invoices.filter((i) => i.status !== "paid");
    expect(before.totals.receivablesPaise).toBe(sumPaise(owed.map((i) => differencePaise(i.totalPaise, i.paidPaise))));
  });

  it("knows which receivables are already in the bank, waiting for the Owner to confirm them", () => {
    const allocated = world.bank_txns.flatMap((t) =>
      t.allocations ? (JSON.parse(t.allocations) as { amountPaise: number; tdsPaise?: number }[]) : [],
    );
    expect(before.totals.inBankPaise).toBe(sumPaise(allocated.flatMap((a) => [a.amountPaise, a.tdsPaise ?? 0])));
  });

  it("puts Gupta Traders first to chase, because it closes the whole salary gap", () => {
    const [first] = before.chase;
    expect(first).toMatchObject({ customerName: "Gupta Traders", amountPaise: 11_800_000, action: "call" });
    expect(first?.reason).toMatch(/^Closes the whole salary gap\. Usually pays 12 days late; no reminder in \d+ days\.$/);
    expect(before.chase.length).toBeLessThanOrEqual(5);
    expect(after.chase.some((c) => c.customerName === "Gupta Traders")).toBe(false);
  });

  it("lists no not-yet-due Invoice while overdue ones exist, and has Paul Gift House's 112-day Invoice", () => {
    for (const book of [before, after]) {
      expect(book.chase.length).toBeGreaterThan(0);
      expect(book.chase.every((c) => c.daysLate > 0)).toBe(true);
      expect(book.chase.find((c) => c.customerName === "Paul Gift House")?.daysLate).toBe(112);
    }
  });

  it("averages days to get paid from the seeded payments, and says what kept Promises would make it", () => {
    // 17 paid Invoices, 645 days in all; Das & Sons' Promise is 38 days after its Invoice date.
    expect(before.daysToGetPaid).toEqual({ days: 38, count: 17, ifKeptDays: 38, promisedCount: 1 });
    // Gupta Traders' plan ends on 2 Dec, 98 days after 26 Aug: (645 + 38 + 98) / 19.
    expect(after.daysToGetPaid).toMatchObject({ days: 38, ifKeptDays: 41, promisedCount: 2 });
  });
});
