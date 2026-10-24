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
  /** "HH:MM" IST on the Demo date; null reads as 11:20. */
  clock?: string | null;
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
  /** JSON: BankAllocation[] */
  allocations: string | null;
  /** Set when the Owner assigns an unknown deposit to a Customer. */
  assignedCustomerId?: string | null;
}>;

/** One Invoice's share of a Bank credit. `tdsPaise` is what the Customer kept back as TDS. */
export type BankAllocation = { invoiceId: string; amountPaise: number; tdsPaise?: number };

export type CallRow = Row<{
  invoiceId: string;
  conversationId: string | null;
  startedAt: string | null;
  durationS: number | null;
  outcome: string | null;
  /** JSON transcript. */
  transcript: string | null;
  consentShown: boolean;
}>;

export type ReminderRow = Row<{
  invoiceId: string;
  customerId: string;
  sentDate: string | null;
  stage: number;
  channel: "email" | "whatsapp_link" | "call";
  status: "queued" | "sent" | "failed" | "retried" | "skipped_cap" | "skipped_stage_off";
  attempts: number | null;
  providerMessageId: string | null;
  error: string | null;
  runId: string | null;
}>;

/** One daily Ladder run for one workspace and Demo date. */
export type WorkflowRunRow = Row<{
  runId: string;
  startedAt: string;
  demoDate: string;
  invoicesScanned: number;
  sent: number;
  skippedDuplicate: number;
  /** Invoices not chased because their money is in the bank, waiting for the Owner. Unset on runs before it was counted. */
  skippedInBank?: number | null;
  retried: number;
  failed: number;
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

export type InboxKind = "paid_claim" | "dispute" | "plan_accepted" | "needs_decision" | "proof_uploaded";

export type InboxRow = Row<{
  kind: InboxKind;
  /** The event row that says what happened. */
  refId: string;
  read: boolean;
}>;

export type PayInstalment = { amountPaise: number; date: string };

/** What `GET /api/call/signed-url` answers: a private session for one call about one Invoice. */
export type CallSession = {
  conversationToken: string;
  callId: string;
  /** Every fact the agent is told, as strings, from the database. */
  dynamicVariables: Record<string, string>;
  context: {
    owedPaise: number;
    today: string;
    rule: { minFirstPct: number; firstWithinDays: number; restWithinDays: number };
  };
};

/**
 * What `GET /api/pay/:token` answers: one Invoice as its Customer sees it,
 * and nothing else of the Owner's books.
 */
export type PaySlip = {
  today: string;
  from: { businessName: string; gstin: string | null; upiVpa: string | null };
  customer: { name: string; lang: string | null };
  invoice: {
    number: string;
    issueDate: string;
    dueDate: string;
    totalPaise: number;
    balancePaise: number;
    daysLate: number;
  };
  /**
   * What the Customer has already done here: `asked` is a Plan or a talk
   * waiting on the Owner; `paid_claim` is "already paid".
   */
  state: "owing" | "plan" | "asked" | "paid_claim" | "disputed" | "paid";
  /** The agreed (or asked-for) instalments, with what is still to come. */
  plan: PayInstalment[] | null;
  screenshotSent: boolean;
  /** `paid_claim` because the money is already in the bank, not because the Customer said so: nothing to thank or upload. */
  inBank: boolean;
  /** Plans inside the Owner's rule the Customer can pick. */
  choices: PayInstalment[][];
  rule: { minFirstPct: number; firstWithinDays: number; restWithinDays: number };
};
