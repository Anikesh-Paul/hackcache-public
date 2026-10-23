import type { EventRow, InvoiceRow } from "@tagada/appwrite";
import { gradeCustomer, invoiceStanding, type CustomerGrade, type PromiseFacts } from "@tagada/domain";
import { sumPaise } from "@tagada/money";
import { istDay } from "./pricing.ts";

/** First letter up, so a grade reason can start a sentence. */
export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function gradeSentence(grade: CustomerGrade): string {
  return `Grade ${grade.grade}. ${capitalise(grade.reason)}`;
}

/** What this Customer's open Invoices still add up to, on the Demo date. */
export function amountOwed(
  invoices: readonly InvoiceRow[],
  promises: ReadonlyMap<string, PromiseFacts[]>,
  today: string,
): number {
  return sumPaise(
    invoices.map((invoice) => invoiceStanding(invoice, promises.get(invoice.$id) ?? [], today).balancePaise),
  );
}

/** "Average 12 days late", or how early they pay. */
export function daysLatePhrase(days: number): string {
  if (days === 0) return "Pays on time, on average";
  if (days < 0) {
    const early = -days;
    return `Usually ${early} ${early === 1 ? "day" : "days"} early`;
  }
  return `Average ${days} ${days === 1 ? "day" : "days"} late`;
}

/** One Customer's grade from the Invoices and history already on screen. */
export function gradeFor(
  today: string,
  invoices: readonly InvoiceRow[],
  events: readonly EventRow[],
  promises: ReadonlyMap<string, PromiseFacts[]>,
): CustomerGrade {
  const ids = new Set(invoices.map((invoice) => invoice.$id));
  return gradeCustomer(
    today,
    invoices.map((invoice) => ({ id: invoice.$id, dueDate: invoice.dueDate, status: invoice.status })),
    events
      .filter((event) => ids.has(event.invoiceId))
      .map((event) => ({ invoiceId: event.invoiceId, type: event.type, date: istDay(event.at) })),
    [...promises.entries()].flatMap(([invoiceId, list]) =>
      ids.has(invoiceId)
        ? list.map((promise) => ({
            invoiceId,
            status: promise.status,
            dates: promise.instalments.map((instalment) => instalment.date),
          }))
        : [],
    ),
  );
}
