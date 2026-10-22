import {
  COMPOSITION_HEADING,
  E_INVOICE_NOTE,
  E_INVOICE_TURNOVER_PAISE,
  isGstRate,
} from "./config.ts";
import { divRound, requireInt, toInt } from "./integer.ts";
import { amountInWords } from "./words.ts";

export type Registration = "regular" | "composition" | "unregistered";

export type DocType = "tax_invoice" | "bill_of_supply" | "invoice";

export type InvoiceLineInput = {
  /** Whole units. */
  quantity: number;
  /** Price of one unit, in paise, before the line discount. */
  ratePaise: number;
  /** Whole percent taken off the line before tax. Defaults to 0. */
  discountPercent?: number;
  /** Whole percent, one of `GST_RATES`. Ignored when the seller charges no GST. */
  gstRatePercent: number;
};

export type InvoiceInput = {
  registration: Registration;
  supplierStateCode: string;
  placeOfSupplyStateCode: string;
  lines: InvoiceLineInput[];
  /** Drives the e-invoicing note. Does not change the tax. */
  aggregateTurnoverPaise: number;
};

export type InvoiceLine = {
  taxablePaise: number;
  discountPaise: number;
  /** Rate that was asked for. A Bill of Supply still records it, and charges none of it. */
  gstRatePercent: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
};

export type InvoiceTotals = {
  docType: DocType;
  title: string;
  compositionHeading: string | null;
  lines: InvoiceLine[];
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  /** Added so `totalPaise` is a whole rupee. Negative when the paisa were rounded down. */
  roundOffPaise: number;
  totalPaise: number;
  /** Words for `totalPaise`, the rounded rupee, not the pre-round figure. */
  amountInWords: string;
  eInvoiceNote: string | null;
};

export type DocumentKind = {
  docType: DocType;
  title: string;
  compositionHeading: string | null;
};

export function documentFor(registration: Registration): DocumentKind {
  switch (registration) {
    case "regular":
      return { docType: "tax_invoice", title: "Tax Invoice", compositionHeading: null };
    case "composition":
      return {
        docType: "bill_of_supply",
        title: "Bill of Supply",
        compositionHeading: COMPOSITION_HEADING,
      };
    case "unregistered":
      return { docType: "invoice", title: "Invoice", compositionHeading: null };
    default: {
      const never: never = registration;
      throw new Error(`unknown registration: ${String(never)}`);
    }
  }
}

/** True when aggregate turnover is above ₹5 crore. Exactly ₹5 crore is not above. */
export function needsEInvoice(aggregateTurnoverPaise: number): boolean {
  const turnover = requireInt(aggregateTurnoverPaise, "aggregateTurnoverPaise");
  if (turnover < 0n) throw new Error("aggregateTurnoverPaise must be ≥ 0");
  return turnover > BigInt(E_INVOICE_TURNOVER_PAISE);
}

function stateCode(value: string, name: string): string {
  const code = value.trim();
  if (!/^[0-9]{2}$/.test(code)) throw new Error(`${name} must be a two-digit state code`);
  return code;
}

function roundPaiseToRupee(paise: bigint): bigint {
  const rupees = paise / 100n;
  const rem = paise % 100n;
  return (rem * 2n >= 100n ? rupees + 1n : rupees) * 100n;
}

/**
 * Price one invoice.
 *
 * Each line's taxable value is quantity × rate, minus the discount, in paise.
 * CGST and SGST are each half the GST rate and are rounded to the paisa on
 * their own; IGST is the full rate, also per line. The sum is then rounded to
 * the nearest rupee (half up) and the difference is the round-off line.
 * A composition seller and an unregistered seller charge no GST.
 */
export function invoiceTotals(input: InvoiceInput): InvoiceTotals {
  const doc = documentFor(input.registration);
  const chargesGst = doc.docType === "tax_invoice";
  const supplier = stateCode(input.supplierStateCode, "supplierStateCode");
  const place = stateCode(input.placeOfSupplyStateCode, "placeOfSupplyStateCode");
  const intra = supplier === place;
  if (input.lines.length === 0) throw new Error("an invoice needs a line");

  let taxable = 0n;
  let cgst = 0n;
  let sgst = 0n;
  let igst = 0n;
  const lines: InvoiceLine[] = [];

  for (const line of input.lines) {
    const quantity = requireInt(line.quantity, "quantity");
    const rate = requireInt(line.ratePaise, "ratePaise");
    const discountPercent = requireInt(line.discountPercent ?? 0, "discountPercent");
    if (quantity < 1n) throw new Error("quantity must be at least 1");
    if (rate < 0n) throw new Error("ratePaise must be ≥ 0");
    if (discountPercent < 0n || discountPercent > 100n) throw new Error("discountPercent must be from 0 to 100");
    if (!isGstRate(line.gstRatePercent)) throw new Error(`GST rate ${line.gstRatePercent} is not configured`);

    const gross = quantity * rate;
    const discount = divRound(gross * discountPercent, 100n);
    const lineTaxable = gross - discount;
    const halfBps = BigInt(line.gstRatePercent) * 50n;
    const fullBps = BigInt(line.gstRatePercent) * 100n;
    const lineCgst = chargesGst && intra ? divRound(lineTaxable * halfBps, 10_000n) : 0n;
    const lineSgst = chargesGst && intra ? divRound(lineTaxable * halfBps, 10_000n) : 0n;
    const lineIgst = chargesGst && !intra ? divRound(lineTaxable * fullBps, 10_000n) : 0n;

    taxable += lineTaxable;
    cgst += lineCgst;
    sgst += lineSgst;
    igst += lineIgst;
    lines.push({
      taxablePaise: toInt(lineTaxable, "taxable"),
      discountPaise: toInt(discount, "discount"),
      gstRatePercent: line.gstRatePercent,
      cgstPaise: toInt(lineCgst, "cgst"),
      sgstPaise: toInt(lineSgst, "sgst"),
      igstPaise: toInt(lineIgst, "igst"),
    });
  }

  const exact = taxable + cgst + sgst + igst;
  const total = roundPaiseToRupee(exact);
  const totalPaise = toInt(total, "total");
  return {
    ...doc,
    lines,
    taxablePaise: toInt(taxable, "taxable"),
    cgstPaise: toInt(cgst, "cgst"),
    sgstPaise: toInt(sgst, "sgst"),
    igstPaise: toInt(igst, "igst"),
    roundOffPaise: toInt(total - exact, "round-off"),
    totalPaise,
    amountInWords: amountInWords(totalPaise),
    eInvoiceNote: needsEInvoice(input.aggregateTurnoverPaise) ? E_INVOICE_NOTE : null,
  };
}
