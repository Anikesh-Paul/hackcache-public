// POST /api/invoices. The browser may send totals; they are ignored. The
// figures, the document type and the FY number all come from here.
import { Permission, Role } from "node-appwrite";
import type { CustomerRow, EventRow, InvoiceLineRow, InvoiceRow } from "@tagada/appwrite";
import {
  addDays,
  checkGstin,
  financialYear,
  formatDate,
  invoiceNumber,
  invoiceTotals,
  isGstRate,
  stateName,
  type GstRate,
  type Registration,
} from "@tagada/money";
import { workspaceIdFor, type OwnedRow, type WorldRows, type WorldStore } from "./demo.ts";

const PREFIX = "TBW";
const LANGS = ["en", "hi", "bn"] as const;

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

type LineInput = {
  description: string;
  hsn: string;
  quantity: number;
  ratePaise: number;
  discountPercent: number;
  gstRatePercent: GstRate;
};

type NewCustomer = {
  name: string;
  gstin: string;
  stateCode: string;
  creditDays: number;
  lang: (typeof LANGS)[number];
  address: string | null;
};

const fail = (status: 400 | 409, error: string): IssueFailure => ({ ok: false, status, error });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function whole(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
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

function parseLine(value: unknown): LineInput | null {
  if (!isRecord(value)) return null;
  const description = text(value.description)?.trim() ?? "";
  const hsn = text(value.hsn)?.trim() ?? "";
  const quantity = whole(value.quantity);
  const ratePaise = whole(value.ratePaise);
  const discountPercent = value.discountPercent === undefined ? 0 : whole(value.discountPercent);
  const gstRatePercent = whole(value.gstRatePercent);
  if (!description || description.length > 256) return null;
  if (!/^\d{4,8}$/.test(hsn)) return null;
  if (quantity === null || quantity < 1 || quantity > 1_000_000) return null;
  if (ratePaise === null || ratePaise < 0) return null;
  if (discountPercent === null || discountPercent < 0 || discountPercent > 100) return null;
  if (gstRatePercent === null || !isGstRate(gstRatePercent)) return null;
  return { description, hsn, quantity, ratePaise, discountPercent, gstRatePercent };
}

function parseLines(value: unknown): LineInput[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 30) return null;
  const lines: LineInput[] = [];
  for (const item of value) {
    const line = parseLine(item);
    if (!line) return null;
    lines.push(line);
  }
  return lines;
}

function parseNewCustomer(value: unknown): NewCustomer | IssueFailure {
  if (!isRecord(value)) return fail(400, "invalid_body");
  const name = text(value.name)?.trim() ?? "";
  const gstin = text(value.gstin)?.trim().toUpperCase() ?? "";
  const stateCode = text(value.stateCode)?.trim() ?? "";
  const creditDays = whole(value.creditDays);
  const lang = text(value.lang);
  const address = value.address === undefined || value.address === null ? null : text(value.address)?.trim();
  if (!name || name.length > 128) return fail(400, "invalid_customer");
  if (!checkGstin(gstin).ok) return fail(400, "invalid_gstin");
  if (!/^[0-9]{2}$/.test(stateCode) || stateCode !== gstin.slice(0, 2) || !stateName(stateCode)) {
    return fail(400, "invalid_customer");
  }
  if (creditDays === null || creditDays < 0 || creditDays > 365) return fail(400, "invalid_customer");
  if (!lang || !(LANGS as readonly string[]).includes(lang)) return fail(400, "invalid_customer");
  if (address === undefined || (address !== null && address.length > 256)) return fail(400, "invalid_customer");
  return { name, gstin, stateCode, creditDays, lang: lang as NewCustomer["lang"], address };
}

function registrationOf(value: unknown): Registration | null {
  return value === "regular" || value === "composition" || value === "unregistered" ? value : null;
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
  ids: { row: () => string; payToken: () => string },
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
  const registration = registrationOf(workspace.registrationType);
  const supplierState = text(workspace.stateCode);
  const today = text(workspace.today);
  const turnover = whole(workspace.aggregateTurnoverPaise) ?? 0;
  if (!registration || !supplierState || !today) return fail(409, "world_not_ready");

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
    const parsed = parseNewCustomer(body.customer);
    if ("ok" in parsed) return parsed;
    customerId = ids.row();
    customerState = parsed.stateCode;
    creditDays = parsed.creditDays;
    const row: CustomerRow = {
      $id: customerId,
      workspaceId,
      name: parsed.name,
      address: parsed.address,
      gstin: parsed.gstin,
      stateCode: parsed.stateCode,
      place: stateName(parsed.stateCode),
      phone: null,
      email: null,
      buyerType: "goods",
      creditDays,
      avgDelayDays: null,
      grade: null,
      gradeReason: null,
      consentCalls: false,
      consentAt: null,
      lang: parsed.lang,
      gender: null,
    };
    created = owned(row);
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
    creditDays = whole(found.creditDays) ?? 30;
    customerOut = {
      $id: found.$id,
      name,
      gstin: text(found.gstin),
      stateCode,
      creditDays,
      lang: text(found.lang),
    };
  }

  let totals;
  try {
    totals = invoiceTotals({
      registration,
      supplierStateCode: supplierState,
      placeOfSupplyStateCode: customerState,
      aggregateTurnoverPaise: turnover,
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

  const existing = (await worlds.list("invoices", workspaceId)).flatMap((row) => {
    const number = text(row.number);
    return number ? [number] : [];
  });
  const number = nextInvoiceNumber(existing, today);
  const invoiceId = ids.row();
  const dueDate = addDays(today, creditDays);
  const payToken = ids.payToken();

  const invoice: InvoiceRow = {
    $id: invoiceId,
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
    payToken,
  };

  const invoiceLines: InvoiceLineRow[] = lines.map((line) => ({
    $id: ids.row(),
    workspaceId,
    invoiceId,
    description: line.description,
    hsn: line.hsn,
    qtyMilli: line.quantity * 1000,
    ratePaise: line.ratePaise,
    discountBp: line.discountPercent * 100,
    gstRateBp: line.gstRatePercent * 100,
  }));

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
    invoices: [owned(invoice)],
    invoice_lines: invoiceLines.map(owned),
    events: [owned(event)],
  };
  if (created) world.customers = [created];
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
