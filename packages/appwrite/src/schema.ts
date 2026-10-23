// The Appwrite data model (build plan §2.3), declared once and shared by the
// setup script, the server and the workflows. Money columns are integer paise.

export const DATABASE_ID = "main";

export type ColumnSpec =
  | { key: string; type: "varchar"; size: number; required: boolean; array?: boolean }
  | { key: string; type: "text" | "longtext"; required: boolean }
  | { key: string; type: "integer"; required: boolean; min?: number; max?: number; array?: boolean }
  | { key: string; type: "boolean"; required: boolean; default?: boolean }
  | { key: string; type: "datetime"; required: boolean }
  | { key: string; type: "enum"; elements: readonly string[]; required: boolean };

export type IndexSpec = { key: string; type: "key" | "unique"; columns: string[] };

export type TableSpec = {
  id: string;
  name: string;
  /** Table-level grants. Empty: only the server's API key creates rows. */
  permissions: string[];
  rowSecurity: true;
  columns: ColumnSpec[];
  indexes: IndexSpec[];
};

export type BucketSpec = {
  id: string;
  name: string;
  maximumFileSize: number;
  allowedFileExtensions: string[];
  encryption: boolean;
  antivirus: boolean;
};

export type Schema = { databaseId: string; tables: TableSpec[]; buckets: BucketSpec[] };

const ID_LENGTH = 36; // Appwrite row IDs are at most 36 chars
const id = (key: string, required = true): ColumnSpec => ({ key, type: "varchar", size: ID_LENGTH, required });
const str = (key: string, size: number, required = false): ColumnSpec => ({ key, type: "varchar", size, required });
const text = (key: string, required = false): ColumnSpec => ({ key, type: "text", required });
const json = (key: string, required = false): ColumnSpec => ({ key, type: "longtext", required });
const paise = (key: string, required = false): ColumnSpec => ({ key, type: "integer", required });
const int = (key: string, required = false): ColumnSpec => ({ key, type: "integer", required });
const bool = (key: string, dflt = false): ColumnSpec => ({ key, type: "boolean", required: false, default: dflt });
const date = (key: string, required = false): ColumnSpec => ({ key, type: "datetime", required });
const oneOf = (key: string, elements: readonly string[], required = true): ColumnSpec => ({
  key,
  type: "enum",
  elements,
  required,
});
const key = (k: string, ...columns: string[]): IndexSpec => ({ key: k, type: "key", columns });

function table(tableId: string, columns: ColumnSpec[], indexes: IndexSpec[] = []): TableSpec {
  return {
    id: tableId,
    name: tableId,
    permissions: [],
    rowSecurity: true,
    columns: [id("workspaceId"), ...columns],
    indexes: [key("workspaceId", "workspaceId"), ...indexes],
  };
}

// Calendar dates (demo date, due dates) are stored as "YYYY-MM-DD" strings, not
// datetimes, so no timezone can shift an IST day.
const day = (k: string, required = false) => str(k, 10, required);

