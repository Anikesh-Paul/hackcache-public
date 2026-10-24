import type { InvoiceState } from "@tagada/domain";

/** What the Invoices list needs in order to sort a row. */
export type ListedInvoice = {
  standing: { state: InvoiceState };
  invoice: { dueDate: string; issueDate: string; number: string };
};

/**
 * Unpaid Invoices first, oldest due date first. Paid and cancelled Invoices after them, newest due date first.
 * The row shows the due date, so that is the date the order follows.
 */
export function compareInvoiceList(a: ListedInvoice, b: ListedInvoice): number {
  const paidA = a.standing.state === "paid" || a.standing.state === "cancelled";
  const paidB = b.standing.state === "paid" || b.standing.state === "cancelled";
  if (paidA !== paidB) return paidA ? 1 : -1;
  const direction = paidA ? -1 : 1;
  const byDue = a.invoice.dueDate.localeCompare(b.invoice.dueDate);
  if (byDue !== 0) return byDue * direction;
  return a.invoice.number.localeCompare(b.invoice.number) * direction;
}
