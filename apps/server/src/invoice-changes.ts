// The Owner's changes to a saved Invoice: record a payment received by hand,
// cancel it, or correct an unpaid one. Each checks the Invoice is in the
// visitor's own world, works out every figure here, and writes an event.
import { addDays, formatDate, formatInr, isCivilDate, sumPaise } from "@tagada/money";
import { invoiceStanding, type InvoiceFacts, type PromiseFacts } from "@tagada/domain";
import type { WorldStore } from "./demo.ts";
import { lineRows, parseLines, totalsFor } from "./invoices.ts";
import { newId, open, owner, record, type Book } from "./pay.ts";

export const PAYMENT_MODES = ["cash", "cheque", "upi", "bank_transfer"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

const MODE_WORDS: Record<PaymentMode, string> = {
  cash: "in cash",
  cheque: "by cheque",
  upi: "by UPI",
  bank_transfer: "by bank transfer",
};

export type ChangeFailure = { ok: false; status: 400 | 404 | 409; error: string };
export type ChangeResult = { ok: true; status: string; paidPaise: number; totalPaise: number } | ChangeFailure;

const fail = (status: ChangeFailure["status"], error: string): ChangeFailure => ({ ok: false, status, error });
const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const whole = (value: unknown): number => (typeof value === "number" && Number.isInteger(value) ? value : 0);

function input(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

function facts(invoice: Book["invoice"]): InvoiceFacts {
  return {
    totalPaise: whole(invoice.totalPaise),
    paidPaise: whole(invoice.paidPaise),
    status: (text(invoice.status) ?? "sent") as InvoiceFacts["status"],
    dueDate: text(invoice.dueDate) ?? "",
    ladderStage: whole(invoice.ladderStage),
    pausedUntil: text(invoice.pausedUntil),
    pauseReason: text(invoice.pauseReason),
  };
}

function promiseFacts(row: Book["promises"][number]): PromiseFacts {
  try {
    return { status: (text(row.status) ?? "declined") as PromiseFacts["status"], instalments: JSON.parse(text(row.instalments) ?? "[]") };
  } catch {
    return { status: "declined", instalments: [] };
  }
}

/** The Invoice, only when it is in this workspace. The Owner's requests carry no pay token. */
async function bookOf(worlds: WorldStore, workspaceId: string, invoiceId: string): Promise<Book | null> {
  if (!invoiceId) return null;
  const book = await open(worlds, { workspaceId, invoiceId });
  return book && book.invoice.workspaceId === workspaceId ? book : null;
}

const done = (status: string, paidPaise: number, totalPaise: number): ChangeResult => ({ ok: true, status, paidPaise, totalPaise });

/**
 * A payment received by hand: cash, a cheque, UPI or a bank transfer. It can
 * be dated back to the issue date, not after the Demo date, and is never more
 * than is still owed. Covering the balance marks the Invoice paid, which stops
 * the Ladder, as a confirmed Bank match does.
 */
export async function recordPayment(worlds: WorldStore, workspaceId: string, invoiceId: string, body: unknown): Promise<ChangeResult> {
  const b = input(body);
  const book = await bookOf(worlds, workspaceId, invoiceId);
  if (!book) return fail(404, "not_found");
  const { invoice, workspace } = book;
  const today = text(workspace.today) ?? "";
  const standing = invoiceStanding(facts(invoice), book.promises.map(promiseFacts), today);
  if (standing.state === "paid" || standing.state === "cancelled" || standing.balancePaise <= 0) return fail(409, "not_open");

  const amount = b.amountPaise;
  const date = b.date;
  const mode = b.mode;
  const reference = b.reference === undefined || b.reference === null ? null : text(b.reference)?.trim();
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 1) return fail(400, "invalid_amount");
  if (amount > standing.balancePaise) return fail(400, "more_than_owed");
  if (typeof date !== "string" || !isCivilDate(date) || date > today || date < (text(invoice.issueDate) ?? "")) {
    return fail(400, "invalid_date");
  }
  if (typeof mode !== "string" || !(PAYMENT_MODES as readonly string[]).includes(mode)) return fail(400, "invalid_mode");
  if (reference === undefined || (reference !== null && reference.length > 64)) return fail(400, "invalid_reference");

  const total = whole(invoice.totalPaise);
  const applied = sumPaise([whole(invoice.paidPaise), amount]);
  const covered = applied >= total;
  const status = covered ? "paid" : invoice.status === "disputed" ? "disputed" : "part";
  const paidPaise = covered ? total : applied;
  await worlds.update("invoices", invoice.$id, { paidPaise, status });
  const how = MODE_WORDS[mode as PaymentMode];
  // Dated the day the money came, so Today counts it from then.
  await record(worlds, { ...book, workspace: { ...workspace, today: date } }, {
    type: "payment",
    actor: "owner",
    summary: `Recorded ${formatInr(amount)} received ${how} on ${formatDate(date, { weekday: false })}${reference ? ` (${reference})` : ""}.${covered ? " This Invoice is paid in full." : ""}`,
    payload: { amountPaise: amount, mode, date, reference },
  }, null);
  return done(status, paidPaise, total);
}

/**
 * Under GST a saved Tax Invoice is not deleted: it is cancelled, and its number
 * stays used. Only one with nothing paid against it; money already received
 * needs a credit note. The Ladder stops, and it drops out of what is owed.
 */
export async function cancelInvoice(worlds: WorldStore, workspaceId: string, invoiceId: string, body: unknown): Promise<ChangeResult> {
  const book = await bookOf(worlds, workspaceId, invoiceId);
  if (!book) return fail(404, "not_found");
  const { invoice } = book;
  if (invoice.status === "cancelled") return fail(409, "already_cancelled");
  if (invoice.status === "paid" || whole(invoice.paidPaise) > 0) return fail(409, "has_payments");
  const raw = input(body).reason;
  const reason = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!reason || reason.length > 500) return fail(400, "invalid_reason");
  await worlds.update("invoices", invoice.$id, { status: "cancelled", pauseReason: "cancelled", pausedUntil: null });
  await record(worlds, book, {
    type: "cancelled",
    actor: "owner",
    summary: `Invoice cancelled: "${reason}". Its number ${text(invoice.number) ?? ""} stays used, and nothing more is sent.`,
    payload: { reason, totalPaise: whole(invoice.totalPaise) },
  }, null);
  return done("cancelled", 0, whole(invoice.totalPaise));
}

