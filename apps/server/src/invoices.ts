// POST /api/invoices. The browser may send totals; they are ignored. The
// figures, the document type and the FY number all come from here.
import { createHash } from "node:crypto";
import { Permission, Role } from "node-appwrite";
import type { CustomerRow, EventRow, InvoiceLineRow, InvoiceRow } from "@tagada/appwrite";
import {
  addDays,
  financialYear,
  formatDate,
  invoiceNumber,
  invoiceTotals,
  isGstRate,
  isLineUnit,
  lineMeasures,
  quantityMilli,
  type GstRate,
  type Registration,
} from "@tagada/money";
import { newCustomerRow, parseCustomer } from "./customers.ts";
import { workspaceIdFor, type OwnedRow, type StoredRow, type WorldRows, type WorldStore } from "./demo.ts";

const PREFIX = "TBW";

export type IssuedInvoice = {
  invoice: Pick<
    InvoiceRow,
    | "$id"
    | "number"
    | "docType"
    | "customerId"
    | "issueDate"
    | "dueDate"
    | "taxablePaise"
    | "cgstPaise"
    | "sgstPaise"
    | "igstPaise"
    | "roundOffPaise"
    | "totalPaise"
    | "paidPaise"
    | "status"
    | "payToken"
  >;
  customer: Pick<CustomerRow, "$id" | "name" | "gstin" | "stateCode" | "creditDays" | "lang">;
};

export type IssueFailure = { ok: false; status: 400 | 409; error: string };
export type IssueSuccess = { ok: true } & IssuedInvoice;

export type LineInput = {
  description: string;
  hsn: string;
  quantity: number;
  ratePaise: number;
  discountPercent: number;
  gstRatePercent: GstRate;
  /** Null for "nos", the default. */
  unit: string | null;
};

const fail = (status: 400 | 409, error: string): IssueFailure => ({ ok: false, status, error });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function wholeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

/** A quantity of at most three decimals (2.5 kg), above 0 and up to a million. */
function quantityOf(value: unknown): number | null {
  if (typeof value !== "number") return null;
  let milli: bigint;
  try {
    milli = quantityMilli(value);
  } catch {
    return null;
  }
  return milli >= 1n && milli <= 1_000_000_000n ? value : null;
}

/** The next `TBW/26-27/0032` in this financial year. Numbers from other years do not count. */
export function nextInvoiceNumber(existing: readonly string[], isoDate: string): string {
  const stem = `${PREFIX}/${financialYear(isoDate)}/`;
  let max = 0;
  for (const number of existing) {
    if (!number.startsWith(stem)) continue;
    const serial = Number(number.slice(stem.length));
    if (Number.isInteger(serial) && serial > max) max = serial;
  }
  return invoiceNumber(PREFIX, isoDate, max + 1);
}

/** One row ID per number in a workspace, so the same number cannot be saved twice. */
function invoiceRowId(workspaceId: string, number: string): string {
  return `n${createHash("sha256").update(`${workspaceId}|${number}`).digest("hex").slice(0, 24)}`;
}

function parseLine(value: unknown): LineInput | null {
  if (!isRecord(value)) return null;
  const description = text(value.description)?.trim() ?? "";
  const hsn = text(value.hsn)?.trim() ?? "";
  const quantity = quantityOf(value.quantity);
  const ratePaise = wholeNumber(value.ratePaise);
  const discountPercent = value.discountPercent === undefined ? 0 : wholeNumber(value.discountPercent);
  const gstRatePercent = wholeNumber(value.gstRatePercent);
  if (!description || description.length > 256) return null;
  if (!/^\d{4,8}$/.test(hsn)) return null;
  if (quantity === null) return null;
  if (ratePaise === null || ratePaise < 0) return null;
  if (discountPercent === null || discountPercent < 0 || discountPercent > 100) return null;
  if (gstRatePercent === null || !isGstRate(gstRatePercent)) return null;
  const unit = value.unit === undefined || value.unit === null ? "nos" : value.unit;
  if (!isLineUnit(unit)) return null;
  return { description, hsn, quantity, ratePaise, discountPercent, gstRatePercent, unit: unit === "nos" ? null : unit };
}

export function parseLines(value: unknown): LineInput[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 30) return null;
  const lines: LineInput[] = [];
  for (const item of value) {
    const line = parseLine(item);
    if (!line) return null;
    lines.push(line);
  }
  return lines;
}

function registrationOf(value: unknown): Registration | null {
  return value === "regular" || value === "composition" || value === "unregistered" ? value : null;
}

/**
 * The totals for these lines on this workspace's registration, billed to a
 * Customer in `customerState`. The same working on create and on edit.
 */
