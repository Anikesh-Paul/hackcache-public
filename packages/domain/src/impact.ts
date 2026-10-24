// What Tagada changed (#11): four numbers from the Demo world's events, never
// typed in. "Before" is the books on the evening before Tagada started
// chasing; "after" is the books at the end of the Demo date. Pure: every paise
// sum comes from `money`.
import {
  addDays,
  addMonths,
  callCostPaise,
  costPerHundredPaise,
  daysBetween,
  differencePaise,
  emailCostPaise,
  sumPaise,
} from "@tagada/money";
import { gradeCustomer } from "./grade.ts";
import type { BookCustomer, BookInvoice } from "./today.ts";

/** One stored event, dated by its IST day, with what its payload says. */
export type ImpactEvent = {
  invoiceId: string;
  type: string;
  actor: "owner" | "ai" | "customer" | "workflow";
  date: string;
  /** A payment's cash. */
  amountPaise?: number;
  /** A payment's TDS kept back: it settles the Invoice but is not cash in. */
  tdsPaise?: number;
  /** A Reminder's channel: "email" costs a send. */
  channel?: string;
  /** The Promise or Plan an event agreed or approved. */
  promiseId?: string;
  /** The call an AI event belongs to. */
  callId?: string;
  /** What the call used, in ElevenLabs credits, on the event that closed it. */
  credits?: number | null;
};

export type ImpactPromise = {
  $id: string;
  invoiceId: string;
  status: "needs_owner" | "approved" | "kept" | "broken" | "declined";
  instalments: readonly { amountPaise: number; date: string }[];
};

export type ImpactInput = {
  /** The Demo date. */
  today: string;
  /** The day Tagada started chasing. */
  since: string;
  customers: readonly BookCustomer[];
  invoices: readonly BookInvoice[];
  events: readonly ImpactEvent[];
  promises: readonly ImpactPromise[];
};

/** Days of sales owed on one evening: what was owed, over what the 3 months to then invoiced, times their days. */
export type Dso = {
  date: string;
  /** The first day of the 3 months. */
  from: string;
  windowDays: number;
  owedPaise: number;
  salesPaise: number;
  /** Null when nothing was invoiced in the 3 months. */
  days: number | null;
};

export type ForwardRow = {
  invoiceId: string;
  customerName: string;
  number: string;
  /** Paid since Tagada started, inside this month. */
  paidPaise: number;
  /** Instalments of a Promise or Plan agreed since then, falling inside this month. */
  promisedPaise: number;
  /** The larger of the two, at most what was owed when Tagada started. */
  countedPaise: number;
  avgDelayDays: number | null;
  /** The due date plus the Customer's usual delay, as their habit stood. */
  usualDate: string;
  /** "passed": the usual day had gone by when Tagada started, so the forecast no longer counted on it; "later": after this month. */
  why: "passed" | "later";
};

export type Impact = {
  since: string;
  /** The evening before Tagada started. */
  beforeDate: string;
  dso: { before: Dso; after: Dso };
  forward: { monthEnd: string; totalPaise: number; rows: ForwardRow[] };
  chasing: { reminders: number; calls: number; minutesPerChase: number; minutes: number };
  cost: {
    emails: number;
    emailPaise: number;
    calls: number;
    callPaise: number;
    costPaise: number;
    collectedPaise: number;
    /** Paise spent on each ₹100 collected. Null when nothing was collected. */
    perHundredPaise: number | null;
  };
};

/**
 * What one chase takes the Owner by hand: find the bill, write the message or
 * dial, and note what was said. Shown next to the hours it gives.
 */
export const MINUTES_PER_CHASE = 15;

const counts = (invoice: BookInvoice) => invoice.status !== "draft" && invoice.status !== "cancelled";

/** Settled on an Invoice: the cash, and any TDS kept back. */
const settled = (e: ImpactEvent) => sumPaise([e.amountPaise ?? 0, e.tdsPaise ?? 0]);

function lastDayOfMonth(iso: string): string {
  return addDays(addMonths(`${iso.slice(0, 8)}01`, 1), -1);
}

/** Days of sales owed at the end of `date`, from Invoices raised by then and payments made by then. */
export function dsoOn(invoices: readonly BookInvoice[], events: readonly ImpactEvent[], date: string): Dso {
  const from = addDays(addMonths(date, -3), 1);
  const raised = invoices.filter((i) => counts(i) && i.issueDate <= date);
  const paid = new Map<string, number[]>();
  for (const e of events) {
    if (e.type !== "payment" || e.date > date) continue;
    paid.set(e.invoiceId, [...(paid.get(e.invoiceId) ?? []), settled(e)]);
  }
  const owed = raised.map((i) => {
    const left = differencePaise(i.totalPaise, sumPaise(paid.get(i.$id) ?? []));
    return left > 0 ? left : 0;
  });
  const owedPaise = sumPaise(owed);
  const salesPaise = sumPaise(raised.filter((i) => i.issueDate >= from).map((i) => i.totalPaise));
  const windowDays = daysBetween(from, date) + 1;
  return {
    date,
    from,
    windowDays,
    owedPaise,
    salesPaise,
    // Days, not money: a whole number of days, half up.
    days: salesPaise > 0 ? Math.round((owedPaise * windowDays) / salesPaise) : null,
  };
}

export function impact(input: ImpactInput): Impact {
  const { today, since } = input;
  const beforeDate = addDays(since, -1);
  const sinceThen = input.events.filter((e) => e.date >= since && e.date <= today);
  return {
    since,
    beforeDate,
    dso: { before: dsoOn(input.invoices, input.events, beforeDate), after: dsoOn(input.invoices, input.events, today) },
    forward: broughtForward(input, beforeDate),
    chasing: chasing(sinceThen),
    cost: cost(sinceThen),
  };
}

