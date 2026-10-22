import { E_INVOICE_TURNOVER_PAISE } from "./config.ts";
import { formatInr, formatRateBps } from "./format.ts";
import { checkGstin } from "./gstin.ts";
import { hindiDate, hindiNumber } from "./hindi.ts";
import { section16Interest } from "./interest.ts";
import { documentFor, invoiceTotals, type InvoiceInput, type InvoiceLineInput } from "./invoice.ts";
import { invoiceNumber } from "./numbering.ts";
import { parseAmountPaise } from "./parse.ts";

export type ProofResult = {
  id: string;
  area: string;
  input: string;
  expected: string;
  actual: string;
  pass: boolean;
};

type ProofCase = {
  id: string;
  area: string;
  input: string;
  expected: string;
  actual: () => string;
};

const SELLER = {
  registration: "regular" as const,
  supplierStateCode: "16",
  placeOfSupplyStateCode: "16",
  aggregateTurnoverPaise: 0,
};

function price(lines: InvoiceLineInput[], over: Partial<InvoiceInput> = {}) {
  return invoiceTotals({ ...SELLER, lines, ...over });
}

function taxLine(bill: ReturnType<typeof invoiceTotals>, kind: "split" | "igst"): string {
  if (kind === "igst") return `IGST ${formatInr(bill.igstPaise)} = ${formatInr(bill.totalPaise)}`;
  return `CGST ${formatInr(bill.cgstPaise)} + SGST ${formatInr(bill.sgstPaise)} = ${formatInr(bill.totalPaise)}`;
}

