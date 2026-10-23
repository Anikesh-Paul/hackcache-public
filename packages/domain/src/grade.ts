import { addMonths, daysBetween } from "@tagada/money";

export type GradeLetter = "A" | "B" | "C";

/** What the grade rule needs. Dates are "YYYY-MM-DD". */
export type GradeInput = {
  today: string;
  /** Whole days after the due date, one entry per Invoice this Customer has paid. */
  paidDaysLate: readonly number[];
  /** Due dates of Invoices still open (sent, part-paid or disputed). */
  openDueDates: readonly string[];
  /** Days a Dispute was raised. */
  disputeDates: readonly string[];
  /** Days a Promise was broken. */
  brokenPromiseDates: readonly string[];
};

export type CustomerGrade = {
  grade: GradeLetter;
  /** Reason in words, without the letter. */
  reason: string;
  /** Mean days late on paid Invoices, rounded half up. Null when none were paid. */
  avgDelayDays: number | null;
};

/**
 * The rule, in the words the "Why?" control shows.
 * A 90-day window here is this Customer's own history, not an MSMED council deadline.
 */
export const GRADE_WHY =
  "A means they are 7 days late or less on average, and raised no Dispute in the last 6 months. C means they are more than 30 days late on average, broke a Promise in the last 90 days, or still have an Invoice open 90 or more days past its due date. Everyone else is B. The average uses Invoices already paid, not one that is only overdue today.";

export type HistoryInvoice = {
  id: string;
  dueDate: string;
  status: "draft" | "sent" | "part" | "paid" | "disputed";
};

export type HistoryEvent = {
  invoiceId: string;
  type: string;
  /** The calendar day in IST. */
  date: string;
};

export type HistoryPromise = {
  invoiceId: string;
  status: "needs_owner" | "approved" | "kept" | "broken" | "declined";
  dates: readonly string[];
};

const OPEN = new Set<HistoryInvoice["status"]>(["sent", "part", "disputed"]);

/** Grade one Customer from the Invoices, events and Promises already filtered to them. */
export function gradeCustomer(
  today: string,
  invoices: readonly HistoryInvoice[],
  events: readonly HistoryEvent[],
  promises: readonly HistoryPromise[],
): CustomerGrade {
  const ids = new Set(invoices.map((invoice) => invoice.id));
  const paidDaysLate: number[] = [];
  const openDueDates: string[] = [];
  for (const invoice of invoices) {
    if (invoice.status === "paid") {
      // Paid in parts, it was settled by the last payment.
      let settled: string | null = null;
      for (const event of events) {
        if (event.invoiceId === invoice.id && event.type === "payment" && (!settled || event.date > settled)) settled = event.date;
      }
      if (!settled) continue;
      paidDaysLate.push(daysBetween(invoice.dueDate, settled));
    } else if (OPEN.has(invoice.status)) {
      openDueDates.push(invoice.dueDate);
    }
  }
  return grade({
    today,
    paidDaysLate,
    openDueDates,
    disputeDates: events
      .filter((event) => ids.has(event.invoiceId) && event.type === "dispute")
      .map((event) => event.date),
    brokenPromiseDates: promises
      .filter((promise) => ids.has(promise.invoiceId) && promise.status === "broken")
      .flatMap((promise) => [...promise.dates]),
  });
}

function averageDays(days: readonly number[]): number | null {
  if (days.length === 0) return null;
  let sum = 0;
  for (const day of days) {
    if (!Number.isInteger(day)) throw new Error("days late must be a whole number");
    sum += day;
  }
  const sign = sum < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(sum) / days.length);
}

/** "usually pays 12 days late", from a Customer's mean days late. */
export function paymentHabit(avg: number | null): string {
  if (avg === null) return "no Invoice paid yet";
  if (avg === 0) return "pays on time";
  if (avg < 0) {
    const early = -avg;
    return `usually pays ${early} ${early === 1 ? "day" : "days"} early`;
  }
  return `usually pays ${avg} ${avg === 1 ? "day" : "days"} late`;
}

function onOrAfter(date: string, start: string, today: string): boolean {
  return date >= start && date <= today;
}

function withinLastDays(date: string, today: string, days: number): boolean {
  const ago = daysBetween(date, today);
  return ago >= 0 && ago <= days;
}

/**
 * A / B / C from paid history, not from one Invoice that happens to be overdue today.
 * A: average ≤ 7 days late and no Dispute in 6 months.
 * C: average > 30, a broken Promise in the last 90 days, or an Invoice still open after 90 days.
 * B: everyone else.
 */
export function grade(input: GradeInput): CustomerGrade {
  const avg = averageDays(input.paidDaysLate);
  let worst = 0;
  let overdueCount = 0;
  for (const due of input.openDueDates) {
    const late = daysBetween(due, input.today);
    if (late <= 0) continue;
    overdueCount += 1;
    if (late > worst) worst = late;
  }
  const open90 = worst >= 90;
  const broken = input.brokenPromiseDates.some((date) => withinLastDays(date, input.today, 90));
  const disputed = input.disputeDates.some((date) => onOrAfter(date, addMonths(input.today, -6), input.today));
  const letter: GradeLetter =
    open90 || (avg !== null && avg > 30) || broken ? "C" : avg !== null && avg <= 7 && !disputed ? "A" : "B";

  const parts = [paymentHabit(avg)];
  if (open90) parts.push(`an Invoice is ${worst} days past due`);
  else if (worst > 0) {
    const unit = worst === 1 ? "day" : "days";
    parts.push(overdueCount === 1 ? `this one is ${worst} ${unit} late` : `one is ${worst} ${unit} late`);
  }
  if (broken) parts.push("a Promise was broken in the last 90 days");
  if (disputed && letter !== "A") parts.push("a Dispute in the last 6 months");
  return { grade: letter, avgDelayDays: avg, reason: parts.join("; ") };
}
