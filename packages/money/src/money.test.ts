import { describe, expect, it } from "vitest";
import {
  E_INVOICE_NOTE,
  E_INVOICE_TURNOVER_PAISE,
  GST_RATES,
  amountInWords,
  checkGstin,
  documentFor,
  financialYear,
  formatAmountInput,
  formatInr,
  formatInrShort,
  gstinCheckDigit,
  hindiDate,
  hindiNumber,
  hindiRupees,
  invoiceNumber,
  invoiceTotals,
  lineMeasures,
  needsEInvoice,
  quantityMilli,
  type GstRate,
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
    expect(priced.intraState).toBe(false);
    expect(bill([TEN_THOUSAND]).intraState).toBe(true);
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
    const line: InvoiceLineInput = { quantity: 1, ratePaise: 100, gstRatePercent: 5 };
    const intra = bill([line]);
    const inter = bill([line], { placeOfSupplyStateCode: "19" });
    expect(intra.cgstPaise).toBe(3);
    expect(intra.sgstPaise).toBe(3);
    expect(inter.igstPaise).toBe(5);
  });

  it("rounds each line before adding, so two ₹1 lines are not one ₹2 line", () => {
    const line: InvoiceLineInput = { quantity: 1, ratePaise: 100, gstRatePercent: 5 };
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
    const unconfigured = 12 as GstRate;
    expect(() => bill([{ quantity: 1, ratePaise: 100, gstRatePercent: unconfigured }])).toThrow(/not configured/);
  });

  it("refuses a composition seller supplying to another state", () => {
    expect(() => bill([TEN_THOUSAND], { registration: "composition", placeOfSupplyStateCode: "19" })).toThrow(
      /another state/,
    );
  });

  it("totals the tax so callers never add the heads themselves", () => {
    expect(bill([TEN_THOUSAND]).taxPaise).toBe(180_000);
    expect(bill([TEN_THOUSAND], { placeOfSupplyStateCode: "19" }).taxPaise).toBe(180_000);
    expect(bill([TEN_THOUSAND], { registration: "composition" }).taxPaise).toBe(0);
  });

  it("refuses money that is not an integer number of paise", () => {
    expect(() => bill([{ quantity: 1, ratePaise: 10.5, gstRatePercent: 0 }])).toThrow(/integer/);
  });

  it("prices a part quantity: 2.5 kg at ₹333.33 is ₹833.33 taxable, rounded to the paisa", () => {
    const priced = bill([{ quantity: 2.5, ratePaise: 33_333, gstRatePercent: 5 }]);
    expect(priced.taxablePaise).toBe(83_333);
    expect(priced.cgstPaise).toBe(2_083);
    expect(priced.sgstPaise).toBe(2_083);
    expect(priced.totalPaise).toBe(87_500);
    expect(lineMeasures({ quantity: 0.75, discountPercent: 0, gstRatePercent: 5 }).qtyMilli).toBe(750);
  });

  it("refuses a quantity of 0, below 0, or with more than three decimals", () => {
    expect(() => bill([{ quantity: 0, ratePaise: 100, gstRatePercent: 0 }])).toThrow(/more than 0/);
    expect(() => bill([{ quantity: -1, ratePaise: 100, gstRatePercent: 0 }])).toThrow(/more than 0/);
    expect(() => bill([{ quantity: 1.2345, ratePaise: 100, gstRatePercent: 0 }])).toThrow(/three decimals/);
    expect(quantityMilli(0.1 + 0.2)).toBe(300n);
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
    const spanned = section16Interest({ principalPaise: 11_800_000, from: "2026-09-07", to: "2026-11-07" });
    expect(spanned.rests.map((rest) => [rest.start, rest.end, rest.rates, rest.interestPaise])).toEqual([
      ["2026-09-07", "2026-10-07", [{ annualBps: 1650, days: 30 }], 162_250],
      ["2026-10-07", "2026-11-07", [{ annualBps: 1725, days: 31 }], 171_957],
    ]);
    expect(spanned.interestPaise).toBe(334_207);
  });

  it("charges a month that ends on 7 Oct 2026 at 16.5%, the rate during it", () => {
    // The month 7 Sep–7 Oct is all before the hike. Charging it at the rest-day rate gave ₹3,342.07.
    const before = section16Interest({ principalPaise: 11_800_000, from: "2026-08-07", to: "2026-10-07" });
    expect(before.rests.map((rest) => rest.rates)).toEqual([
      [{ annualBps: 1650, days: 31 }],
      [{ annualBps: 1650, days: 30 }],
    ]);
    expect(before.interestPaise).toBe(326_731);
  });

  it("splits a month the rate changes inside by days, and pro-rates the part month", () => {
    // Gupta: due 25 Sep, interest from 26 Sep, worked out on the demo date 2 Nov.
    const gupta = section16Interest({ principalPaise: 11_800_000, from: "2026-09-26", to: "2026-11-02" });
    expect(gupta.rests.map((rest) => [rest.end, rest.rates, rest.interestPaise])).toEqual([
      [
        "2026-10-26",
        [
          { annualBps: 1650, days: 11 },
          { annualBps: 1725, days: 19 },
        ],
        166_921,
      ],
      ["2026-11-02", [{ annualBps: 1725, days: 7 }], 38_844],
    ]);
    expect(gupta.interestPaise).toBe(205_765);
  });

  it("dates a rest on the real month end when the start day does not exist", () => {
    const result = section16Interest({ principalPaise: 11_800_000, from: "2026-08-31", to: "2026-10-31" });
    expect(result.rests.map((rest) => [rest.end, rest.rates])).toEqual([
      ["2026-09-30", [{ annualBps: 1650, days: 30 }]],
      [
        "2026-10-31",
        [
          { annualBps: 1650, days: 7 },
          { annualBps: 1725, days: 24 },
        ],
      ],
    ]);
    expect(result.interestPaise).toBe(332_519);
  });

  it("matches the flat 17.25% figure when every day falls after the rate change", () => {
    const dated = section16Interest({ principalPaise: 11_800_000, from: "2026-10-07", to: "2026-12-07" });
    expect(dated.interestPaise).toBe(341_688);
  });

  it("charges nothing for no days and refuses a range that runs backwards", () => {
    expect(section16Interest({ principalPaise: 11_800_000, from: "2026-11-02", to: "2026-11-02" })).toEqual({
      interestPaise: 0,
      rests: [],
    });
    expect(() => section16Interest({ principalPaise: 100, from: "2026-11-02", to: "2026-11-01" })).toThrow(/before/);
  });
});

