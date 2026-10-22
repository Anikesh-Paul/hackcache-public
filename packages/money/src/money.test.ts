import { describe, expect, it } from "vitest";
import {
  E_INVOICE_NOTE,
  E_INVOICE_TURNOVER_PAISE,
  GST_RATES,
  amountInWords,
  checkGstin,
  documentFor,
  financialYear,
  formatInr,
  gstinCheckDigit,
  hindiDate,
  hindiNumber,
  hindiRupees,
  invoiceNumber,
  invoiceTotals,
  needsEInvoice,
  parseAmountPaise,
  runProofCases,
  section16Interest,
  section16RateBps,
  type InvoiceInput,
  type InvoiceLineInput,
} from "./index.ts";

function bill(lines: InvoiceLineInput[], over: Partial<InvoiceInput> = {}) {
  return invoiceTotals({
    registration: "regular",
    supplierStateCode: "16",
    placeOfSupplyStateCode: "16",
    aggregateTurnoverPaise: 0,
    lines,
    ...over,
  });
}

const TEN_THOUSAND: InvoiceLineInput = { quantity: 1, ratePaise: 1_000_000, gstRatePercent: 18 };

describe("GST", () => {
  it("charges ₹10,000 at 18% as CGST ₹900 + SGST ₹900 in the same state", () => {
    const priced = bill([TEN_THOUSAND]);
    expect(priced.taxablePaise).toBe(1_000_000);
    expect(priced.cgstPaise).toBe(90_000);
    expect(priced.sgstPaise).toBe(90_000);
    expect(priced.igstPaise).toBe(0);
    expect(priced.roundOffPaise).toBe(0);
    expect(priced.totalPaise).toBe(1_180_000);
    expect(priced.amountInWords).toBe("Eleven Thousand Eight Hundred Rupees Only");
    expect(priced.title).toBe("Tax Invoice");
  });

  it("charges the same ₹10,000 as IGST ₹1,800 in another state", () => {
    const priced = bill([TEN_THOUSAND], { placeOfSupplyStateCode: "19" });
    expect(priced.cgstPaise).toBe(0);
    expect(priced.sgstPaise).toBe(0);
    expect(priced.igstPaise).toBe(180_000);
    expect(priced.totalPaise).toBe(1_180_000);
  });

  it("prices 3 × ₹333 at 5% from the line total, not from ₹1,000", () => {
    const priced = bill([{ quantity: 3, ratePaise: 33_300, gstRatePercent: 5 }]);
    expect(priced.taxablePaise).toBe(99_900);
    expect(priced.cgstPaise).toBe(2_498);
    expect(priced.sgstPaise).toBe(2_498);
    expect(priced.roundOffPaise).toBe(4);
    expect(priced.totalPaise).toBe(104_900);
    expect(priced.amountInWords).toBe("One Thousand Forty-Nine Rupees Only");
  });

  it("takes a 10% line discount off the taxable value before tax", () => {
    const priced = bill([{ ...TEN_THOUSAND, discountPercent: 10 }]);
    expect(priced.lines[0]).toMatchObject({ discountPaise: 100_000, taxablePaise: 900_000 });
    expect(priced.cgstPaise).toBe(81_000);
    expect(priced.sgstPaise).toBe(81_000);
    expect(priced.totalPaise).toBe(1_062_000);
    expect(priced.amountInWords).toBe("Ten Thousand Six Hundred Twenty Rupees Only");
  });

  it("rounds a half-paisa discount half up", () => {
    const priced = bill([{ quantity: 1, ratePaise: 150, discountPercent: 1, gstRatePercent: 0 }]);
    expect(priced.lines[0]).toMatchObject({ discountPaise: 2, taxablePaise: 148 });
  });

  it("issues a Bill of Supply with no GST for a composition seller", () => {
    const priced = bill([TEN_THOUSAND], { registration: "composition" });
    expect(priced.docType).toBe("bill_of_supply");
    expect(priced.title).toBe("Bill of Supply");
    expect(priced.compositionHeading).toBe(
      "composition taxable person, not eligible to collect tax on supplies",
    );
    expect(priced.cgstPaise + priced.sgstPaise + priced.igstPaise).toBe(0);
    expect(priced.totalPaise).toBe(1_000_000);
    expect(priced.lines[0]?.gstRatePercent).toBe(18);
  });

  it("still applies a line discount on a Bill of Supply", () => {
    const priced = bill([{ ...TEN_THOUSAND, discountPercent: 10 }], { registration: "composition" });
    expect(priced.taxablePaise).toBe(900_000);
    expect(priced.totalPaise).toBe(900_000);
    expect(priced.igstPaise).toBe(0);
  });

  it("keeps a 0% line on a Tax Invoice and charges no tax", () => {
    const priced = bill([{ quantity: 1, ratePaise: 50_000, gstRatePercent: 0 }]);
    expect(priced.docType).toBe("tax_invoice");
    expect(priced.cgstPaise).toBe(0);
    expect(priced.totalPaise).toBe(50_000);
    expect(priced.amountInWords).toBe("Five Hundred Rupees Only");
  });

  it("rounds CGST and SGST separately, so they need not equal IGST", () => {
    const line = { quantity: 1, ratePaise: 100, gstRatePercent: 5 };
    const intra = bill([line]);
    const inter = bill([line], { placeOfSupplyStateCode: "19" });
    expect(intra.cgstPaise).toBe(3);
    expect(intra.sgstPaise).toBe(3);
    expect(inter.igstPaise).toBe(5);
  });

  it("rounds each line before adding, so two ₹1 lines are not one ₹2 line", () => {
    const line = { quantity: 1, ratePaise: 100, gstRatePercent: 5 };
    expect(bill([line, line]).cgstPaise).toBe(6);
  });

  it("rounds half a rupee up and 49 paise down, and the words follow the rounded total", () => {
    const up = bill([{ quantity: 1, ratePaise: 1_050, gstRatePercent: 0 }]);
    const down = bill([{ quantity: 1, ratePaise: 1_049, gstRatePercent: 0 }]);
    expect(up.roundOffPaise).toBe(50);
    expect(up.totalPaise).toBe(1_100);
    expect(up.amountInWords).toBe("Eleven Rupees Only");
    expect(down.roundOffPaise).toBe(-49);
    expect(down.totalPaise).toBe(1_000);
    expect(down.amountInWords).toBe("Ten Rupees Only");
  });

  it("prices the Gupta lines at ₹1,12,381 + ₹5,619.05 IGST, round-off −₹0.05", () => {
    // 30×₹2,400 + 40×₹650 + 40×₹180 + 15×₹240 + 10×₹320 + ₹381.
    const priced = bill(
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
    expect(priced.taxablePaise).toBe(11_238_100);
    expect(priced.igstPaise).toBe(561_905);
    expect(priced.cgstPaise).toBe(0);
    expect(priced.roundOffPaise).toBe(-5);
    expect(priced.totalPaise).toBe(11_800_000);
    expect(priced.amountInWords).toBe("One Lakh Eighteen Thousand Rupees Only");
    expect(amountInWords(11_800_005)).toBe("One Lakh Eighteen Thousand Rupees and Five Paise Only");
    expect(priced.eInvoiceNote).toBeNull();
  });

  it("refuses a GST rate that is not configured", () => {
    expect(GST_RATES).toEqual([0, 5, 18]);
    expect(() => bill([{ quantity: 1, ratePaise: 100, gstRatePercent: 12 }])).toThrow(/not configured/);
  });

  it("refuses money that is not an integer number of paise", () => {
    expect(() => bill([{ quantity: 1, ratePaise: 10.5, gstRatePercent: 0 }])).toThrow(/integer/);
  });
});

describe("document type and e-invoicing", () => {
  it("picks the document from the registration", () => {
    expect(documentFor("regular")).toEqual({
      docType: "tax_invoice",
      title: "Tax Invoice",
      compositionHeading: null,
    });
    expect(documentFor("unregistered").title).toBe("Invoice");
    expect(documentFor("unregistered").docType).toBe("invoice");
    const plain = bill([TEN_THOUSAND], { registration: "unregistered" });
    expect(plain.title).toBe("Invoice");
    expect(plain.cgstPaise + plain.sgstPaise + plain.igstPaise).toBe(0);
    expect(plain.totalPaise).toBe(1_000_000);
  });

  it("notes an IRN only when turnover is above ₹5 crore", () => {
    expect(E_INVOICE_TURNOVER_PAISE).toBe(5_000_000_000);
    expect(needsEInvoice(5_000_000_000)).toBe(false);
    expect(needsEInvoice(4_999_999_999)).toBe(false);
    expect(needsEInvoice(5_000_000_001)).toBe(true);
    expect(E_INVOICE_NOTE).toBe(
      "you'd need an IRN from the IRP for this invoice; not generated in this prototype",
    );
    const above = bill([TEN_THOUSAND], { aggregateTurnoverPaise: 5_000_000_001 });
    expect(above.eInvoiceNote).toBe(E_INVOICE_NOTE);
    expect(above.totalPaise).toBe(1_180_000);
  });
});

describe("§16 interest", () => {
  it("compounds ₹1,18,000 for 2 months at 17.25% to ₹3,416.88", () => {
    const result = section16Interest({ principalPaise: 11_800_000, months: 2, annualBps: 1725 });
    expect(result.interestPaise).toBe(341_688);
    expect(result.rests.map((rest) => rest.interestPaise)).toEqual([169_625, 172_063]);
  });

  it("compounds ₹1,18,000 for 6 months at 17.25% to ₹10,550.34", () => {
    const result = section16Interest({ principalPaise: 11_800_000, months: 6, annualBps: 1725 });
    expect(result.interestPaise).toBe(1_055_034);
  });

  it("uses 16.5% through 6 Oct 2026 and 17.25% from 7 Oct 2026", () => {
    expect(section16RateBps("2026-10-06")).toBe(1650);
    expect(section16RateBps("2026-10-07")).toBe(1725);
    const spanned = section16Interest({ principalPaise: 11_800_000, months: 2, from: "2026-08-07" });
    expect(spanned.rests.map((rest) => [rest.asOf, rest.annualBps, rest.interestPaise])).toEqual([
      ["2026-09-07", 1650, 162_250],
      ["2026-10-07", 1725, 171_957],
    ]);
    expect(spanned.interestPaise).toBe(334_207);
  });

  it("dates a rest on the real month end when the start day does not exist", () => {
    const result = section16Interest({ principalPaise: 11_800_000, months: 2, from: "2026-08-31" });
    expect(result.rests.map((rest) => [rest.asOf, rest.annualBps])).toEqual([
      ["2026-09-30", 1650],
      ["2026-10-31", 1725],
    ]);
  });

  it("matches the flat 17.25% figure when every rest falls after the rate change", () => {
    const dated = section16Interest({ principalPaise: 11_800_000, months: 2, from: "2026-10-07" });
    expect(dated.interestPaise).toBe(341_688);
    expect(dated.rests.every((rest) => rest.annualBps === 1725)).toBe(true);
  });
});

describe("GSTIN", () => {
  it("accepts a check digit and rejects the same number with one character changed", () => {
    expect(checkGstin("27AAPFU0939F1ZV")).toEqual({ ok: true });
    expect(gstinCheckDigit("27AAPFU0939F1Z")).toBe("V");
    expect(checkGstin("27AAPFU0939F1ZX")).toEqual({ ok: false, reason: "check-digit" });
  });

  it("rejects a GSTIN that does not match the pattern", () => {
    expect(checkGstin("27AAPFU0939F1Z")).toEqual({ ok: false, reason: "pattern" });
    expect(checkGstin("not a gstin")).toEqual({ ok: false, reason: "pattern" });
  });
});

describe("financial year numbers", () => {
  it("rolls the series over on 1 Apr and stays within 16 characters", () => {
    expect(financialYear("2026-03-31")).toBe("25-26");
    expect(financialYear("2026-04-01")).toBe("26-27");
    const march = invoiceNumber("INV", "2026-03-31", 12);
    const april = invoiceNumber("INV", "2026-04-01", 1);
    expect(march).toBe("INV/25-26/0012");
    expect(april).toBe("INV/26-27/0001");
    expect(march.length).toBeLessThanOrEqual(16);
    expect(april.length).toBeLessThanOrEqual(16);
  });

  it("refuses a number that cannot fit in 16 characters", () => {
    expect(() => invoiceNumber("INV", "2026-04-01", 1_000_000)).toThrow(/16/);
  });
});

describe("Hindi words", () => {
  it("matches the call prototype", () => {
    expect(hindiNumber(59_000)).toBe("उनसठ हज़ार");
    expect(hindiRupees(59_000)).toBe("उनसठ हज़ार रुपये");
    expect(hindiNumber(1)).toBe("एक");
    expect(hindiNumber(99)).toBe("निन्यानवे");
    expect(hindiNumber(100)).toBe("एक सौ");
    expect(hindiNumber(100_000)).toBe("एक लाख");
    expect(hindiNumber(118_000)).toBe("एक लाख अठारह हज़ार");
    expect(hindiNumber(1_000_000)).toBe("दस लाख");
  });

  it("names the weekday and the date", () => {
    expect(hindiDate("2026-11-02")).toBe("सोमवार, दो नवंबर");
    expect(hindiDate("2026-11-06")).toBe("शुक्रवार, छह नवंबर");
    expect(hindiDate("2026-12-02")).toBe("बुधवार, दो दिसंबर");
    expect(hindiDate("2026-09-25")).toBe("शुक्रवार, पच्चीस सितंबर");
    expect(hindiDate("2026-02-01")).toBe("रविवार, एक फ़रवरी");
    expect(hindiDate("not-a-date")).toBe("not-a-date");
    expect(hindiDate("2026-02-31")).toBe("2026-02-31");
  });
});

describe("printed amounts", () => {
  it("parses the shapes a screenshot prints", () => {
    expect(parseAmountPaise("₹60,000.00")).toBe(6_000_000);
    expect(parseAmountPaise("60000")).toBe(6_000_000);
    expect(parseAmountPaise("Rs. 60,000/-")).toBe(6_000_000);
    expect(parseAmountPaise("₹5,619.05")).toBe(561_905);
    expect(parseAmountPaise("₹1,18,000")).toBe(11_800_000);
    expect(parseAmountPaise("₹1,18,000.50")).toBe(11_800_050);
  });

  it("rounds a third decimal place half up and rejects text that is not an amount", () => {
    expect(parseAmountPaise("₹60,000.005")).toBe(6_000_001);
    expect(parseAmountPaise("₹1.995")).toBe(200);
    expect(parseAmountPaise("₹1.994")).toBe(199);
    expect(parseAmountPaise("")).toBeNull();
    expect(parseAmountPaise("abc")).toBeNull();
    expect(parseAmountPaise("₹")).toBeNull();
  });
});

describe("format", () => {
  it("groups rupees in the Indian style and shows paise only when they exist", () => {
    expect(formatInr(11_800_000)).toBe("₹1,18,000");
    expect(formatInr(561_905)).toBe("₹5,619.05");
    expect(formatInr(-5)).toBe("−₹0.05");
    expect(formatInr(4, { signed: true })).toBe("+₹0.04");
  });
});

describe("/proof cases", () => {
  it("computes every brief case to the spec literal", () => {
    const results = runProofCases();
    expect(results.map((result) => result.actual)).toEqual([
      "CGST ₹900 + SGST ₹900 = ₹11,800",
      "IGST ₹1,800 = ₹11,800",
      "taxable ₹999, CGST ₹24.98 + SGST ₹24.98, round-off +₹0.04 = ₹1,049",
      "taxable ₹9,000, CGST ₹810 + SGST ₹810 = ₹10,620",
      "Bill of Supply, tax ₹0 = ₹10,000",
      "Tax Invoice, tax ₹0 = ₹500",
      "CGST ₹0.03 + SGST ₹0.03; IGST ₹0.05",
      "₹10.50 → ₹11 (Eleven Rupees Only); ₹10.49 → ₹10 (Ten Rupees Only)",
      "taxable ₹1,12,381 + IGST ₹5,619.05, round-off −₹0.05 = ₹1,18,000 · One Lakh Eighteen Thousand Rupees Only",
      "₹3,416.88",
      "₹10,550.34",
      "16.5% ₹1,622.50, then 17.25% ₹1,719.57 = ₹3,342.07",
      "valid, then check-digit",
      "INV/25-26/0012 → INV/26-27/0001",
      "उनसठ हज़ार · शुक्रवार, छह नवंबर",
      "₹60,000, ₹60,000, ₹60,000",
      "Tax Invoice · Bill of Supply: composition taxable person, not eligible to collect tax on supplies · Invoice",
      "no note · you'd need an IRN from the IRP for this invoice; not generated in this prototype",
    ]);
    expect(results.every((result) => result.pass && result.actual === result.expected)).toBe(true);
  });
});
