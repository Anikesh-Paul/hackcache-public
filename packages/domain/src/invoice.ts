import { daysBetween, differencePaise } from "@tagada/money";

/** What the rules need to know about one Invoice row. Dates are "YYYY-MM-DD". */
export type InvoiceFacts = {
  totalPaise: number;
  paidPaise: number;
  status: "draft" | "sent" | "part" | "paid" | "disputed";
  dueDate: string;
  /** Last Ladder stage taken, 0 when none. */
  ladderStage: number;
  pausedUntil: string | null;
  pauseReason: string | null;
};

export type PromiseFacts = {
  status: "needs_owner" | "approved" | "kept" | "broken" | "declined";
  instalments: { amountPaise: number; date: string }[];
};

export type InvoiceState = "paid" | "disputed" | "promised" | "overdue" | "open";

export type InvoiceStanding = {
  state: InvoiceState;
  /** Still owed. 0 once paid. */
  balancePaise: number;
  /** Whole days past the due date; 0 until it has passed, and once paid. */
  daysLate: number;
  /** Whole days from the Demo date to the due date; negative once past. */
  daysToDue: number;
};

/** Where an Invoice stands on the Demo date `today`. */
export function invoiceStanding(
  invoice: InvoiceFacts,
  promises: readonly PromiseFacts[],
  today: string,
): InvoiceStanding {
  const daysToDue = daysBetween(today, invoice.dueDate);
  if (invoice.status === "paid") return { state: "paid", balancePaise: 0, daysLate: 0, daysToDue };
  const balancePaise = differencePaise(invoice.totalPaise, invoice.paidPaise);
  const daysLate = Math.max(0, -daysToDue);
  const state: InvoiceState =
    invoice.status === "disputed"
      ? "disputed"
      : promises.some((p) => p.status === "approved")
        ? "promised"
        : daysLate > 0
          ? "overdue"
          : "open";
  return { state, balancePaise, daysLate, daysToDue };
}

export const INVOICE_FILTERS = ["all", "overdue", "promised", "disputed", "paid"] as const;

export type InvoiceFilter = (typeof INVOICE_FILTERS)[number];

export function isInvoiceFilter(value: string): value is InvoiceFilter {
  return (INVOICE_FILTERS as readonly string[]).includes(value);
}

export function matchesFilter(standing: InvoiceStanding, filter: InvoiceFilter): boolean {
  return filter === "all" || standing.state === filter;
}