describe("GSTIN", () => {
  it("accepts a check digit and rejects the same number with one character changed", () => {
    expect(checkGstin("27AAPFU0939F1ZV")).toEqual({ ok: true });
    expect(gstinCheckDigit("27AAPFU0939F1Z")).toBe("V");
    expect(checkGstin("27AAPFU0939F1ZX")).toEqual({ ok: false, reason: "check-digit" });
  });

  it("agrees with the check digit of real-format GSTINs from several states", () => {
    for (const gstin of ["29AAGCB7383J1Z4", "27AAACR5055K1Z7", "24AAACC1206D1ZM"]) {
      expect(checkGstin(gstin)).toEqual({ ok: true });
    }
    // The call prototype's sample is not a valid GSTIN: its check character should be S.
    expect(gstinCheckDigit("16AAKFT4821M1Z")).toBe("S");
    expect(checkGstin("16AAKFT4821M1Z5")).toEqual({ ok: false, reason: "check-digit" });
    expect(checkGstin(" 27aapfu0939f1zv ")).toEqual({ ok: true });
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
    expect(hindiRupees(5_900_000)).toBe("उनसठ हज़ार रुपये");
    expect(hindiNumber(1)).toBe("एक");
    expect(hindiNumber(99)).toBe("निन्यानवे");
    expect(hindiNumber(100)).toBe("एक सौ");
    expect(hindiNumber(100_000)).toBe("एक लाख");
    expect(hindiNumber(118_000)).toBe("एक लाख अठारह हज़ार");
    expect(hindiNumber(1_000_000)).toBe("दस लाख");
    expect(hindiNumber(101)).toBe("एक सौ एक");
    expect(hindiNumber(1_050)).toBe("एक हज़ार पचास");
    expect(hindiNumber(20_000_000)).toBe("दो करोड़");
    expect(hindiNumber(0)).toBe("शून्य");
  });

  it("says an amount in paise as whole rupees, half up like the prototype", () => {
    expect(hindiRupees(11_800_000)).toBe("एक लाख अठारह हज़ार रुपये");
    expect(hindiRupees(5_899_950)).toBe("उनसठ हज़ार रुपये");
    expect(hindiRupees(5_899_949)).toBe("अट्ठावन हज़ार नौ सौ निन्यानवे रुपये");
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
  it("writes a stored rate back into the form so it reads the same", () => {
    expect(formatAmountInput(18_000)).toBe("180");
    expect(formatAmountInput(18_050)).toBe("180.50");
    expect(formatAmountInput(5)).toBe("0.05");
    for (const paise of [0, 5, 18_050, 11_800_000]) expect(parseAmountPaise(formatAmountInput(paise))).toBe(paise);
  });

  it("parses the shapes a screenshot prints", () => {
    expect(parseAmountPaise("₹60,000.00")).toBe(6_000_000);
    expect(parseAmountPaise("60000")).toBe(6_000_000);
    expect(parseAmountPaise("Rs. 60,000/-")).toBe(6_000_000);
    expect(parseAmountPaise("₹5,619.05")).toBe(561_905);
    expect(parseAmountPaise("₹1,18,000")).toBe(11_800_000);
    expect(parseAmountPaise("₹1,18,000.50")).toBe(11_800_050);
    expect(parseAmountPaise("INR 60,000")).toBe(6_000_000);
    expect(parseAmountPaise("₹ 60,000.00")).toBe(6_000_000);
    expect(parseAmountPaise("Rs.60000")).toBe(6_000_000);
    expect(parseAmountPaise("60,000.00 INR")).toBe(6_000_000);
    expect(parseAmountPaise("₹60,000 only")).toBe(6_000_000);
    expect(parseAmountPaise("₹60,000.5")).toBe(6_000_050);
    expect(parseAmountPaise("1,000,000")).toBe(100_000_000);
  });

  it("refuses commas out of place rather than guess", () => {
    expect(parseAmountPaise("60.000,00")).toBeNull();
    expect(parseAmountPaise("₹6,0,000")).toBeNull();
    expect(parseAmountPaise("60,00")).toBeNull();
    expect(parseAmountPaise("-500")).toBeNull();
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

  it("shortens to thousands or lakhs for a chart label", () => {
    expect(formatInrShort(-4_800_000)).toBe("−₹48k");
    expect(formatInrShort(1_200_000)).toBe("₹12k");
    expect(formatInrShort(8_984_000)).toBe("₹90k");
    expect(formatInrShort(39_060_000)).toBe("₹3.9L");
    expect(formatInrShort(-21_000_000)).toBe("−₹2.1L");
    expect(formatInrShort(30_000)).toBe("₹300");
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
      "16.5% for 30 days ₹1,622.50, then 17.25% for 31 days ₹1,719.57 = ₹3,342.07",
      "16.5% for 11 days + 17.25% for 19 days ₹1,669.21, then 17.25% for 7 days ₹388.44 = ₹2,057.65",
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
