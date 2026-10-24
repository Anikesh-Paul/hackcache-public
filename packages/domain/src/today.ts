// Today's page of the khata: what is owed and how old it is, when cash is
// expected in and out over 13 weeks, the next salary day, who to chase first
// and how long Customers take to pay. Pure: every figure comes from the rows
// passed in and the Demo date, and every paise sum from `money`.
import {
  addDays,
  addMonths,
  daysBetween,
  differencePaise,
  formatInr,
  nearestPaise,
  percentOfPaise,
  sharePaise,
  sumPaise,
} from "@tagada/money";
import { gradeCustomer, paymentHabit, type CustomerGrade, type HistoryEvent } from "./grade.ts";
import { suggestedInBank, waitingInBank, type BankSuggestion } from "./in-bank.ts";
import { invoiceStanding, isClosed, type InvoiceFacts, type PromiseFacts } from "./invoice.ts";

export type BookInvoice = InvoiceFacts & { $id: string; customerId: string; number: string; issueDate: string };
export type BookCustomer = { $id: string; name: string; consentCalls: boolean };
export type BookPromise = PromiseFacts & { invoiceId: string };
/**
 * A Bank credit with its match parsed. Only suggested matches say the money is
 * already in the bank. Dated credits since `cashAsOf` are in the bank today.
 */
export type BookCredit = BankSuggestion & { date?: string };
export type CashItem = {
  kind: "salary" | "rent" | "supplier" | "other";
  label: string | null;
  amountPaise: number;
  date: string | null;
  recurrence: string | null;
};

export type BookInput = {
  /** The Demo date. */
  today: string;
  /** In the bank at the start of `cashAsOf`, or of the Demo date when that is not given. */
  openingCashPaise: number;
  /** The day `openingCashPaise` was counted. Credits from then on are added, and payments out before the Demo date taken off. */
  cashAsOf?: string;
  customers: readonly BookCustomer[];
  invoices: readonly BookInvoice[];
  promises: readonly BookPromise[];
  /** Every Invoice event, dated by its IST day. */
  events: readonly HistoryEvent[];
  bankCredits: readonly BookCredit[];
  /**
   * Payments the Owner recorded by hand (cash, cheque, UPI, bank transfer):
   * in hand from their date, as a Bank credit is from its own.
   */
  received?: readonly { date: string; amountPaise: number }[];
  cashItems: readonly CashItem[];
};

export type ExpectedReceipt = {
  invoiceId: string;
  customerName: string;
  date: string;
  amountPaise: number;
  /** "promise": a date the Customer gave; "usual": the due date plus their usual delay. */
  basis: "promise" | "usual";
};

export type Outflow = { kind: CashItem["kind"]; label: string; date: string; amountPaise: number };

/** Why an open Invoice is, or is not, in the forecast. */
export type Counted = "usual" | "promise" | "disputed" | "in_bank" | "later_than_usual" | "promise_passed";

export type Receivable = {
  invoiceId: string;
  customerId: string;
  customerName: string;
  number: string;
  dueDate: string;
  /** Owed, by the books. */
  balancePaise: number;
  /** Already in the bank (with any TDS kept back), waiting for the Owner to confirm it. */
  inBankPaise: number;
  /** Still to come in. */
  toComePaise: number;
  daysLate: number;
  grade: CustomerGrade;
  counted: Counted;
};

export type ForecastWeek = {
  start: string;
  end: string;
  inPaise: number;
  outPaise: number;
  /** Expected new sales: Invoices not raised yet, paid at the usual pace. Not in `inPaise`. */
  newSalesPaise: number;
  /** Cash at the end of the week. Negative is short. */
  closePaise: number;
  /** Salaries go out this week. */
  salary: boolean;
};

export type SalaryDay = {
  date: string;
  daysAway: number;
  salaryPaise: number;
  /** In the bank once salaries are paid. Negative is the Shortfall. */
  cashAfterPaise: number;
  /** The working: what comes in and goes out up to and including salary day. */
  receipts: ExpectedReceipt[];
  outflows: Outflow[];
};

