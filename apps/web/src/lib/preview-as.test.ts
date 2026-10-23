import { describe, expect, it } from "vitest";
import type { CustomerRow, WorkspaceRow } from "@tagada/appwrite";
import { E_INVOICE_NOTE, E_INVOICE_TURNOVER_PAISE, gstinCheckDigit } from "@tagada/money";
import { gstinMessage, priceDraft } from "./preview-as.ts";

const workspace: WorkspaceRow = {
  $id: "w1",
  workspaceId: "w1",
  ownerUserId: "owner",
  businessName: "Tripura Bamboo Works",
  address: "Agartala",
  gstin: "16AAAAA0000A1Z5",
  stateCode: "16",
  registrationType: "regular",
  aggregateTurnoverPaise: 1_800_000_000,
  udyamType: "micro",
  isTrader: false,
  upiVpa: "tripurabamboo@demo",
  ownerEmail: null,
  demoInboxEmail: null,
  today: "2026-11-02",
  salaryDay: null,
  openingCashPaise: 0,
  planRule: null,
  autoSendStages: [1, 2],
  lang: "en",
};

const kolkata = {
  $id: "c1",
  workspaceId: "w1",
  name: "Gupta Traders",
  address: "Kolkata",
  gstin: "19AAAAA0000A1Z5",
  stateCode: "19",
  place: "Kolkata",
  phone: null,
  email: null,
  buyerType: "goods",
  creditDays: 30,
  avgDelayDays: null,
  grade: null,
  gradeReason: null,
  consentCalls: false,
  consentAt: null,
  lang: "hi",
  gender: null,
} satisfies CustomerRow;

const line = {
  description: "Cane lounge chair",
  hsn: "940382",
  quantity: 1,
  ratePaise: 1_000_000,
  discountPercent: 0,
  gstRatePercent: 18 as const,
};

describe("priceDraft", () => {
  it("prices a regular inter-state Invoice with IGST and allows save", () => {
    const priced = priceDraft({ mode: "regular", workspace, customer: kolkata, lines: [line] });
    // ₹10,000 at 18% across states is ₹1,800 IGST, total ₹11,800.
    expect(priced?.totals).toMatchObject({
      title: "Tax Invoice",
      docType: "tax_invoice",
      igstPaise: 180_000,
      cgstPaise: 0,
      sgstPaise: 0,
      totalPaise: 1_180_000,
      eInvoiceNote: null,
    });
    expect(priced?.saves).toBe(true);
    expect(priced?.sampleBuyer).toBe(false);
    expect(priced?.workspace.businessName).toBe("Tripura Bamboo Works");
  });

  it("shows the e-invoicing note only above ₹5 crore", () => {
    const above = priceDraft({
      mode: "regular",
      workspace: { ...workspace, aggregateTurnoverPaise: E_INVOICE_TURNOVER_PAISE + 1 },
      customer: kolkata,
      lines: [line],
    });
    expect(above?.totals.eInvoiceNote).toBe(E_INVOICE_NOTE);
    const at = priceDraft({
      mode: "regular",
      workspace: { ...workspace, aggregateTurnoverPaise: E_INVOICE_TURNOVER_PAISE },
      customer: kolkata,
      lines: [line],
    });
    expect(at?.totals.eInvoiceNote).toBeNull();
  });

  it("previews a composition Bill of Supply for a sample intra-Tripura sale and does not save", () => {
    const priced = priceDraft({ mode: "composition", workspace, customer: kolkata, lines: [line] });
    expect(priced?.saves).toBe(false);
    expect(priced?.sampleBuyer).toBe(true);
    expect(priced?.totals.title).toBe("Bill of Supply");
    expect(priced?.totals.compositionHeading).toBe(
      "composition taxable person, not eligible to collect tax on supplies",
    );
    expect(priced?.totals).toMatchObject({ taxPaise: 0, igstPaise: 0, cgstPaise: 0, sgstPaise: 0, intraState: true });
    expect(priced?.workspace).toMatchObject({ registrationType: "composition", stateCode: "16" });
    expect(priced?.customer.stateCode).toBe("16");
  });

  it("previews an unregistered Invoice with no GSTIN and no tax, and does not save", () => {
    const priced = priceDraft({ mode: "unregistered", workspace, customer: kolkata, lines: [line] });
    expect(priced?.saves).toBe(false);
    expect(priced?.totals.title).toBe("Invoice");
    expect(priced?.totals.title).not.toContain("Tax");
    expect(priced?.totals.taxPaise).toBe(0);
    expect(priced?.workspace.gstin).toBeNull();
    expect(priced?.workspace.registrationType).toBe("unregistered");
  });

  it("prices nothing until there is a line, and nothing regular until there is a Customer", () => {
    expect(priceDraft({ mode: "regular", workspace, customer: kolkata, lines: [] })).toBeNull();
    expect(priceDraft({ mode: "regular", workspace, customer: null, lines: [line] })).toBeNull();
  });
});

describe("gstinMessage", () => {
  const stem = "16AABCA1234A1Z";
  const good = `${stem}${gstinCheckDigit(stem)}`;
  const bad = `${stem}${gstinCheckDigit(stem) === "0" ? "1" : "0"}`;

  it("stays quiet until there is a value, then flags a bad check digit", () => {
    expect(gstinMessage("")).toBeNull();
    expect(gstinMessage(good)).toBeNull();
    expect(gstinMessage(bad)).toMatch(/check digit/i);
    expect(gstinMessage("16AA")).not.toMatch(/check digit/i);
  });
});