export function totalsFor(workspace: StoredRow, customerState: string, lines: readonly LineInput[]) {
  const registration = registrationOf(workspace.registrationType);
  const supplierState = text(workspace.stateCode);
  if (!registration || !supplierState) return fail(409, "world_not_ready");
  try {
    return invoiceTotals({
      registration,
      supplierStateCode: supplierState,
      placeOfSupplyStateCode: customerState,
      aggregateTurnoverPaise: wholeNumber(workspace.aggregateTurnoverPaise) ?? 0,
      lines: lines.map((line) => ({
        quantity: line.quantity,
        ratePaise: line.ratePaise,
        discountPercent: line.discountPercent,
        gstRatePercent: line.gstRatePercent,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message.includes("another state")) return fail(400, "composition_interstate");
    return fail(400, "invalid_line");
  }
}

/** One Invoice's line rows. */
export function lineRows(workspaceId: string, invoiceId: string, lines: readonly LineInput[], newId: () => string): InvoiceLineRow[] {
  return lines.map((line) => ({
    $id: newId(),
    workspaceId,
    invoiceId,
    description: line.description,
    hsn: line.hsn,
    ratePaise: line.ratePaise,
    ...lineMeasures(line),
    // Written only when it is not "nos", so saves work before the column is added.
    ...(line.unit ? { unit: line.unit } : {}),
  }));
}

/**
 * Saves one Invoice for this visitor. Totals are recomputed; a `totalPaise`
 * on the body is never read. A new Customer is written only after the GSTIN
 * check digit passes.
 */
export async function issueInvoice(
  worlds: WorldStore,
  userId: string,
  body: unknown,
  ids: { row: () => string; payToken: (invoiceId: string) => string },
): Promise<IssueSuccess | IssueFailure> {
  if (!isRecord(body)) return fail(400, "invalid_body");
  const hasId = body.customerId !== undefined;
  const hasNew = body.customer !== undefined;
  if (hasId === hasNew) return fail(400, "invalid_body");
  const lines = parseLines(body.lines);
  if (!lines) return fail(400, "invalid_line");

  const workspaceId = workspaceIdFor(userId);
  const [workspace] = await worlds.list("workspaces", workspaceId);
  if (!workspace) return fail(409, "world_not_ready");
  const today = text(workspace.today);
  if (!registrationOf(workspace.registrationType) || !text(workspace.stateCode) || !today) return fail(409, "world_not_ready");

  const permissions = [Permission.read(Role.user(userId)), Permission.update(Role.user(userId))];
  const owned = (row: { $id: string }): OwnedRow => ({
    ...(row as unknown as Record<string, unknown>),
    $id: row.$id,
    workspaceId,
    $permissions: permissions,
  });

  let customerId: string;
  let customerState: string;
  let creditDays: number;
  let customerOut: IssuedInvoice["customer"];
  let created: OwnedRow | null = null;

  if (hasNew) {
    const parsed = parseCustomer(body.customer);
    if ("ok" in parsed) return fail(400, parsed.error);
    customerId = ids.row();
    customerState = parsed.stateCode;
    creditDays = parsed.creditDays;
    created = newCustomerRow(workspaceId, userId, customerId, parsed, today);
    customerOut = {
      $id: customerId,
      name: parsed.name,
      gstin: parsed.gstin,
      stateCode: parsed.stateCode,
      creditDays,
      lang: parsed.lang,
    };
  } else {
    if (typeof body.customerId !== "string") return fail(400, "invalid_body");
    const found = (await worlds.list("customers", workspaceId)).find((row) => row.$id === body.customerId);
    if (!found) return fail(400, "unknown_customer");
    const stateCode = text(found.stateCode);
    const name = text(found.name);
    if (!stateCode || !name) return fail(400, "unknown_customer");
    customerId = found.$id;
    customerState = stateCode;
    creditDays = wholeNumber(found.creditDays) ?? 30;
    customerOut = {
      $id: found.$id,
      name,
      gstin: text(found.gstin),
      stateCode,
      creditDays,
      lang: text(found.lang),
    };
  }

  const totals = totalsFor(workspace, customerState, lines);
  if ("ok" in totals) return totals;

  const taken = (await worlds.list("invoices", workspaceId)).flatMap((row) => {
    const number = text(row.number);
    return number ? [number] : [];
  });
  const dueDate = addDays(today, creditDays);
  if (created) await worlds.write({ customers: [created] });

  // Two quick saves can read the same last number. The row ID comes from the
  // number, so the store refuses the second row and that save takes the next one.
  let invoice: InvoiceRow | null = null;
  for (let attempt = 0; attempt < 5 && !invoice; attempt++) {
    const number = nextInvoiceNumber(taken, today);
    const rowId = invoiceRowId(workspaceId, number);
    const row: InvoiceRow = {
      $id: rowId,
      workspaceId,
      number,
      docType: totals.docType,
      customerId,
      issueDate: today,
      dueDate,
      agreedDueDate: null,
      taxablePaise: totals.taxablePaise,
      cgstPaise: totals.cgstPaise,
      sgstPaise: totals.sgstPaise,
      igstPaise: totals.igstPaise,
      roundOffPaise: totals.roundOffPaise,
      totalPaise: totals.totalPaise,
      paidPaise: 0,
      status: "sent",
      ladderStage: 0,
      pausedUntil: null,
      pauseReason: null,
      payToken: ids.payToken(rowId),
    };
    if ((await worlds.create("invoices", owned(row))) === "created") invoice = row;
    else taken.push(number);
  }
  if (!invoice) return fail(409, "number_taken");
  const { $id: invoiceId, number, payToken } = invoice;

  const invoiceLines = lineRows(workspaceId, invoiceId, lines, ids.row);

  const event: EventRow = {
    $id: ids.row(),
    workspaceId,
    invoiceId,
    at: `${today}T12:00:00.000+05:30`,
    type: "sent",
    actor: "owner",
    summary: `Invoice sent; ${creditDays} days' credit, due ${formatDate(dueDate)}`,
    payload: JSON.stringify({ totalPaise: totals.totalPaise }),
  };

  const world: WorldRows = {
    invoice_lines: invoiceLines.map(owned),
    events: [owned(event)],
  };
  await worlds.write(world);

  return {
    ok: true,
    invoice: {
      $id: invoiceId,
      number,
      docType: totals.docType,
      customerId,
      issueDate: today,
      dueDate,
      taxablePaise: totals.taxablePaise,
      cgstPaise: totals.cgstPaise,
      sgstPaise: totals.sgstPaise,
      igstPaise: totals.igstPaise,
      roundOffPaise: totals.roundOffPaise,
      totalPaise: totals.totalPaise,
      paidPaise: 0,
      status: "sent",
      payToken,
    },
    customer: customerOut,
  };
}