export type Totals = {
  receivablesPaise: number;
  receivablesCount: number;
  /** Part of receivables already in the bank, waiting for confirmation. */
  inBankPaise: number;
  /** Part of receivables held up by a Dispute. */
  disputedPaise: number;
  overduePaise: number;
  overdueCount: number;
  /** Expected in, delay-adjusted, from the Demo date to `expectedUntil`. */
  expectedPaise: number;
  /** Going out over the same 30 days. */
  upcomingPaise: number;
  expectedUntil: string;
};

export type AgeingKey = "0-30" | "31-60" | "61-90" | "90+";
export type AgeingBucket = { key: AgeingKey; label: string; amountPaise: number; count: number };

export type ChaseRow = {
  invoiceId: string;
  customerName: string;
  number: string;
  amountPaise: number;
  daysLate: number;
  /** How much of the salary-day Shortfall this payment closes (all of it once covered). */
  gapClosedPaise: number;
  /** Call with AI when the Customer agreed to calls and the reminders are done; else open the Invoice. */
  action: "call" | "open";
  reason: string;
  /** The reason's parts, so a screen can word it in the Owner's language. */
  why: ChaseWhy;
};

export type ChaseWhy = {
  /** "none": salaries are covered, so it brings in its amount; "all" or "part" of the salary gap. */
  gap: "none" | "all" | "part";
  gapPaise: number;
  avgDelayDays: number | null;
  /** Days since the last Reminder; null when there was none. */
  reminderAgoDays: number | null;
};

export type DaysToGetPaid = {
  /** Mean days from Invoice date to payment, Invoices paid in the last 6 months. Null when none. */
  days: number | null;
  count: number;
  /** The same, if each open approved Promise is kept on its last date. Null when there are none. */
  ifKeptDays: number | null;
  promisedCount: number;
};

/** What the last 3 months of invoicing say will come in each week from Invoices not raised yet. */
export type NewSales = { weeklyPaise: number; fromDate: string };

export type TodayBook = {
  /** In the bank on the Demo date. */
  cashTodayPaise: number;
  receivables: Receivable[];
  /** Every receipt the 13 weeks expect, by date. */
  receipts: ExpectedReceipt[];
  /** Every payment going out in the 13 weeks, by date. */
  outflows: Outflow[];
  weeks: ForecastWeek[];
  salary: SalaryDay | null;
  totals: Totals;
  ageing: AgeingBucket[];
  chase: ChaseRow[];
  daysToGetPaid: DaysToGetPaid;
  newSales: NewSales;
};

export const FORECAST_WEEKS = 13;
/** New Invoices are paid this many days after they are raised when the books cannot say. */
const USUAL_PAY_DAYS = 30;
const CHASE_ROWS = 5;

/** Days past due, in four buckets. Not yet due counts as 0. */
export const AGEING_BUCKETS: readonly { key: AgeingKey; label: string; upTo: number }[] = [
  { key: "0-30", label: "0–30", upTo: 30 },
  { key: "31-60", label: "31–60", upTo: 60 },
  { key: "61-90", label: "61–90", upTo: 90 },
  { key: "90+", label: "90+", upTo: Infinity },
];

export function ageingBucket(daysLate: number): AgeingKey {
  return AGEING_BUCKETS.find((b) => daysLate <= b.upTo)?.key ?? "90+";
}

/** How the chase order is worked out, in the words the "Why?" shows. */
export const CHASE_WHY =
  "Each unpaid Invoice scores the part of the salary-day gap its payment would close (once salaries are covered, its whole amount), times how reliably the Customer pays (Grade A 3, B 2, C 1), divided by the effort (a call 2, a reminder 1). Lateness adds to it: every 30 days late adds the score once more, so 60 days late counts three times. Invoices with a Promise, a Dispute, money already in the bank, or a payment already expected before salary day are left out, and so are Invoices not yet due while any Invoice is overdue.";

const LIKELIHOOD: Record<CustomerGrade["grade"], number> = { A: 3, B: 2, C: 1 };
/** Each this many days late adds the score once more. */
const LATENESS_DAYS = 30;