/**
 * Paid or promised inside this month, on Invoices that by the Customer's
 * habit (as it stood when Tagada started) would have come later: their usual
 * day falls after this month, or had already gone by unpaid.
 */
function broughtForward(input: ImpactInput, beforeDate: string): Impact["forward"] {
  const { today, since } = input;
  const monthEnd = lastDayOfMonth(today);
  const from = `${today.slice(0, 8)}01` > since ? `${today.slice(0, 8)}01` : since;
  const before = input.events.filter((e) => e.date <= beforeDate);
  const names = new Map(input.customers.map((c) => [c.$id, c.name]));
  const delays = new Map<string, number | null>();
  const delayOf = (customerId: string) => {
    if (!delays.has(customerId)) {
      const invoices = input.invoices.filter((i) => i.customerId === customerId);
      const ids = new Set(invoices.map((i) => i.$id));
      const grade = gradeCustomer(
        beforeDate,
        invoices.map((i) => ({ id: i.$id, dueDate: i.dueDate, status: i.status })),
        before.filter((e) => ids.has(e.invoiceId)),
        [],
      );
      delays.set(customerId, grade.avgDelayDays);
    }
    return delays.get(customerId) ?? null;
  };
  const agreedSince = new Set(
    input.events
      .filter((e) => (e.type === "plan_accepted" || e.type === "plan_approved") && e.date >= since && e.date <= today)
      .flatMap((e) => (e.promiseId ? [e.promiseId] : [])),
  );

  const rows: ForwardRow[] = [];
  for (const invoice of input.invoices) {
    if (!counts(invoice)) continue;
    const paidPaise = sumPaise(
      input.events
        .filter((e) => e.invoiceId === invoice.$id && e.type === "payment" && e.date >= from && e.date <= today)
        .map(settled),
    );
    const promisedPaise = sumPaise(
      input.promises
        .filter(
          (p) =>
            p.invoiceId === invoice.$id && (p.status === "approved" || p.status === "kept") && agreedSince.has(p.$id),
        )
        .flatMap((p) => p.instalments.filter((x) => x.date >= from && x.date <= monthEnd).map((x) => x.amountPaise)),
    );
    if (paidPaise === 0 && promisedPaise === 0) continue;
    const avgDelayDays = delayOf(invoice.customerId);
    const usualDate = addDays(invoice.dueDate, Math.max(0, avgDelayDays ?? 0));
    // Its usual day falls inside the time Tagada was chasing and this month: it would have come anyway.
    if (usualDate >= since && usualDate <= monthEnd) continue;
    const owedThen = invoice.issueDate <= beforeDate ? owedAfter(invoice, before) : invoice.totalPaise;
    const larger = paidPaise > promisedPaise ? paidPaise : promisedPaise;
    const countedPaise = larger < owedThen ? larger : owedThen;
    if (countedPaise <= 0) continue;
    rows.push({
      invoiceId: invoice.$id,
      customerName: names.get(invoice.customerId) ?? "Unknown Customer",
      number: invoice.number,
      paidPaise,
      promisedPaise,
      countedPaise,
      avgDelayDays,
      usualDate,
      why: usualDate < since ? "passed" : "later",
    });
  }
  rows.sort((a, b) => b.countedPaise - a.countedPaise || a.number.localeCompare(b.number));
  return { monthEnd, totalPaise: sumPaise(rows.map((r) => r.countedPaise)), rows };
}

/** What was left on one Invoice after the payments in `events`. */
function owedAfter(invoice: BookInvoice, events: readonly ImpactEvent[]): number {
  const paid = sumPaise(events.filter((e) => e.invoiceId === invoice.$id && e.type === "payment").map(settled));
  const left = differencePaise(invoice.totalPaise, paid);
  return left > 0 ? left : 0;
}

/** The calls Munim made: one per call, however many events it wrote. */
function aiCalls(events: readonly ImpactEvent[]): Map<string, number> {
  const calls = new Map<string, number>();
  events.forEach((e, n) => {
    if (e.actor !== "ai") return;
    if (e.type !== "call" && !e.callId) return;
    const key = e.callId ?? `event${n}`;
    const credits = typeof e.credits === "number" ? e.credits : 0;
    calls.set(key, (calls.get(key) ?? 0) + credits);
  });
  return calls;
}

/** Reminders the Ladder sent and calls Munim made, each a chase the Owner did not do by hand. */
function chasing(events: readonly ImpactEvent[]): Impact["chasing"] {
  const reminders = events.filter((e) => e.type === "reminder" && e.actor === "workflow").length;
  const calls = aiCalls(events).size;
  return { reminders, calls, minutesPerChase: MINUTES_PER_CHASE, minutes: (reminders + calls) * MINUTES_PER_CHASE };
}

/** Email sends and call minutes since Tagada started, against the cash collected since then. */
function cost(events: readonly ImpactEvent[]): Impact["cost"] {
  const emails = events.filter((e) => e.type === "reminder" && e.channel === "email").length;
  const calls = aiCalls(events);
  const emailPaise = emailCostPaise(emails);
  // Priced once on all the credits, as the AI calls tile does.
  const callPaise = callCostPaise(sumPaise([...calls.values()]));
  const costPaise = sumPaise([emailPaise, callPaise]);
  const collectedPaise = sumPaise(events.filter((e) => e.type === "payment").map((e) => e.amountPaise ?? 0));
  return {
    emails,
    emailPaise,
    calls: calls.size,
    callPaise,
    costPaise,
    collectedPaise,
    perHundredPaise: costPerHundredPaise(costPaise, collectedPaise),
  };
}
