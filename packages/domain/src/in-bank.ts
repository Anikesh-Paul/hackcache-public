// Money already in the bank: a Bank credit the matcher suggested against an
// Invoice, not yet confirmed by the Owner. Today, follow-ups, the daily Ladder
// and the pay link all ask the same question here, so none of them chases a
// Customer whose payment is only waiting for the Owner's Confirm.
import { differencePaise, sumPaise } from "@tagada/money";
import type { InvoiceFacts } from "./invoice.ts";

/** A Bank credit with its match parsed. Only a suggested match says the money is in the bank, waiting for the Owner. */
export type BankSuggestion = {
  /** The credit as it came in, when known: it can be more than it settles (an overpayment). */
  amountPaise?: number;
  matchStatus: "unmatched" | "suggested" | "confirmed";
  allocations: readonly { invoiceId: string; amountPaise: number; tdsPaise?: number }[];
};

type OwedInvoice = Pick<InvoiceFacts, "totalPaise" | "paidPaise" | "status"> & { $id: string };

function bySuggestion(credits: readonly BankSuggestion[], part: (a: BankSuggestion["allocations"][number]) => number[]) {
  const parts = new Map<string, number[]>();
  for (const credit of credits) {
    if (credit.matchStatus !== "suggested") continue;
    for (const a of credit.allocations) parts.set(a.invoiceId, [...(parts.get(a.invoiceId) ?? []), ...part(a)]);
  }
  return new Map([...parts].map(([invoiceId, amounts]) => [invoiceId, sumPaise(amounts)]));
}

/** What suggested credits settle against each Invoice, any TDS kept back included. */
export function suggestedInBank(credits: readonly BankSuggestion[]): Map<string, number> {
  return bySuggestion(credits, (a) => [a.amountPaise, a.tdsPaise ?? 0]);
}

/**
 * Invoices with an unconfirmed Bank credit suggested against them: each open
 * Invoice whose suggested credits (with TDS) cover all it still owes, and the
 * money that is in the bank for it. A part payment is not on this list.
 */
export function waitingInBank(credits: readonly BankSuggestion[], invoices: readonly OwedInvoice[]): Map<string, number> {
  const settled = suggestedInBank(credits);
  const cash = bySuggestion(credits, (a) => [a.amountPaise]);
  const out = new Map<string, number>();
  for (const invoice of invoices) {
    const covers = settled.get(invoice.$id);
    if (invoice.status === "paid" || invoice.status === "cancelled" || covers === undefined) continue;
    const owed = differencePaise(invoice.totalPaise, invoice.paidPaise);
    if (owed > 0 && covers >= owed) out.set(invoice.$id, cash.get(invoice.$id) ?? 0);
  }
  return out;
}
