// Row shapes for the tables in schema.ts, as the app writes and reads them.
// JSON columns travel as strings; dates are "YYYY-MM-DD", datetimes ISO 8601.

type Row<T> = { $id: string; workspaceId: string } & T;

export type WorkspaceRow = Row<{
  ownerUserId: string;
  businessName: string;
  address: string | null;
  gstin: string | null;
  stateCode: string | null;
  registrationType: "regular" | "composition" | "unregistered";
  aggregateTurnoverPaise: number | null;
  udyamType: "micro" | "small" | "medium" | "none" | null;
  isTrader: boolean;
  upiVpa: string | null;
  ownerEmail: string | null;
  demoInboxEmail: string | null;
  today: string;
  salaryDay: string | null;
  openingCashPaise: number | null;
  /** JSON: { minFirstPct, firstWithinDays, restWithinDays } */
  planRule: string | null;
  autoSendStages: number[];
  lang: string | null;
}>;

export type CustomerRow = Row<{
  name: string;
  address: string | null;
  gstin: string | null;
  stateCode: string | null;
  place: string | null;
  phone: string | null;
  email: string | null;
  buyerType: "goods" | "large_394Q" | "services" | null;
  creditDays: number | null;
  avgDelayDays: number | null;
  grade: "A" | "B" | "C" | null;
  gradeReason: string | null;
  consentCalls: boolean;
  consentAt: string | null;
  lang: string | null;
  gender: "male" | "female" | "neutral" | null;
}>;

export type InvoiceStatus = "draft" | "sent" | "part" | "paid" | "disputed";

export type InvoiceRow = Row<{
  number: string;
  docType: "tax_invoice" | "bill_of_supply" | "invoice";
  customerId: string;
  issueDate: string;
  dueDate: string;
  agreedDueDate: string | null;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  paidPaise: number;
  status: InvoiceStatus;
  ladderStage: number;
  pausedUntil: string | null;
  pauseReason: string | null;
  payToken: string | null;
}>;

export type InvoiceLineRow = Row<{
  invoiceId: string;
  description: string;
  hsn: string | null;
  /** Quantity × 1000. */
  qtyMilli: number;
  ratePaise: number;
  /** Discount in basis points: 1000 is 10%. */
  discountBp: number;
  /** GST rate in basis points: 500 is 5%. */
  gstRateBp: number;
}>;

export type EventActor = "owner" | "ai" | "customer" | "workflow";

export type EventRow = Row<{
  invoiceId: string;
  at: string;
  type: string;
  actor: EventActor;
  summary: string;
  /** JSON object. */
  payload: string | null;
}>;

export type PromiseRow = Row<{
  invoiceId: string;
  source: "call" | "link";
  /** JSON: [{ amountPaise, date }] */
  instalments: string;
  status: "needs_owner" | "approved" | "kept" | "broken" | "declined";
  transcriptRef: string | null;
}>;

export type BankTxnRow = Row<{
  date: string;
  narration: string;
  utr: string | null;
  amountPaise: number;
  matchStatus: "unmatched" | "suggested" | "confirmed";
  matchKind: "exact" | "part" | "multi" | "overpay" | "unknown" | "tds" | null;
  /** JSON: [{ invoiceId, amountPaise }] */
  allocations: string | null;
}>;

export type CashItemRow = Row<{
  kind: "salary" | "rent" | "supplier" | "other";
  amountPaise: number;
  date: string | null;
  recurrence: string | null;
  label: string | null;
}>;

/** What `/api/demo/start` and `/api/demo/reset` answer. A fresh seed hands back what the screens load first. */
export type DemoStarted =
  | { workspaceId: string; seeded: false }
  | {
      workspaceId: string;
      seeded: true;
      world: { workspaces: WorkspaceRow[]; customers: CustomerRow[]; invoices: InvoiceRow[]; promises: PromiseRow[] };
    };
