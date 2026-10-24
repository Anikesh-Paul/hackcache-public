import { describe, expect, it } from "vitest";
import { compareInvoiceList, type ListedInvoice } from "./invoice-list.ts";

/** The list shows the due date, so that date is the order. Issue date must not decide it. */
function row(state: string, dueDate: string, issueDate: string, number: string): ListedInvoice {
  return { standing: { state }, invoice: { dueDate, issueDate, number } };
}

describe("compareInvoiceList", () => {
  it("puts open Invoices before paid ones", () => {
    const paid = row("paid", "2026-01-15", "2026-01-01", "TBW/26-27/0001");
    const open = row("overdue", "2026-12-01", "2026-11-01", "TBW/26-27/0009");
    expect([paid, open].sort(compareInvoiceList).map((item) => item.standing.state)).toEqual(["overdue", "paid"]);
  });

  it("sorts open Invoices by the due date shown, oldest first", () => {
    const later = row("overdue", "2026-08-05", "2026-06-01", "TBW/26-27/0003");
    const earlier = row("open", "2026-07-29", "2026-08-01", "TBW/26-27/0008");
    expect([later, earlier].sort(compareInvoiceList).map((item) => item.invoice.dueDate)).toEqual([
      "2026-07-29",
      "2026-08-05",
    ]);
  });

  it("sorts paid Invoices by the due date shown, newest first", () => {
    // Issued later, but the date on the row is 29 Jul. Sorting by number or issue date puts it above 5 Aug.
    const july = row("paid", "2026-07-29", "2026-08-01", "TBW/26-27/0008");
    const august = row("paid", "2026-08-05", "2026-06-01", "TBW/26-27/0003");
    expect([july, august].sort(compareInvoiceList).map((item) => item.invoice.dueDate)).toEqual([
      "2026-08-05",
      "2026-07-29",
    ]);
  });
});
