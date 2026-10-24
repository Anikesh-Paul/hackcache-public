// POST /api/customers and POST /api/customers/:id. A Customer is added or
// edited only in the visitor's own Demo world, and every field is checked
// here, the same way a new Customer on an Invoice is.
import { Permission, Role } from "node-appwrite";
import type { CustomerRow } from "@tagada/appwrite";
import { checkGstin, stateName } from "@tagada/money";
import { indianMobile, isCustomerLang, type CustomerLang } from "@tagada/domain";
import { workspaceIdFor, type OwnedRow, type WorldStore } from "./demo.ts";
import { stamp } from "./pay.ts";

export type CustomerFields = {
  name: string;
  /** Null for a Customer with no GST registration (B2C). */
  gstin: string | null;
  stateCode: string;
  creditDays: number;
  lang: CustomerLang;
  address: string | null;
  email: string | null;
  /** "+91" and ten digits. */
  phone: string | null;
  consentCalls: boolean;
};

export type CustomerFailure = { ok: false; status: 400 | 404 | 409; error: string };
export type CustomerSaved = { ok: true; customer: CustomerRow };

const fail = (status: CustomerFailure["status"], error: string): CustomerFailure => ({ ok: false, status, error });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** A missing or empty optional string is null; anything but a string is undefined (refused). */
function optional(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;
}

/** Every field of a Customer, checked. Email, phone, address and GSTIN are optional. */
export function parseCustomer(value: unknown): CustomerFields | CustomerFailure {
  if (!isRecord(value)) return fail(400, "invalid_body");
  const name = text(value.name)?.trim() ?? "";
  const gstin = text(value.gstin)?.trim().toUpperCase() ?? "";
  const stateCode = text(value.stateCode)?.trim() ?? "";
  const creditDays = typeof value.creditDays === "number" && Number.isInteger(value.creditDays) ? value.creditDays : null;
  const lang = text(value.lang);
  const address = optional(value.address);
  const email = optional(value.email);
  const phone = optional(value.phone);
  const consent = value.consentCalls === undefined ? false : value.consentCalls;
  if (!name || name.length > 128) return fail(400, "invalid_customer");
  // A GSTIN is optional: a small shop or a household buyer has none. One that is given must check.
  if (gstin && !checkGstin(gstin).ok) return fail(400, "invalid_gstin");
  if (!/^[0-9]{2}$/.test(stateCode) || (gstin && stateCode !== gstin.slice(0, 2)) || !stateName(stateCode)) {
    return fail(400, "invalid_customer");
  }
  if (creditDays === null || creditDays < 0 || creditDays > 365) return fail(400, "invalid_customer");
  if (!lang || !isCustomerLang(lang)) return fail(400, "invalid_customer");
  if (address === undefined || (address !== null && address.length > 256)) return fail(400, "invalid_customer");
  if (email === undefined || (email !== null && (email.length > 254 || !EMAIL.test(email)))) return fail(400, "invalid_email");
  const mobile = phone === null ? null : phone === undefined ? undefined : indianMobile(phone);
  if (mobile === undefined || (phone && !mobile)) return fail(400, "invalid_phone");
  if (typeof consent !== "boolean") return fail(400, "invalid_customer");
  return { name, gstin: gstin || null, stateCode, creditDays, lang, address, email, phone: mobile, consentCalls: consent };
}

/** The columns a Customer's form sets. The grade, history and buyer type are the books' own. */
function columns(fields: CustomerFields) {
  return {
    name: fields.name,
    address: fields.address,
    gstin: fields.gstin,
    stateCode: fields.stateCode,
    place: stateName(fields.stateCode),
    phone: fields.phone,
    email: fields.email,
    creditDays: fields.creditDays,
    consentCalls: fields.consentCalls,
    lang: fields.lang,
  };
}

/** A new Customer's row, owned by this visitor. `today` stamps the call consent, if given. */
export function newCustomerRow(
  workspaceId: string,
  userId: string,
  $id: string,
  fields: CustomerFields,
  today: string,
): OwnedRow & CustomerRow {
  return {
    $id,
    workspaceId,
    $permissions: [Permission.read(Role.user(userId)), Permission.update(Role.user(userId))],
    ...columns(fields),
    buyerType: "goods",
    avgDelayDays: null,
    grade: null,
    gradeReason: null,
    consentAt: fields.consentCalls ? stamp(today) : null,
    gender: null,
  };
}

async function demoToday(worlds: WorldStore, workspaceId: string): Promise<string | null> {
  const workspace = await worlds.get("workspaces", workspaceId);
  return workspace ? text(workspace.today) : null;
}

/** Adds a Customer to the visitor's world. */
export async function addCustomer(
  worlds: WorldStore,
  userId: string,
  body: unknown,
  newId: () => string,
): Promise<CustomerSaved | CustomerFailure> {
  const fields = parseCustomer(body);
  if ("ok" in fields) return fields;
  const workspaceId = workspaceIdFor(userId);
  const today = await demoToday(worlds, workspaceId);
  if (!today) return fail(409, "world_not_ready");
  const row = newCustomerRow(workspaceId, userId, newId(), fields, today);
  await worlds.write({ customers: [row] });
  const { $permissions: _, ...customer } = row;
  return { ok: true, customer };
}

/**
 * Changes a Customer of the visitor's own world. Their state is the place of
 * supply on every Invoice already issued to them, so it cannot move once they
 * have one: that would change the tax on a saved Tax Invoice.
 */
export async function editCustomer(
  worlds: WorldStore,
  userId: string,
  customerId: string,
  body: unknown,
): Promise<CustomerSaved | CustomerFailure> {
  const fields = parseCustomer(body);
  if ("ok" in fields) return fields;
  const workspaceId = workspaceIdFor(userId);
  const found = await worlds.get("customers", customerId);
  if (!found || found.workspaceId !== workspaceId) return fail(404, "not_found");
  const today = await demoToday(worlds, workspaceId);
  if (!today) return fail(409, "world_not_ready");
  if (fields.stateCode !== found.stateCode) {
    const invoices = await worlds.list("invoices", workspaceId, { customerId });
    if (invoices.length > 0) return fail(409, "state_locked");
  }
  const consentAt = !fields.consentCalls ? null : found.consentCalls === true && text(found.consentAt) ? text(found.consentAt) : stamp(today);
  const patch = { ...columns(fields), consentAt };
  await worlds.update("customers", customerId, patch);
  const { $permissions: _, ...stored } = found;
  return { ok: true, customer: { ...(stored as unknown as CustomerRow), ...patch } };
}
