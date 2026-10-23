import type { CustomerRow, InvoiceLineRow, WorkspaceRow } from "@tagada/appwrite";
import { checkGstin, gstinCheckDigit, invoiceTotals, type GstRate, type InvoiceTotals } from "@tagada/money";

export type PreviewAs = "regular" | "composition" | "unregistered";

export type DraftLine = {
  description: string;
  hsn: string;
  quantity: number;
  ratePaise: number;
  discountPercent: number;
  gstRatePercent: GstRate;
};

export type PricedDraft = {
  /** Composition and unregistered previews are samples. They never save. */
  saves: boolean;
  /** The document shows a sample Agartala Customer, because the picked one is in another state. */
  sampleCustomer: boolean;
  workspace: WorkspaceRow;
  customer: CustomerRow;
  lines: InvoiceLineRow[];
  totals: InvoiceTotals;
};

const withCheck = (first14: string) => `${first14}${gstinCheckDigit(first14)}`;

const SAMPLE_BUYER_GSTIN = withCheck("16AADFS1020C1Z");
const COMPOSITION_GSTIN = withCheck("16AABCA2468B1Z");

function sampleCustomerRow(workspaceId: string): CustomerRow {
  return {
    $id: "sample-customer",
    workspaceId,
    name: "Sample Customer, Agartala",
    address: "Battala Market, Agartala 799001",
    gstin: SAMPLE_BUYER_GSTIN,
    stateCode: "16",
    place: "Agartala",
    phone: null,
    email: null,
    buyerType: "goods",
    creditDays: 30,
    avgDelayDays: null,
    grade: null,
    gradeReason: null,
    consentCalls: false,
    consentAt: null,
    lang: "bn",
    gender: null,
  };
}

/** The seller the document is raised in. Only "regular" is this Demo world's own business. */
function sellerFor(mode: PreviewAs, workspace: WorkspaceRow): WorkspaceRow {
  if (mode === "regular") return workspace;
  if (mode === "composition") {
    return {
      ...workspace,
      businessName: "Agartala Cane Studio",
      address: "12 Battala Road, Agartala 799001",
      gstin: COMPOSITION_GSTIN,
      stateCode: "16",
      registrationType: "composition",
      // ₹40 lakh, under Tripura's composition cap and under the e-invoicing line.
      aggregateTurnoverPaise: 400_000_000,
      upiVpa: "agartalacane@demo",
    };
  }
  return {
    ...workspace,
    businessName: "Lichubagan Bamboo Shed",
    address: "Plot 4, Lichubagan, Agartala 799006",
    gstin: null,
    stateCode: "16",
    registrationType: "unregistered",
    aggregateTurnoverPaise: 80_000_000,
    upiVpa: "lichubagan@demo",
  };
}

/**
 * Live totals for the form. A composition or unregistered preview is forced
 * inside Tripura (those sellers, in this demo, do not bill another state)
 * and `saves` is false so the form cannot post it.
 */
export function priceDraft(input: {
  mode: PreviewAs;
  workspace: WorkspaceRow;
  customer: CustomerRow | null;
  lines: readonly DraftLine[];
}): PricedDraft | null {
  if (input.lines.length === 0) return null;
  const saves = input.mode === "regular";
  if (saves && !input.customer?.stateCode) return null;
  const workspace = sellerFor(input.mode, input.workspace);
  const sampleCustomerNeeded = !saves && input.customer?.stateCode !== "16";
  const customer = saves ? input.customer : sampleCustomerNeeded ? sampleCustomerRow(input.workspace.$id) : input.customer;
  if (!customer?.stateCode || !workspace.stateCode) return null;

  const totals = invoiceTotals({
    registration: workspace.registrationType,
    supplierStateCode: workspace.stateCode,
    placeOfSupplyStateCode: customer.stateCode,
    aggregateTurnoverPaise: workspace.aggregateTurnoverPaise ?? 0,
    lines: input.lines.map((line) => ({
      quantity: line.quantity,
      ratePaise: line.ratePaise,
      discountPercent: line.discountPercent,
      gstRatePercent: line.gstRatePercent,
    })),
  });

  const lines: InvoiceLineRow[] = input.lines.map((line, n) => ({
    $id: `preview-${n}`,
    workspaceId: input.workspace.$id,
    invoiceId: "preview",
    description: line.description,
    hsn: line.hsn,
    qtyMilli: line.quantity * 1000,
    ratePaise: line.ratePaise,
    discountBp: line.discountPercent * 100,
    gstRateBp: line.gstRatePercent * 100,
  }));

  return { saves, sampleCustomer: sampleCustomerNeeded, workspace, customer, lines, totals };
}

/** Null when the field is empty or the GSTIN is valid. A wrong check digit says so. */
export function gstinMessage(value: string): string | null {
  const gstin = value.trim();
  if (!gstin) return null;
  const check = checkGstin(gstin);
  if (check.ok) return null;
  if (check.reason === "check-digit") return "The check digit does not match. Check the GSTIN.";
  return "A GSTIN is 15 letters and digits.";
}