/**
 * Corrects an unpaid Invoice with nothing paid against it: its lines and its
 * due date. The number, the Customer and the issue date stay; the totals are
 * worked out again here, as on create.
 */
export async function editInvoice(worlds: WorldStore, workspaceId: string, invoiceId: string, body: unknown): Promise<ChangeResult> {
  const b = input(body);
  const book = await bookOf(worlds, workspaceId, invoiceId);
  if (!book) return fail(404, "not_found");
  const { invoice, workspace, customer } = book;
  const status = text(invoice.status);
  if ((status !== "sent" && status !== "disputed") || whole(invoice.paidPaise) > 0) return fail(409, "not_editable");
  const lines = parseLines(b.lines);
  if (!lines) return fail(400, "invalid_line");
  const issueDate = text(invoice.issueDate) ?? "";
  const dueDate = b.dueDate;
  if (typeof dueDate !== "string" || !isCivilDate(dueDate) || dueDate < issueDate || dueDate > addDays(issueDate, 365)) {
    return fail(400, "invalid_due_date");
  }
  const customerState = text(customer?.stateCode);
  if (!customerState) return fail(409, "unknown_customer");
  const totals = totalsFor(workspace, customerState, lines);
  if ("ok" in totals) return totals;

  const old = await worlds.list("invoice_lines", workspaceId, { invoiceId: invoice.$id });
  const { permissions } = owner(book);
  const fresh = lineRows(workspaceId, invoice.$id, lines, () => newId("n")).map((row) => ({ ...row, $permissions: permissions }));
  const fromTotal = whole(invoice.totalPaise);
  await worlds.update("invoices", invoice.$id, {
    docType: totals.docType,
    dueDate,
    taxablePaise: totals.taxablePaise,
    cgstPaise: totals.cgstPaise,
    sgstPaise: totals.sgstPaise,
    igstPaise: totals.igstPaise,
    roundOffPaise: totals.roundOffPaise,
    totalPaise: totals.totalPaise,
  });
  const changed = fromTotal === totals.totalPaise ? `total ${formatInr(fromTotal)}` : `total ${formatInr(fromTotal)} → ${formatInr(totals.totalPaise)}`;
  await record(worlds, book, {
    type: "edited",
    actor: "owner",
    summary: `Invoice corrected: ${changed}; due ${formatDate(dueDate, { weekday: false })}.`,
    payload: { fromTotalPaise: fromTotal, totalPaise: totals.totalPaise, dueDate },
  }, null, { invoice_lines: fresh });
  // The new lines are written first, so the Invoice is never without any.
  await Promise.all(old.map((row) => worlds.delete("invoice_lines", row.$id)));
  return done(status, 0, totals.totalPaise);
}
