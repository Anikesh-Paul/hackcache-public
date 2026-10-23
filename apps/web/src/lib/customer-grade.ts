import type { EventRow, InvoiceRow } from "@tagada/appwrite";
import { gradeCustomer, type CustomerGrade, type PromiseFacts } from "@tagada/domain";
import { istDay } from "./pricing.ts";

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
