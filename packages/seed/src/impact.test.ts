// #11's numbers, computed from the seed by the same domain code Today uses:
// the books when the tour starts, and after its steps (Gupta Traders' Plan on
// the pay link, a week of the Ladder, and his first instalment confirmed).
import { describe, expect, it } from "vitest";
import { impact, type ImpactEvent, type ImpactInput, type ImpactPromise } from "@tagada/domain";
import { formatInr, sumPaise } from "@tagada/money";
import { DEMO_TODAY, GUPTA_PLAN, seedWorld } from "./index.ts";

const world = seedWorld({ workspaceId: "w64f0c2a91be7d3e85f10", ownerUserId: "64f0c2a91be7d3e85f10" });

const seededEvents: ImpactEvent[] = world.events.map((e) => {
  const p = e.payload ? (JSON.parse(e.payload) as Record<string, unknown>) : {};
  return {
    invoiceId: e.invoiceId,
    type: e.type,
    actor: e.actor,
    date: e.at.slice(0, 10),
    ...(typeof p.amountPaise === "number" ? { amountPaise: p.amountPaise } : {}),
    ...(typeof p.channel === "string" ? { channel: p.channel } : {}),
  };
});
const seededPromises: ImpactPromise[] = world.promises.map((p) => ({
  $id: p.$id,
  invoiceId: p.invoiceId,
  status: p.status,
  instalments: JSON.parse(p.instalments) as ImpactPromise["instalments"],
}));

const gupta = world.invoices.find((i) => i.totalPaise === 11_800_000 && i.status === "sent")!;
const guptaPlan: ImpactPromise = { $id: "pgupta", invoiceId: gupta.$id, status: "approved", instalments: GUPTA_PLAN };

function input(today: string, events: ImpactEvent[] = [], promises: ImpactPromise[] = []): ImpactInput {
  return {
    today,
    since: DEMO_TODAY,
    customers: world.customers,
    invoices: world.invoices,
    events: [...seededEvents, ...events],
    promises: [...seededPromises, ...promises],
  };
}

const planAgreed: ImpactEvent = { invoiceId: gupta.$id, type: "plan_accepted", actor: "customer", date: DEMO_TODAY, promiseId: "pgupta" };
const reminder = (n: number): ImpactEvent => ({ invoiceId: `i${n}`, type: "reminder", actor: "workflow", date: "2026-11-09", channel: "email" });
const week = [planAgreed, reminder(1), reminder(2), reminder(3), reminder(4)];
const confirmed: ImpactEvent = { invoiceId: gupta.$id, type: "payment", actor: "owner", date: "2026-11-09", amountPaise: 6_000_000 };

const start = impact(input(DEMO_TODAY));
const end = impact(input("2026-11-09", [...week, confirmed], [guptaPlan]));

describe("What Tagada changed, on the seeded Demo world", () => {
  it("starts with days to get paid at 86 and nothing else changed yet", () => {
    expect(start.dso.before).toEqual({
      date: "2026-11-01",
      from: "2026-08-02",
      windowDays: 92,
      owedPaise: 37_986_800,
      salesPaise: 40_827_100,
      days: 86,
    });
    expect(start.dso.after.days).toBe(86);
    expect(start.forward).toEqual({ monthEnd: "2026-11-30", totalPaise: 0, rows: [] });
    expect(start.chasing.minutes).toBe(0);
    expect(start.cost).toMatchObject({ costPaise: 0, collectedPaise: 0, perHundredPaise: null });
  });

  it("works days to get paid out as owed ÷ 3 months' sales × their days", () => {
    // ₹3,79,868 owed against ₹4,08,271 invoiced from 2 Aug to 1 Nov: × 92 = 85.6, so 86.
    const { owedPaise, salesPaise, windowDays, days } = end.dso.before;
    expect(Math.round((owedPaise * windowDays) / salesPaise)).toBe(days);
    // A week on, Gupta Traders' ₹60,000 is in: ₹3,19,868 ÷ ₹3,96,931 × 92 = 74.1.
    expect(end.dso.after).toMatchObject({ from: "2026-08-10", owedPaise: 31_986_800, salesPaise: 39_693_100, days: 74 });
  });

  it("rises to 88 a week on if nothing is paid: the calendar alone does not bring it down", () => {
    expect(impact(input("2026-11-09", week, [guptaPlan])).dso.after.days).toBe(88);
  });

  it("brings ₹60,000 forward: Gupta Traders' usual day, 7 Oct, had gone by unpaid", () => {
    expect(end.forward.totalPaise).toBe(6_000_000);
    expect(end.forward.rows).toEqual([
      expect.objectContaining({
        customerName: "Gupta Traders",
        number: gupta.number,
        paidPaise: 6_000_000,
        promisedPaise: 6_000_000,
        countedPaise: 6_000_000,
        avgDelayDays: 12,
        usualDate: "2026-10-07",
        why: "passed",
      }),
    ]);
    expect(sumPaise(end.forward.rows.map((r) => r.countedPaise))).toBe(end.forward.totalPaise);
  });

  it("counts the Plan as soon as it is agreed, before the money comes", () => {
    const agreed = impact(input(DEMO_TODAY, [planAgreed], [guptaPlan]));
    expect(agreed.forward.rows.map((r) => [r.customerName, formatInr(r.countedPaise)])).toEqual([["Gupta Traders", "₹60,000"]]);
  });

  it("leaves out Das & Sons' Promise, made before Tagada started, and Kalita Traders paying on their usual day", () => {
    const das = world.invoices.find((i) => i.status === "sent" && i.paidPaise === 0 && i.issueDate === "2026-09-29")!;
    const kalita = world.invoices.find((i) => i.issueDate === "2026-10-02")!;
    const paid = (invoiceId: string, amountPaise: number): ImpactEvent => ({
      invoiceId,
      type: "payment",
      actor: "owner",
      date: "2026-11-09",
      amountPaise,
    });
    const later = impact(input("2026-11-09", [...week, confirmed, paid(das.$id, 1_434_000), paid(kalita.$id, 2_750_000)], [guptaPlan]));
    expect(later.forward.rows.map((r) => r.customerName)).toEqual(["Gupta Traders"]);
    expect(later.cost.collectedPaise).toBe(sumPaise([6_000_000, 1_434_000, 2_750_000]));
  });

  it("saves an hour of chasing: 4 Reminders at 15 minutes each", () => {
    expect(end.chasing).toEqual({ reminders: 4, calls: 0, minutesPerChase: 15, minutes: 60 });
  });

  it("spent ₹0.14 on 4 emails to collect ₹60,000: under 1 paisa per ₹100", () => {
    expect(end.cost).toEqual({
      emails: 4,
      emailPaise: 14,
      calls: 0,
      callPaise: 0,
      costPaise: 14,
      collectedPaise: 6_000_000,
      perHundredPaise: 0,
    });
  });

  it("does not count the seeded call on 20 Oct, before Tagada started", () => {
    expect(world.events.some((e) => e.type === "call" && e.actor === "ai")).toBe(true);
    expect(end.chasing.calls).toBe(0);
  });
});