/** The headline while salary day is short: "Salary day tomorrow". */
export function salaryDayIn(daysAway: number): string {
  if (daysAway <= 0) return "Salary day today";
  if (daysAway === 1) return "Salary day tomorrow";
  return `Salary day in ${daysAway} days`;
}

/**
 * Expected new sales: a week's share of what was invoiced in the 3 months
 * before the Demo date (13 weeks), arriving from the day an Invoice raised
 * today would be paid, at the Customers' usual pace.
 */
export function expectedNewSales(
  invoices: readonly Pick<BookInvoice, "issueDate" | "status" | "totalPaise">[],
  today: string,
  daysToGetPaid: number | null,
): NewSales {
  const since = addMonths(today, -3);
  const raised = invoices.filter(
    (i) => i.status !== "draft" && i.status !== "cancelled" && i.issueDate >= since && i.issueDate < today,
  );
  return {
    // An estimate, so to the nearest ₹100.
    weeklyPaise: nearestPaise(sharePaise(sumPaise(raised.map((i) => i.totalPaise)), FORECAST_WEEKS), 10_000),
    fromDate: addDays(today, daysToGetPaid ?? USUAL_PAY_DAYS),
  };
}

/**
 * The opening balance, plus Bank credits dated from `cashAsOf` on and payments
 * recorded by hand from then up to the Demo date, less payments out from then
 * until the Demo date.
 */
function cashToday(input: BookInput): number {
  const asOf = input.cashAsOf ?? input.today;
  const byHand = (input.received ?? []).filter((r) => r.date >= asOf && r.date <= input.today).map((r) => r.amountPaise);
  if (asOf >= input.today) return sumPaise([input.openingCashPaise, ...byHand]);
  const credits = input.bankCredits.filter((c) => c.date !== undefined && c.date >= asOf).map((c) => c.amountPaise ?? 0);
  const paidOut = expandCashItems(input.cashItems, asOf, addDays(input.today, -1)).map((o) => o.amountPaise);
  return differencePaise(sumPaise([input.openingCashPaise, ...credits, ...byHand]), sumPaise(paidOut));
}