export const tables = {
  workspaces: table("workspaces", [
    id("ownerUserId"),
    str("businessName", 128, true),
    str("address", 256),
    str("gstin", 15),
    str("stateCode", 2),
    oneOf("registrationType", ["regular", "composition", "unregistered"]),
    paise("aggregateTurnoverPaise"),
    oneOf("udyamType", ["micro", "small", "medium", "none"], false),
    bool("isTrader"),
    str("upiVpa", 64),
    str("ownerEmail", 254),
    str("demoInboxEmail", 254),
    day("today", true),
    day("salaryDay"),
    paise("openingCashPaise"),
    json("planRule"),
    { key: "autoSendStages", type: "integer", required: false, min: 1, max: 6, array: true },
    str("lang", 8),
  ], [key("ownerUserId", "ownerUserId")]),

  customers: table("customers", [
    str("name", 128, true),
    str("address", 256),
    str("gstin", 15),
    str("stateCode", 2),
    str("place", 64),
    str("phone", 20),
    str("email", 254),
    oneOf("buyerType", ["goods", "large_394Q", "services"], false),
    int("creditDays"),
    int("avgDelayDays"),
    oneOf("grade", ["A", "B", "C"], false),
    text("gradeReason"),
    bool("consentCalls"),
    date("consentAt"),
    str("lang", 8),
    oneOf("gender", ["male", "female", "neutral"], false),
  ]),

  invoices: table("invoices", [
    str("number", 16, true),
    oneOf("docType", ["tax_invoice", "bill_of_supply", "invoice"]),
    id("customerId"),
    day("issueDate", true),
    day("dueDate", true),
    day("agreedDueDate"),
    paise("taxablePaise", true),
    paise("cgstPaise"),
    paise("sgstPaise"),
    paise("igstPaise"),
    paise("roundOffPaise"),
    paise("totalPaise", true),
    paise("paidPaise"),
    oneOf("status", ["draft", "sent", "part", "paid", "disputed"]),
    { key: "ladderStage", type: "integer", required: false, min: 0, max: 6 },
    day("pausedUntil"),
    str("pauseReason", 32),
    str("payToken", 255),
  ], [
    key("workspaceId_status", "workspaceId", "status"),
    key("customerId", "customerId"),
    { key: "payToken_unique", type: "unique", columns: ["payToken"] },
  ]),

  invoice_lines: table("invoice_lines", [
    id("invoiceId"),
    str("description", 256, true),
    str("hsn", 8),
    int("qtyMilli", true),
    paise("ratePaise", true),
    int("discountBp"),
    int("gstRateBp", true),
  ], [key("invoiceId", "invoiceId")]),

  events: table("events", [
    id("invoiceId"),
    date("at", true),
    str("type", 32, true),
    oneOf("actor", ["owner", "ai", "customer", "workflow"]),
    text("summary"),
    json("payload"),
  ], [key("invoiceId_at", "invoiceId", "at")]),

  promises: table("promises", [
    id("invoiceId"),
    oneOf("source", ["call", "link"]),
    json("instalments", true),
    oneOf("status", ["needs_owner", "approved", "kept", "broken", "declined"]),
    str("transcriptRef", 64),
  ], [key("invoiceId", "invoiceId")]),

  calls: table("calls", [
    id("invoiceId"),
    str("conversationId", 64),
    date("startedAt"),
    int("durationS"),
    str("outcome", 32),
    json("transcript"),
    bool("consentShown"),
  ], [key("invoiceId", "invoiceId"), { key: "conversationId_unique", type: "unique", columns: ["conversationId"] }]),

  bank_txns: table("bank_txns", [
    day("date", true),
    text("narration"),
    str("utr", 32),
    paise("amountPaise", true),
    oneOf("matchStatus", ["unmatched", "suggested", "confirmed"]),
    oneOf("matchKind", ["exact", "part", "multi", "overpay", "unknown", "tds"], false),
    json("allocations"),
  ], [key("workspaceId_matchStatus", "workspaceId", "matchStatus"), key("utr", "utr")]),

  proof_checks: table("proof_checks", [
    id("invoiceId"),
    str("fileId", ID_LENGTH),
    json("extracted"),
    oneOf("result", ["found", "not_found_yet", "amount_mismatch"], false),
    date("checkedAt"),
  ], [key("invoiceId", "invoiceId")]),

  reminders: table("reminders", [
    id("invoiceId"),
    id("customerId"),
    day("sentDate"),
    { key: "stage", type: "integer", required: true, min: 1, max: 6 },
    oneOf("channel", ["email", "whatsapp_link", "call"]),
    oneOf("status", ["queued", "sent", "failed", "retried", "skipped_cap", "skipped_stage_off"]),
    int("attempts"),
    str("providerMessageId", 128),
    text("error"),
    str("runId", 64),
  ], [key("customerId_sentDate", "customerId", "sentDate")]),

  workflow_runs: table("workflow_runs", [
    str("runId", 64, true),
    date("startedAt", true),
    day("demoDate", true),
    int("invoicesScanned"),
    int("sent"),
    int("skippedDuplicate"),
    int("retried"),
    int("failed"),
  ]),

  inbox: table("inbox", [
    oneOf("kind", ["paid_claim", "dispute", "plan_accepted", "needs_decision", "proof_uploaded"]),
    str("refId", ID_LENGTH, true),
    bool("read"),
  ], [key("workspaceId_read", "workspaceId", "read")]),

  cash_items: table("cash_items", [
    oneOf("kind", ["salary", "rent", "supplier", "other"]),
    paise("amountPaise", true),
    day("date"),
    str("recurrence", 32),
    str("label", 128),
  ]),
} satisfies Record<string, TableSpec>;

export type TableId = keyof typeof tables;

export const schema: Schema = {
  databaseId: DATABASE_ID,
  tables: Object.values(tables),
  buckets: [
    {
      id: "screenshots",
      name: "UPI screenshots",
      maximumFileSize: 5 * 1024 * 1024,
      allowedFileExtensions: ["jpg", "jpeg", "png", "webp"],
      encryption: true,
      antivirus: true,
    },
    {
      id: "audio",
      name: "Pay link read-aloud clips",
      maximumFileSize: 2 * 1024 * 1024,
      allowedFileExtensions: ["mp3"],
      encryption: false,
      antivirus: false,
    },
    {
      id: "documents",
      name: "Generated documents",
      maximumFileSize: 10 * 1024 * 1024,
      allowedFileExtensions: ["pdf"],
      encryption: true,
      antivirus: true,
    },
  ],
};
