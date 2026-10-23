// Open Invoices in the shape `domain.matcher` reads. Line taxable values are
// recomputed by `money`, from the stored quantity, rate and discount.
import type { CustomerRow, InvoiceLineRow, InvoiceRow } from "@tagada/appwrite";
import type { MatchInvoice } from "@tagada/domain";
import { invoiceTotals, isGstRate } from "@tagada/money";

type Line = Pick<InvoiceLineRow, "invoiceId" | "hsn" | "qtyMilli" | "ratePaise" | "discountBp" | "gstRateBp">;

function lineTaxable(line: Line): number {
  const gstRatePercent = line.gstRateBp / 100;
  const quantity = line.qtyMilli / 1000;
  const discountPercent = line.discountBp / 100;
  if (!isGstRate(gstRatePercent) || !Number.isInteger(quantity) || !Number.isInteger(discountPercent)) return 0;
  return invoiceTotals({
    registration: "regular",
    supplierStateCode: "16",
    placeOfSupplyStateCode: "16",
    aggregateTurnoverPaise: 0,
    lines: [{ quantity, ratePaise: line.ratePaise, discountPercent, gstRatePercent }],
  }).taxablePaise;
}

/** Open Invoices a Bank credit can match. Paid and draft Invoices are left out. */
export function invoicesForMatch(input: {
  customers: readonly Pick<CustomerRow, "$id" | "name" | "buyerType">[];
  invoices: readonly Pick<
    InvoiceRow,
    "$id" | "number" | "customerId" | "issueDate" | "taxablePaise" | "totalPaise" | "paidPaise" | "status"
  >[];
  lines: readonly Line[];
}): MatchInvoice[] {
  const customers = new Map(input.customers.map((customer) => [customer.$id, customer]));
  return input.invoices
    .filter((invoice) => invoice.status !== "paid" && invoice.status !== "draft" && invoice.totalPaise > invoice.paidPaise)
    .map((invoice) => {
      const customer = customers.get(invoice.customerId);
      return {
        id: invoice.$id,
        number: invoice.number,
        customerId: invoice.customerId,
        customerName: customer?.name ?? "",
        buyerType: customer?.buyerType ?? null,
        issueDate: invoice.issueDate,
        taxablePaise: invoice.taxablePaise,
        totalPaise: invoice.totalPaise,
        paidPaise: invoice.paidPaise,
        lines: input.lines
          .filter((line) => line.invoiceId === invoice.$id)
          .map((line) => ({ taxablePaise: lineTaxable(line), gstRateBp: line.gstRateBp, hsn: line.hsn })),
      };
    });
}
