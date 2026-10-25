// The Owner's Settings: business details and Udyam number, registration and turnover (they
// drive the document type and the e-invoicing note), the Plan rule, which
// Ladder stages the daily run sends by itself, the reply-to email, the
// language and the Demo date clock's time of day. Only the fields sent are changed, and each is checked here.
import { AUTO_SEND_SWITCHES, CUSTOMER_LANGS, planRule, udyamNumber } from "@tagada/domain";
import type { WorldStore } from "./demo.ts";

export type SettingsResult = { ok: true } | { ok: false; status: 400; error: "invalid_settings"; field: string };

const REGISTRATIONS = ["regular", "composition", "unregistered"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Check = (value: unknown) => { value: unknown } | null;

const name: Check = (v) => (typeof v === "string" && v.trim() && v.trim().length <= 128 ? { value: v.trim() } : null);
const optionalText = (max: number): Check => (v) =>
  v === null || (typeof v === "string" && v.trim().length <= max) ? { value: typeof v === "string" && v.trim() ? v.trim() : null } : null;

const CHECKS: Record<string, Check> = {
  businessName: name,
  address: optionalText(256),
  // Printed on the letter and the ODR case file, so kept in the certificate's own form.
  udyamNumber: (v) => {
    if (v === null || (typeof v === "string" && !v.trim())) return { value: null };
    const number = typeof v === "string" ? udyamNumber(v) : null;
    return number ? { value: number } : null;
  },
  registrationType: (v) => (typeof v === "string" && REGISTRATIONS.includes(v) ? { value: v } : null),
  aggregateTurnoverPaise: (v) => (Number.isSafeInteger(v) && (v as number) >= 0 ? { value: v } : null),
  planRule: (v) => {
    const json = JSON.stringify(v ?? null);
    const parsed = planRule.parse(json);
    // `parse` falls back to the default for anything it cannot use; only an exact round trip is valid.
    return JSON.stringify(parsed) === json ? { value: json } : null;
  },
  autoSendStages: (v) =>
    Array.isArray(v) && v.every((s) => (AUTO_SEND_SWITCHES as readonly unknown[]).includes(s))
      ? { value: [...new Set(v as number[])].sort() }
      : null,
  ownerEmail: (v) =>
    v === null || v === "" ? { value: null } : typeof v === "string" && v.length <= 254 && EMAIL.test(v.trim()) ? { value: v.trim() } : null,
  lang: (v) => (typeof v === "string" && (CUSTOMER_LANGS as readonly string[]).includes(v) ? { value: v } : null),
  // "HH:MM", IST: the call screen's "Set the clock to 11 AM" brings it back inside calling hours.
  clock: (v) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? { value: v } : null),
};

export async function saveSettings(worlds: WorldStore, workspaceId: string, body: unknown): Promise<SettingsResult> {
  if (typeof body !== "object" || body === null) return { ok: false, status: 400, error: "invalid_settings", field: "body" };
  const patch: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(body)) {
    const check = CHECKS[field];
    const checked = check?.(value);
    if (!checked) return { ok: false, status: 400, error: "invalid_settings", field };
    patch[field] = checked.value;
  }
  if (Object.keys(patch).length > 0) await worlds.update("workspaces", workspaceId, patch);
  return { ok: true };
}
