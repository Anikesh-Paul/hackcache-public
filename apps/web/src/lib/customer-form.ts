// A Customer as the Owner types them in: on New invoice, Add Customer and Edit
// Customer. The server checks every field the same way.
import type { CustomerRow } from "@tagada/appwrite";
import { stateName } from "@tagada/money";
import { indianMobile } from "@tagada/domain";
import type { LanguageId } from "./languages.ts";
import { gstinMessage } from "./preview-as.ts";

export type CustomerDraft = {
  name: string;
  gstin: string;
  stateCode: string;
  creditDays: string;
  lang: LanguageId;
  address: string;
  email: string;
  phone: string;
  consentCalls: boolean;
};

export type CustomerIssue = "name" | "gstin" | "state" | "creditDays" | "email" | "phone";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A new Customer. Every world is a Demo world, so the call-consent box starts
 * ticked: a judge can call the Customer they add at once. It stays on the form
 * to untick, and the server records when it was given (`consentAt`).
 */
export function blankCustomer(): CustomerDraft {
  return { name: "", gstin: "", stateCode: "", creditDays: "30", lang: "en", address: "", email: "", phone: "", consentCalls: true };
}

/** A saved Customer, to edit. */
export function draftOf(customer: CustomerRow): CustomerDraft {
  const lang = customer.lang === "hi" || customer.lang === "bn" ? customer.lang : "en";
  return {
    name: customer.name,
    gstin: customer.gstin ?? "",
    stateCode: customer.stateCode ?? "",
    creditDays: String(customer.creditDays ?? 30),
    lang,
    address: customer.address ?? "",
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    consentCalls: customer.consentCalls,
  };
}

/** What still stops the Customer saving, in the form's order. */
export function customerIssues(draft: CustomerDraft): CustomerIssue[] {
  const credit = draft.creditDays.trim() === "" ? NaN : Number(draft.creditDays);
  const gstin = draft.gstin.trim().toUpperCase();
  const email = draft.email.trim();
  const phone = draft.phone.trim();
  const issues: CustomerIssue[] = [];
  if (!draft.name.trim()) issues.push("name");
  // A GSTIN is optional (a shop or household buyer has none), but one that is typed must check.
  if (gstin && gstinMessage(gstin) !== null) issues.push("gstin");
  if (stateName(draft.stateCode) === null || (gstin.length >= 2 && draft.stateCode !== gstin.slice(0, 2))) issues.push("state");
  if (!Number.isInteger(credit) || credit < 0 || credit > 365) issues.push("creditDays");
  if (email && (email.length > 254 || !EMAIL.test(email))) issues.push("email");
  if (phone && indianMobile(phone) === null) issues.push("phone");
  return issues;
}

/** The body `/api/customers` and a new Customer on `/api/invoices` take. */
export function customerBody(draft: CustomerDraft) {
  return {
    name: draft.name.trim(),
    gstin: draft.gstin.trim().toUpperCase() || undefined,
    stateCode: draft.stateCode,
    creditDays: Number(draft.creditDays),
    lang: draft.lang,
    address: draft.address.trim() || undefined,
    email: draft.email.trim() || undefined,
    phone: draft.phone.trim() || undefined,
    consentCalls: draft.consentCalls,
  };
}
