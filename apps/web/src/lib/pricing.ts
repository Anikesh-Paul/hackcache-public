import type { CustomerRow, InvoiceLineRow, InvoiceRow, WorkspaceRow } from "@tagada/appwrite";
import { invoiceTotals, isGstRate, type InvoiceTotals } from "@tagada/money";

/** Prices stored lines again with `money`, so every figure on screen comes from the engine. */
export function priceLines(workspace: WorkspaceRow, customer: CustomerRow, lines: InvoiceLineRow[]): InvoiceTotals {
  return invoiceTotals({
    registration: workspace.registrationType,
    supplierStateCode: workspace.stateCode ?? "",
    placeOfSupplyStateCode: customer.stateCode ?? "",
    aggregateTurnoverPaise: workspace.aggregateTurnoverPaise ?? 0,
    lines: lines.map((line) => {
      const rate = line.gstRateBp / 100;
      if (!isGstRate(rate)) throw new Error(`GST rate ${rate}% is not configured`);
      return {
        quantity: line.qtyMilli / 1000,
        ratePaise: line.ratePaise,
        discountPercent: line.discountBp / 100,
        gstRatePercent: rate,
      };
    }),
  });
}

/** True when the stored Invoice row carries exactly the totals the engine computes. */
export function storedTotalsMatch(invoice: InvoiceRow, priced: InvoiceTotals): boolean {
  return (
    invoice.taxablePaise === priced.taxablePaise &&
    invoice.cgstPaise === priced.cgstPaise &&
    invoice.sgstPaise === priced.sgstPaise &&
    invoice.igstPaise === priced.igstPaise &&
    invoice.roundOffPaise === priced.roundOffPaise &&
    invoice.totalPaise === priced.totalPaise
  );
}

/** The calendar day an event happened, in IST, whatever zone Appwrite returns it in. */
export function istDay(at: string): string {
  return new Date(Date.parse(at) + 330 * 60_000).toISOString().slice(0, 10);
}