const CASES: readonly ProofCase[] = [
  {
    id: "gst-intra-18",
    area: "GST",
    input: "₹10,000 at 18%, same state",
    expected: "CGST ₹900 + SGST ₹900 = ₹11,800",
    actual: () => taxLine(price([{ quantity: 1, ratePaise: 1_000_000, gstRatePercent: 18 }]), "split"),
  },
  {
    id: "gst-inter-18",
    area: "GST",
    input: "₹10,000 at 18%, other state",
    expected: "IGST ₹1,800 = ₹11,800",
    actual: () =>
      taxLine(
        price([{ quantity: 1, ratePaise: 1_000_000, gstRatePercent: 18 }], { placeOfSupplyStateCode: "19" }),
        "igst",
      ),
  },
  {
    id: "gst-3x333",
    area: "GST",
    input: "3 × ₹333 at 5%, same state",
    expected: "taxable ₹999, CGST ₹24.98 + SGST ₹24.98, round-off +₹0.04 = ₹1,049",
    actual: () => {
      const bill = price([{ quantity: 3, ratePaise: 33_300, gstRatePercent: 5 }]);
      return `taxable ${formatInr(bill.taxablePaise)}, CGST ${formatInr(bill.cgstPaise)} + SGST ${formatInr(bill.sgstPaise)}, round-off ${formatInr(bill.roundOffPaise, { signed: true })} = ${formatInr(bill.totalPaise)}`;
    },
  },
  {
    id: "gst-discount",
    area: "GST",
    input: "₹10,000 with a 10% line discount, 18%, same state",
    expected: "taxable ₹9,000, CGST ₹810 + SGST ₹810 = ₹10,620",
    actual: () => {
      const bill = price([{ quantity: 1, ratePaise: 1_000_000, discountPercent: 10, gstRatePercent: 18 }]);
      return `taxable ${formatInr(bill.taxablePaise)}, CGST ${formatInr(bill.cgstPaise)} + SGST ${formatInr(bill.sgstPaise)} = ${formatInr(bill.totalPaise)}`;
    },
  },
  {
    id: "gst-composition",
    area: "GST",
    input: "Composition seller, ₹10,000 at 18%, same state",
    expected: "Bill of Supply, tax ₹0 = ₹10,000",
    actual: () => {
      const bill = price([{ quantity: 1, ratePaise: 1_000_000, gstRatePercent: 18 }], {
        registration: "composition",
      });
      const tax = bill.cgstPaise + bill.sgstPaise + bill.igstPaise;
      return `${bill.title}, tax ${formatInr(tax)} = ${formatInr(bill.totalPaise)}`;
    },
  },
  {
    id: "gst-zero",
    area: "GST",
    input: "₹500 at 0%",
    expected: "Tax Invoice, tax ₹0 = ₹500",
    actual: () => {
      const bill = price([{ quantity: 1, ratePaise: 50_000, gstRatePercent: 0 }]);
      const tax = bill.cgstPaise + bill.sgstPaise + bill.igstPaise;
      return `${bill.title}, tax ${formatInr(tax)} = ${formatInr(bill.totalPaise)}`;
    },
  },
  {
    id: "gst-split-rounding",
    area: "GST",
    input: "₹1 at 5%. CGST and SGST each rounded to the paisa",
    expected: "CGST ₹0.03 + SGST ₹0.03; IGST ₹0.05",
    actual: () => {
      const line = { quantity: 1, ratePaise: 100, gstRatePercent: 5 };
      const intra = price([line]);
      const inter = price([line], { placeOfSupplyStateCode: "19" });
      return `CGST ${formatInr(intra.cgstPaise)} + SGST ${formatInr(intra.sgstPaise)}; IGST ${formatInr(inter.igstPaise)}`;
    },
  },
  {
    id: "gst-half-rupee",
    area: "GST",
    input: "₹10.50 and ₹10.49, no tax, round-off to the rupee",
    expected: "₹10.50 → ₹11 (Eleven Rupees Only); ₹10.49 → ₹10 (Ten Rupees Only)",
    actual: () => {
      const up = price([{ quantity: 1, ratePaise: 1_050, gstRatePercent: 0 }]);
      const down = price([{ quantity: 1, ratePaise: 1_049, gstRatePercent: 0 }]);
      return `${formatInr(1_050)} → ${formatInr(up.totalPaise)} (${up.amountInWords}); ${formatInr(1_049)} → ${formatInr(down.totalPaise)} (${down.amountInWords})`;
    },
  },
  {
    id: "gst-gupta",
    area: "GST",
    input: "Gupta lines, taxable ₹1,12,381 at 5% IGST",
    expected:
      "taxable ₹1,12,381 + IGST ₹5,619.05, round-off −₹0.05 = ₹1,18,000 · One Lakh Eighteen Thousand Rupees Only",
    actual: () => {
      const bill = price(
        [
          { quantity: 30, ratePaise: 240_000, gstRatePercent: 5 },
          { quantity: 40, ratePaise: 65_000, gstRatePercent: 5 },
          { quantity: 40, ratePaise: 18_000, gstRatePercent: 5 },
          { quantity: 15, ratePaise: 24_000, gstRatePercent: 5 },
          { quantity: 10, ratePaise: 32_000, gstRatePercent: 5 },
          { quantity: 1, ratePaise: 38_100, gstRatePercent: 5 },
        ],
        { placeOfSupplyStateCode: "19" },
      );
      return `taxable ${formatInr(bill.taxablePaise)} + IGST ${formatInr(bill.igstPaise)}, round-off ${formatInr(bill.roundOffPaise, { signed: true })} = ${formatInr(bill.totalPaise)} · ${bill.amountInWords}`;
    },
  },
  {
    id: "interest-2",
    area: "Interest",
    input: "₹1,18,000 for 2 months at 17.25%",
    expected: "₹3,416.88",
    actual: () =>
      formatInr(section16Interest({ principalPaise: 11_800_000, months: 2, annualBps: 1725 }).interestPaise),
  },
  {
    id: "interest-6",
    area: "Interest",
    input: "₹1,18,000 for 6 months at 17.25%",
    expected: "₹10,550.34",
    actual: () =>
      formatInr(section16Interest({ principalPaise: 11_800_000, months: 6, annualBps: 1725 }).interestPaise),
  },
  {
    id: "interest-span",
    area: "Interest",
    input: "₹1,18,000, monthly rests ending 7 Sep 2026 and 7 Oct 2026",
    expected: "16.5% ₹1,622.50, then 17.25% ₹1,719.57 = ₹3,342.07",
    actual: () => {
      const result = section16Interest({ principalPaise: 11_800_000, months: 2, from: "2026-08-07" });
      const parts = result.rests.map((rest) => `${formatRateBps(rest.annualBps)} ${formatInr(rest.interestPaise)}`);
      return `${parts.join(", then ")} = ${formatInr(result.interestPaise)}`;
    },
  },
  {
    id: "gstin",
    area: "GSTIN",
    input: "27AAPFU0939F1ZV, then the same GSTIN with the last character changed",
    expected: "valid, then check-digit",
    actual: () => {
      const label = (gstin: string) => {
        const check = checkGstin(gstin);
        return check.ok ? "valid" : check.reason;
      };
      return `${label("27AAPFU0939F1ZV")}, then ${label("27AAPFU0939F1ZX")}`;
    },
  },
  {
    id: "fy",
    area: "Number",
    input: "Serial 12 on 31 Mar 2026, then serial 1 on 1 Apr 2026",
    expected: "INV/25-26/0012 → INV/26-27/0001",
    actual: () =>
      `${invoiceNumber("INV", "2026-03-31", 12)} → ${invoiceNumber("INV", "2026-04-01", 1)}`,
  },
  {
    id: "hindi",
    area: "Hindi",
    input: "59000, and 6 Nov 2026",
    expected: "उनसठ हज़ार · शुक्रवार, छह नवंबर",
    actual: () => `${hindiNumber(59_000)} · ${hindiDate("2026-11-06")}`,
  },
  {
    id: "parse",
    area: "Amount",
    input: "₹60,000.00, 60000, and Rs. 60,000/-",
    expected: "₹60,000, ₹60,000, ₹60,000",
    actual: () =>
      ["₹60,000.00", "60000", "Rs. 60,000/-"]
        .map((sample) => {
          const paise = parseAmountPaise(sample);
          return paise === null ? "unparsed" : formatInr(paise);
        })
        .join(", "),
  },
  {
    id: "document",
    area: "Document",
    input: "Regular, composition, and unregistered",
    expected:
      "Tax Invoice · Bill of Supply: composition taxable person, not eligible to collect tax on supplies · Invoice",
    actual: () =>
      (["regular", "composition", "unregistered"] as const)
        .map((registration) => {
          const doc = documentFor(registration);
          return doc.compositionHeading ? `${doc.title}: ${doc.compositionHeading}` : doc.title;
        })
        .join(" · "),
  },
  {
    id: "e-invoice",
    area: "E-invoice",
    input: "Turnover of ₹5 crore, and one paisa more",
    expected: "no note · you'd need an IRN from the IRP for this invoice; not generated in this prototype",
    actual: () => {
      const line = { quantity: 1, ratePaise: 100, gstRatePercent: 0 as const };
      const at = price([line], { aggregateTurnoverPaise: E_INVOICE_TURNOVER_PAISE });
      const above = price([line], { aggregateTurnoverPaise: E_INVOICE_TURNOVER_PAISE + 1 });
      return `${at.eInvoiceNote ?? "no note"} · ${above.eInvoiceNote ?? "no note"}`;
    },
  },
];

/** Run every brief case. `actual` is computed; `expected` is the spec literal. */
export function runProofCases(): ProofResult[] {
  return CASES.map((item) => {
    let actual: string;
    try {
      actual = item.actual();
    } catch (error) {
      actual = error instanceof Error ? error.message : "failed";
    }
    return {
      id: item.id,
      area: item.area,
      input: item.input,
      expected: item.expected,
      actual,
      pass: actual === item.expected,
    };
  });
}
