export {
  COMPOSITION_HEADING,
  E_INVOICE_NOTE,
  E_INVOICE_TURNOVER_PAISE,
  GST_RATES,
  SECTION16_RATE_BEFORE_BPS,
  SECTION16_RATE_CHANGE,
  SECTION16_RATE_FROM_BPS,
  isGstRate,
} from "./config.ts";
export type { GstRate } from "./config.ts";

export { formatInr, formatRateBps } from "./format.ts";

export { checkGstin, gstinCheckDigit } from "./gstin.ts";
export type { GstinCheck } from "./gstin.ts";

export { hindiDate, hindiNumber, hindiRupees } from "./hindi.ts";

export { section16Interest, section16RateBps } from "./interest.ts";
export type { Section16Input, Section16Interest, Section16Rest } from "./interest.ts";

export { documentFor, invoiceTotals, needsEInvoice } from "./invoice.ts";
export type {
  DocType,
  DocumentKind,
  InvoiceInput,
  InvoiceLine,
  InvoiceLineInput,
  InvoiceTotals,
  Registration,
} from "./invoice.ts";

export { financialYear, invoiceNumber } from "./numbering.ts";

export { parseAmountPaise } from "./parse.ts";

export { amountInWords } from "./words.ts";

export { runProofCases } from "./proof-cases.ts";
export type { ProofResult } from "./proof-cases.ts";
