import { COMPOSITION_HEADING, E_INVOICE_NOTE, E_INVOICE_TURNOVER_PAISE, isGstRate, type GstRate } from "./config.ts";
import { divRound, requireInt, toInt } from "./integer.ts";
import { amountInWords } from "./words.ts";

export type Registration = "regular" | "composition" | "unregistered";

export type DocType = "tax_invoice" | "bill_of_supply" | "invoice";

export type InvoiceLineInput = {
  /** Units, to at most three decimals (2.5 kg, 0.75 m). At least 0.001. */
  quantity: number;
  /** Price of one unit, in paise, before the line discount. */
  ratePaise: number;
  /** Whole percent taken off the line before tax. Defaults to 0. */
  discountPercent?: number;
  /** One of `GST_RATES`. Ignored when the seller charges no GST. */
  gstRatePercent: GstRate;
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
  gstRatePercent: GstRate;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
};

export type InvoiceTotals = {
  docType: DocType;
  title: string;
  compositionHeading: string | null;
  lines: InvoiceLine[];
  /** Supplier and place of supply in the same state: CGST + SGST, not IGST. */
  intraState: boolean;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  /** CGST + SGST + IGST. */
  taxPaise: number;
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

/**
 * A quantity in thousandths of a unit, so 2.5 is 2500. A quantity with more
 * than three decimals is refused rather than rounded: the bill would not
 * match what was typed.
 */
export function quantityMilli(quantity: number): bigint {
  if (!Number.isFinite(quantity)) throw new Error("quantity must be a number");
  const milli = Math.round(quantity * 1000);
  if (Math.abs(quantity * 1000 - milli) > 1e-6) throw new Error("quantity has more than three decimals");
  return requireInt(milli, "quantity");
}

function roundPaiseToRupee(paise: bigint): bigint {
  return divRound(paise, 100n) * 100n;
}

/**
 * Price one invoice.
 *
 * Each line's taxable value is quantity × rate, minus the discount, in paise.
 * A part quantity (2.5 kg) rounds the line's value to the paisa, half up.
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
  // §10(2)(c) CGST Act: a composition seller may not make inter-state supplies.
  if (doc.docType === "bill_of_supply" && !intra) {
    throw new Error("a composition seller cannot supply to another state");
  }
  if (input.lines.length === 0) throw new Error("an invoice needs a line");

  let taxable = 0n;
  let cgst = 0n;
  let sgst = 0n;
  let igst = 0n;
  const lines: InvoiceLine[] = [];

  for (const line of input.lines) {
    const milli = quantityMilli(line.quantity);
    const rate = requireInt(line.ratePaise, "ratePaise");
    const discountPercent = requireInt(line.discountPercent ?? 0, "discountPercent");
    if (milli < 1n) throw new Error("quantity must be more than 0");
    if (rate < 0n) throw new Error("ratePaise must be ≥ 0");
    if (discountPercent < 0n || discountPercent > 100n) throw new Error("discountPercent must be from 0 to 100");
    if (!isGstRate(line.gstRatePercent)) throw new Error(`GST rate ${line.gstRatePercent} is not configured`);

    // Whole quantities divide exactly, so their figures are what they always were.
    const gross = divRound(milli * rate, 1000n);
    const discount = divRound(gross * discountPercent, 100n);
    const lineTaxable = gross - discount;
    const halfBps = BigInt(line.gstRatePercent) * 50n;
    const fullBps = BigInt(line.gstRatePercent) * 100n;
    // CGST and SGST are each half the rate, rounded to the paisa on their own, so they are equal.
    const lineCgst = chargesGst && intra ? divRound(lineTaxable * halfBps, 10_000n) : 0n;
    const lineSgst = lineCgst;
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
    intraState: intra,
    taxablePaise: toInt(taxable, "taxable"),
    cgstPaise: toInt(cgst, "cgst"),
    sgstPaise: toInt(sgst, "sgst"),
    igstPaise: toInt(igst, "igst"),
    taxPaise: toInt(cgst + sgst + igst, "tax"),
    roundOffPaise: toInt(total - exact, "round-off"),
    totalPaise,
    amountInWords: amountInWords(totalPaise),
    eInvoiceNote: needsEInvoice(input.aggregateTurnoverPaise) ? E_INVOICE_NOTE : null,
  };
}

/** Quantity and percents in the units an invoice line row stores. */
export function lineMeasures(line: { quantity: number; discountPercent: number; gstRatePercent: number }): {
  qtyMilli: number;
  discountBp: number;
  gstRateBp: number;
} {
  return {
    qtyMilli: Number(quantityMilli(line.quantity)),
    discountBp: line.discountPercent * 100,
    gstRateBp: line.gstRatePercent * 100,
  };
}