export function todayBook(input: BookInput): TodayBook {
  const { today } = input;
  const horizonEnd = addDays(today, FORECAST_WEEKS * 7 - 1);
  const cashTodayPaise = cashToday(input);
  const customers = new Map(input.customers.map((c) => [c.$id, c]));

  const grades = new Map<string, CustomerGrade>();
  const gradeOf = (customerId: string) => {
    let found = grades.get(customerId);
    if (!found) {
      const invoices = input.invoices.filter((i) => i.customerId === customerId);
      const ids = new Set(invoices.map((i) => i.$id));
      found = gradeCustomer(
        today,
        invoices.map((i) => ({ id: i.$id, dueDate: i.dueDate, status: i.status })),
        input.events.filter((e) => ids.has(e.invoiceId)),
        input.promises
          .filter((p) => ids.has(p.invoiceId))
          .map((p) => ({ invoiceId: p.invoiceId, status: p.status, dates: p.instalments.map((x) => x.date) })),
      );
      grades.set(customerId, found);
    }
    return found;
  };

  const inBank = suggestedInBank(input.bankCredits);
  const waiting = waitingInBank(input.bankCredits, input.invoices);

  const receivables: Receivable[] = [];
  const receipts: ExpectedReceipt[] = [];
  for (const invoice of input.invoices) {
    if (isClosed(invoice.status) || invoice.status === "draft") continue;
    const promises = input.promises.filter((p) => p.invoiceId === invoice.$id);
    const standing = invoiceStanding(invoice, promises, today);
    const banked = inBank.get(invoice.$id) ?? 0;
    const owedLeft = differencePaise(standing.balancePaise, banked);
    const toComePaise = owedLeft > 0 ? owedLeft : 0;
    const customerName = customers.get(invoice.customerId)?.name ?? "Unknown Customer";
    const grade = gradeOf(invoice.customerId);
    const expect = (date: string, amountPaise: number, basis: ExpectedReceipt["basis"]) => {
      if (date <= horizonEnd) receipts.push({ invoiceId: invoice.$id, customerName, date, amountPaise, basis });
    };

    let counted: Counted;
    const promise = promises.find((p) => p.status === "approved");
    if (invoice.status === "disputed") counted = "disputed";
    else if (waiting.has(invoice.$id)) counted = "in_bank";
    else if (promise) {
      let left = toComePaise;
      let any = false;
      for (const instalment of [...promise.instalments].sort((a, b) => a.date.localeCompare(b.date))) {
        if (instalment.date < today || left <= 0) continue;
        const amount = instalment.amountPaise < left ? instalment.amountPaise : left;
        expect(instalment.date, amount, "promise");
        left = differencePaise(left, amount);
        any = true;
      }
      counted = any ? "promise" : "promise_passed";
    } else {
      const usual = addDays(invoice.dueDate, Math.max(0, grade.avgDelayDays ?? 0));
      if (usual < today) counted = "later_than_usual";
      else {
        counted = "usual";
        expect(usual, toComePaise, "usual");
      }
    }

    receivables.push({
      invoiceId: invoice.$id,
      customerId: invoice.customerId,
      customerName,
      number: invoice.number,
      dueDate: invoice.dueDate,
      balancePaise: standing.balancePaise,
      inBankPaise: banked,
      toComePaise,
      daysLate: standing.daysLate,
      grade,
      counted,
    });
  }
  receipts.sort((a, b) => a.date.localeCompare(b.date));

  const outflows = expandCashItems(input.cashItems, today, horizonEnd);

  const gettingPaid = daysToGetPaid(input);
  const newSales = expectedNewSales(input.invoices, today, gettingPaid.days);
  const weeks: ForecastWeek[] = [];
  let cash = cashTodayPaise;
  for (let w = 0; w < FORECAST_WEEKS; w++) {
    const start = addDays(today, w * 7);
    const end = addDays(start, 6);
    const within = <T extends { date: string }>(rows: readonly T[]) =>
      rows.filter((r) => r.date >= start && r.date <= end);
    const ins = within(receipts);
    const outs = within(outflows);
    const inPaise = sumPaise(ins.map((r) => r.amountPaise));
    const outPaise = sumPaise(outs.map((o) => o.amountPaise));
    const newSalesPaise = start >= newSales.fromDate ? newSales.weeklyPaise : 0;
    cash = differencePaise(sumPaise([cash, inPaise, newSalesPaise]), outPaise);
    weeks.push({
      start,
      end,
      inPaise,
      outPaise,
      newSalesPaise,
      closePaise: cash,
      salary: outs.some((o) => o.kind === "salary"),
    });
  }

  const salaryDate = outflows.find((o) => o.kind === "salary")?.date;
  let salary: SalaryDay | null = null;
  if (salaryDate) {
    const upTo = <T extends { date: string }>(rows: readonly T[]) => rows.filter((r) => r.date <= salaryDate);
    const ins = upTo(receipts);
    const outs = upTo(outflows);
    salary = {
      date: salaryDate,
      daysAway: daysBetween(today, salaryDate),
      salaryPaise: sumPaise(outs.filter((o) => o.date === salaryDate && o.kind === "salary").map((o) => o.amountPaise)),
      cashAfterPaise: differencePaise(
        sumPaise([cashTodayPaise, ...ins.map((r) => r.amountPaise)]),
        sumPaise(outs.map((o) => o.amountPaise)),
      ),
      receipts: ins,
      outflows: outs,
    };
  }

  const expectedUntil = addDays(today, 29);
  const overdue = receivables.filter((r) => r.daysLate > 0);
  const totals: Totals = {
    receivablesPaise: sumPaise(receivables.map((r) => r.balancePaise)),
    receivablesCount: receivables.length,
    inBankPaise: sumPaise(receivables.map((r) => (r.inBankPaise < r.balancePaise ? r.inBankPaise : r.balancePaise))),
    disputedPaise: sumPaise(receivables.filter((r) => r.counted === "disputed").map((r) => r.balancePaise)),
    overduePaise: sumPaise(overdue.map((r) => r.balancePaise)),
    overdueCount: overdue.length,
    expectedPaise: sumPaise(receipts.filter((r) => r.date <= expectedUntil).map((r) => r.amountPaise)),
    upcomingPaise: sumPaise(outflows.filter((o) => o.date <= expectedUntil).map((o) => o.amountPaise)),
    expectedUntil,
  };

  const ageing = AGEING_BUCKETS.map(({ key, label }) => {
    const inBucket = receivables.filter((r) => ageingBucket(r.daysLate) === key);
    return { key, label, amountPaise: sumPaise(inBucket.map((r) => r.balancePaise)), count: inBucket.length };
  });

  return {
    cashTodayPaise,
    receivables,
    receipts,
    outflows,
    weeks,
    salary,
    totals,
    ageing,
    chase: chaseFirst(input, receivables, receipts, salary, customers),
    daysToGetPaid: gettingPaid,
    newSales,
  };
}

/** Each cash item on its date, and monthly ones on the same day each month, inside the horizon. */
function expandCashItems(items: readonly CashItem[], from: string, to: string): Outflow[] {
  const out: Outflow[] = [];
  for (const item of items) {
    if (!item.date) continue;
    const label = item.label ?? item.kind;
    if (item.recurrence === "monthly") {
      for (let n = 0; ; n++) {
        const date = addMonths(item.date, n);
        if (date > to) break;
        if (date >= from) out.push({ kind: item.kind, label, date, amountPaise: item.amountPaise });
      }
    } else if (item.date >= from && item.date <= to) {
      out.push({ kind: item.kind, label, date: item.date, amountPaise: item.amountPaise });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function chaseFirst(
  input: BookInput,
  receivables: readonly Receivable[],
  receipts: readonly ExpectedReceipt[],
  salary: SalaryDay | null,
  customers: ReadonlyMap<string, BookCustomer>,
): ChaseRow[] {
  const gap = salary && salary.cashAfterPaise < 0 ? -salary.cashAfterPaise : 0;
  const invoices = new Map(input.invoices.map((i) => [i.$id, i]));
  const rows: (ChaseRow & { score: number })[] = [];
  const candidates = receivables.filter((r) => r.toComePaise > 0 && r.counted !== "disputed" && r.counted !== "promise");
  // While anything is overdue, an Invoice not yet due waits its turn.
  const anyLate = candidates.some((r) => r.daysLate > 0);
  for (const r of candidates) {
    if (anyLate && r.daysLate === 0) continue;
    const expectedBySalary = salary !== null && receipts.some((x) => x.invoiceId === r.invoiceId && x.date <= salary.date);
    let gapClosedPaise: number;
    if (gap === 0) gapClosedPaise = r.toComePaise;
    else if (expectedBySalary) continue;
    else gapClosedPaise = r.toComePaise < gap ? r.toComePaise : gap;

    const invoice = invoices.get(r.invoiceId);
    const call = customers.get(r.customerId)?.consentCalls === true && r.daysLate > 0 && (invoice?.ladderStage ?? 0) >= 3;
    const effort = call ? 2 : 1;
    // A ranking weight in whole basis points, not money: rounding it only orders near-ties.
    const weightBps = Math.round((LIKELIHOOD[r.grade.grade] * 10_000 * (LATENESS_DAYS + r.daysLate)) / (LATENESS_DAYS * effort));
    const score = percentOfPaise(gapClosedPaise, weightBps);

    const what =
      gap === 0
        ? `Brings in ${formatInr(r.toComePaise)}`
        : gapClosedPaise >= gap
          ? "Closes the whole salary gap"
          : `Closes ${formatInr(gapClosedPaise)} of the ${formatInr(gap)} salary gap`;
    const habit = paymentHabit(r.grade.avgDelayDays);
    rows.push({
      invoiceId: r.invoiceId,
      customerName: r.customerName,
      number: r.number,
      amountPaise: r.toComePaise,
      daysLate: r.daysLate,
      gapClosedPaise,
      action: call ? "call" : "open",
      reason: `${what}. ${habit.charAt(0).toUpperCase()}${habit.slice(1)}; ${lastReminder(input, r.invoiceId)}.`,
      why: {
        gap: gap === 0 ? "none" : gapClosedPaise >= gap ? "all" : "part",
        gapPaise: gap,
        avgDelayDays: r.grade.avgDelayDays,
        reminderAgoDays: reminderAgo(input, r.invoiceId),
      },
      score,
    });
  }
  return rows
    .sort((a, b) => b.score - a.score || b.daysLate - a.daysLate || b.amountPaise - a.amountPaise)
    .slice(0, CHASE_ROWS)
    .map(({ score: _score, ...row }) => row);
}

function reminderAgo(input: BookInput, invoiceId: string): number | null {
  const last = latestDate(input.events.filter((e) => e.invoiceId === invoiceId && e.type === "reminder").map((e) => e.date));
  if (last === null) return null;
  const ago = daysBetween(last, input.today);
  return ago < 0 ? 0 : ago;
}

function lastReminder(input: BookInput, invoiceId: string): string {
  const ago = reminderAgo(input, invoiceId);
  if (ago === null) return "no reminder yet";
  if (ago <= 0) return "reminded today";
  return `no reminder in ${ago} ${ago === 1 ? "day" : "days"}`;
}

function latestDate(dates: readonly string[]): string | null {
  return dates.reduce<string | null>((latest, d) => (latest === null || d > latest ? d : latest), null);
}

function meanDays(days: readonly number[]): number | null {
  if (days.length === 0) return null;
  let sum = 0;
  for (const d of days) sum += d;
  return Math.round(sum / days.length);
}

function daysToGetPaid(input: BookInput): DaysToGetPaid {
  const since = addMonths(input.today, -6);
  const paid: number[] = [];
  for (const invoice of input.invoices) {
    if (invoice.status !== "paid") continue;
    // Paid in full on the last payment.
    const paidOn = latestDate(
      input.events.filter((e) => e.invoiceId === invoice.$id && e.type === "payment").map((e) => e.date),
    );
    if (!paidOn || paidOn < since || paidOn > input.today) continue;
    paid.push(daysBetween(invoice.issueDate, paidOn));
  }
  const promised: number[] = [];
  for (const invoice of input.invoices) {
    if (isClosed(invoice.status) || invoice.status === "draft") continue;
    const promise = input.promises.find((p) => p.invoiceId === invoice.$id && p.status === "approved");
    const last = latestDate(promise?.instalments.map((x) => x.date) ?? []);
    if (last) promised.push(daysBetween(invoice.issueDate, last));
  }
  return {
    days: meanDays(paid),
    count: paid.length,
    ifKeptDays: promised.length > 0 ? meanDays([...paid, ...promised]) : null,
    promisedCount: promised.length,
  };
}

export type PayPackets = {
  count: number;
  /** One packet, rounded to ₹500: "about ₹17,500 each". */
  aboutEachPaise: number;
  /** Salary money in hand on salary day. */
  fundedPaise: number;
  /** Packets filled completely. */
  full: number;
  /** How full each packet is, 0 to 1, for drawing. */
  fills: number[];
};

/** The salary as `count` envelopes, filled with what salary day leaves in hand. */
export function payPackets(day: Pick<SalaryDay, "salaryPaise" | "cashAfterPaise">, count: number): PayPackets {
  const short = day.cashAfterPaise < 0 ? -day.cashAfterPaise : 0;
  const owed = differencePaise(day.salaryPaise, short);
  const fundedPaise = owed > 0 ? owed : 0;
  const each = sharePaise(day.salaryPaise, count);
  // Drawing only: how many envelopes the funded money fills.
  const filled = day.salaryPaise > 0 ? (fundedPaise / day.salaryPaise) * count : 0;
  const fills = Array.from({ length: count }, (_, i) => Math.max(0, Math.min(1, filled - i)));
  return {
    count,
    aboutEachPaise: nearestPaise(each, 50_000),
    fundedPaise,
    full: fills.filter((f) => f >= 1).length,
    fills,
  };
}
