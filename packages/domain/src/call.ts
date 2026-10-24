// Call with AI (build plan §5, §6.4). The agent talks; this code decides: who
// may be called and when, whether a Plan fits the Owner's rule, and what a
// call may record. Amounts and dates reach the agent as ready Hindi words.
import {
  addDays,
  differencePaise,
  formatDate,
  formatInr,
  hindiDate,
  hindiRupees,
  isCivilDate,
  paiseFromRupees,
  rupeesFromPaise,
  daysBetween,
  weekday,
} from "@tagada/money";
import { planRule, type Instalment, type PlanIssue, type PlanRule } from "./plan-rule.ts";

/** Calls are made from 10 AM up to, not at, 6 PM IST, by the Demo date clock. */
export const CALLING_HOURS = { from: "10:00", to: "18:00" } as const;

/** The Demo date clock's time of day when a world has not set one. */
export const DEMO_CLOCK = "11:20";

export type CallBlock = "no_consent" | "outside_hours" | "disputed" | "nothing_owed";

export type CallGuardInput = {
  customerName: string;
  consentCalls: boolean;
  consentAt: string | null;
  /** "HH:MM", IST, by the Demo date clock. */
  clock: string;
  balancePaise: number;
  disputed: boolean;
};

export type CallGuard = { ok: true } | { ok: false; block: CallBlock; message: string };

const minutes = (hhmm: string): number | null => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Whether this Invoice's Customer may be called now. The server asks again before any session. */
export function callGuard(input: CallGuardInput): CallGuard {
  if (input.balancePaise <= 0) return { ok: false, block: "nothing_owed", message: "Nothing is owed on this Invoice." };
  if (input.disputed) {
    return {
      ok: false,
      block: "disputed",
      message: "This Invoice is disputed. Calls stop until you resolve the Dispute.",
    };
  }
  if (!input.consentCalls || !input.consentAt) {
    return {
      ok: false,
      block: "no_consent",
      message: `${input.customerName} has not agreed to reminder calls. Send a reminder or the pay link instead.`,
    };
  }
  const now = minutes(input.clock);
  const from = minutes(CALLING_HOURS.from) ?? 0;
  const to = minutes(CALLING_HOURS.to) ?? 0;
  if (now === null || now < from || now >= to) {
    return {
      ok: false,
      block: "outside_hours",
      message: `It is ${input.clock} by the Demo date clock. Calls are made only between 10 AM and 6 PM.`,
    };
  }
  return { ok: true };
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const weekdayName = (iso: string) => WEEKDAYS[weekday(iso) ?? 0] ?? "";

/** "Monday 2026-11-02": the Demo date for the agent's `today`. */
export function callDay(iso: string): string {
  return `${weekdayName(iso)} ${iso}`;
}

/** The next `days` days with their weekdays: the agent looks dates up here instead of working them out. */
export function callCalendar(today: string, days = 15): string {
  return Array.from({ length: days }, (_, i) => {
    const iso = addDays(today, i);
    return `${callDay(iso)}${i === 0 ? " (today)" : ""}`;
  }).join(", ");
}

const NOT_A_NAME = new Set(["m/s", "m/s.", "ms", "hotel", "the", "shri", "sri"]);

/** How the agent addresses the Customer, before "जी": the first word that names them. */
export function spokenName(name: string): string {
  const words = name.trim().split(/\s+/);
  return words.find((w) => !NOT_A_NAME.has(w.toLowerCase())) ?? words[0] ?? "";
}

/** The call agent's first message, as set on the ElevenLabs agent; ElevenLabs fills in the {{variables}}. */
const MUNIM_FIRST_MESSAGE =
  "नमस्ते {{customer_name}} जी, मैं {{business_name}} की ओर से AI सहायक मुनीम बोल रही हूँ। आपके {{amount_words}} के बिल के बारे में बात करनी थी, क्या अभी दो मिनट बात हो सकती है?";

/** Munim's first line on a call: she names the business and says she is an AI. */
export function munimFirstLine(input: { customerName: string; businessName: string; amountWords: string }): string {
  return MUNIM_FIRST_MESSAGE.replace("{{customer_name}}", spokenName(input.customerName))
    .replace("{{business_name}}", input.businessName)
    .replace("{{amount_words}}", input.amountWords);
}

/** The Owner's rule and what this Invoice still owes, on the Demo date. */
export type CallContext = { rule: PlanRule; owedPaise: number; today: string };

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** Whole rupees from the agent, as a number or a string of digits. */
function rupees(v: unknown): number | null {
  const n = typeof v === "string" && /^\s*\d+\s*$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
}

const day = (v: unknown): string | null => {
  const s = text(v);
  return s && isCivilDate(s) ? s : null;
};

const toRupees = rupeesFromPaise;

/** Hindi words handed to the agent and the amount they stand for, to show what it said in figures. */
export type Said = { words: string; paise: number };

/** The margin note for one check: what the code, not the agent, decided. */
export type RuleCheck = { offeredPaise: number; accepted: boolean; note: string };

/**
 * The `propose_plan` client tool: one offer of a first amount and two dates,
 * judged by the Plan rule. The reply carries every amount and date the agent
 * may say, already in Hindi words.
 */
export function proposePlan(
  ctx: CallContext,
  args: unknown,
): { reply: Record<string, unknown>; check: RuleCheck | null; said: Said[] } {
  const a = (typeof args === "object" && args !== null ? args : {}) as Record<string, unknown>;
  const offered = rupees(a.first_amount_rupees);
  const firstDate = day(a.first_date);
  const restDate = day(a.rest_date);
  const min = planRule.evaluate(ctx.rule, { owedPaise: ctx.owedPaise, today: ctx.today, instalments: [] }).minFirstPaise;
  const said: Said[] = [{ words: hindiRupees(min), paise: min }];
  const words = {
    min_first_amount_rupees: toRupees(min),
    min_first_amount_words: hindiRupees(min),
    ...(firstDate ? { first_date_words: hindiDate(firstDate) } : {}),
    ...(restDate ? { rest_date_words: hindiDate(restDate) } : {}),
  };
  if (offered === null || offered === 0) {
    return { reply: { accepted: false, error: "Not checked: first_amount_rupees must be whole rupees.", ...words }, check: null, said };
  }
  const offeredPaise = paiseFromRupees(offered);
  if (offeredPaise >= ctx.owedPaise) {
    return {
      reply: {
        accepted: false,
        error: `Not checked: ${offered} rupees is the whole amount, which is a Promise, not a Plan. Use record_outcome with outcome "promise".`,
        ...words,
      },
      check: null,
      said,
    };
  }
  const verdict = planRule.evaluate(ctx.rule, {
    owedPaise: ctx.owedPaise,
    today: ctx.today,
    instalments: [
      { amountPaise: offeredPaise, date: firstDate },
      { amountPaise: differencePaise(ctx.owedPaise, offeredPaise), date: restDate },
    ],
  });
  if (verdict.verdict === "reject") {
    return {
      reply: { accepted: false, error: verdict.reason, offered_first_amount_words: hindiRupees(offeredPaise), ...words },
      check: null,
      said: [...said, { words: hindiRupees(offeredPaise), paise: offeredPaise }],
    };
  }
  const accepted = verdict.verdict === "accept";
  const first = accepted ? offeredPaise : Math.max(offeredPaise, min);
  const by = formatDate(firstDate ?? ctx.today);
  const rest = differencePaise(ctx.owedPaise, first);
  return {
    said: [
      ...said,
      { words: hindiRupees(offeredPaise), paise: offeredPaise },
      { words: hindiRupees(first), paise: first },
      { words: hindiRupees(rest), paise: rest },
    ],
    reply: {
      accepted,
      reasons: accepted ? [] : verdict.reasons,
      offered_first_amount_words: hindiRupees(offeredPaise),
      plan_first_amount_words: hindiRupees(first),
      plan_rest_amount_words: hindiRupees(rest),
      ...words,
    },
    check: {
      offeredPaise,
      accepted,
      note: accepted
        ? `${formatInr(offeredPaise)} by ${by}, the rest by ${formatDate(restDate ?? ctx.today)}: inside your rule`
        : offeredPaise < min
          ? `${formatInr(offeredPaise)} by ${by}: below your ${ctx.rule.minFirstPct}% rule (${formatInr(min)}), so the agent will counter`
          : `${formatInr(offeredPaise)} by ${by}: dates outside your rule, so the agent will ask for your dates`,
    },
  };
}

export const CALL_OUTCOMES = [
  "promise",
  "plan",
  "plan_needs_owner",
  "already_paid",
  "dispute",
  "callback",
  "refused",
] as const;

export type CallOutcome =
  | { kind: "promise"; instalments: [Instalment]; notes: string | null }
  | { kind: "plan"; instalments: Instalment[]; notes: string | null }
  | { kind: "plan_needs_owner"; instalments: Instalment[]; issues: PlanIssue[]; reasons: string[]; notes: string | null }
  | { kind: "already_paid"; reference: string | null; date: string | null; notes: string | null }
  | { kind: "dispute"; notes: string }
  | { kind: "callback"; date: string | null; notes: string | null }
  | { kind: "refused"; notes: string | null };

export type OutcomeCheck = { ok: true; outcome: CallOutcome } | { ok: false; say: string };

const no = (sentence: string): OutcomeCheck => ({ ok: false, say: `error: not recorded. ${sentence}` });

/**
 * What `record_outcome` may record, checked against the Invoice and the rule.
 * A refusal is a sentence telling the agent what to call instead.
 */
export function checkOutcome(ctx: CallContext, args: unknown): OutcomeCheck {
  const a = (typeof args === "object" && args !== null ? args : {}) as Record<string, unknown>;
  const notes = text(a.notes)?.replace(/\s+/g, " ").slice(0, 500) ?? null;
  const date = day(a.date);
  const amount = rupees(a.amount_rupees);
  switch (a.outcome) {
    case "plan":
    case "plan_needs_owner": {
      const restDate = day(a.rest_date);
      if (!date || !restDate) {
        return no("A plan needs both date and rest_date (YYYY-MM-DD). Call record_outcome again with both.");
      }
      if (amount === null || amount === 0) return no("A plan needs amount_rupees, the first amount in whole rupees.");
      const first = paiseFromRupees(amount);
      if (first >= ctx.owedPaise) {
        return no(`${amount} rupees is the whole amount. Use outcome "promise" with that date.`);
      }
      const verdict = planRule.evaluate(ctx.rule, {
        owedPaise: ctx.owedPaise,
        today: ctx.today,
        instalments: [
          { amountPaise: first, date },
          { amountPaise: differencePaise(ctx.owedPaise, first), date: restDate },
        ],
      });
      if (verdict.verdict === "reject") return no(verdict.reason);
      if (verdict.verdict === "accept") return { ok: true, outcome: { kind: "plan", instalments: verdict.instalments, notes } };
      if (a.outcome === "plan") {
        const min = toRupees(verdict.minFirstPaise);
        return first < verdict.minFirstPaise
          ? no(
              `A "plan" needs amount_rupees of at least ${min}. If the customer agreed to the minimum, call record_outcome again ` +
                `with amount_rupees ${min}; otherwise use outcome "plan_needs_owner" with their own offer.`,
            )
          : no(`${verdict.reasons.join(" ")} Use outcome "plan_needs_owner" with their offer.`);
      }
      return {
        ok: true,
        outcome: {
          kind: "plan_needs_owner",
          instalments: [
            { amountPaise: first, date },
            { amountPaise: differencePaise(ctx.owedPaise, first), date: restDate },
          ],
          issues: verdict.issues,
          reasons: verdict.reasons,
          notes,
        },
      };
    }
    case "promise": {
      if (!date) return no("A promise needs date (YYYY-MM-DD). Call record_outcome again with the date.");
      if (daysBetween(ctx.today, date) < 0) return no(`The date ${date} is before today, ${ctx.today}.`);
      const paise = amount === null || amount === 0 ? ctx.owedPaise : paiseFromRupees(amount);
      if (paise > ctx.owedPaise) {
        return no(`${amount} rupees is more than is owed. Leave amount_rupees out for the whole amount.`);
      }
      return { ok: true, outcome: { kind: "promise", instalments: [{ amountPaise: paise, date }], notes } };
    }
    case "already_paid":
      return { ok: true, outcome: { kind: "already_paid", reference: text(a.reference)?.slice(0, 64) ?? null, date, notes } };
    case "dispute":
      return { ok: true, outcome: { kind: "dispute", notes: notes ?? "Said on the call that the bill is wrong" } };
    case "callback":
      return { ok: true, outcome: { kind: "callback", date, notes } };
    case "refused":
      return { ok: true, outcome: { kind: "refused", notes } };
    default:
      return no(`outcome must be one of ${CALL_OUTCOMES.join(", ")}.`);
  }
}

/** The transcript without voice-direction tags such as "[polite]". */
export function stripTags(message: string): string {
  return message
    .replace(/\[[a-z][a-z _-]*\]\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** A Plan or Promise in words: "₹60,000 by Fri 6 Nov, then ₹58,000 by Wed 2 Dec". */
export function planInWords(plan: readonly Instalment[]): string {
  return plan.map((i) => `${formatInr(i.amountPaise)} by ${formatDate(i.date)}`).join(", then ");
}

/** The one-tap Hindi WhatsApp confirmation after a Plan is approved: amounts in figures, dates in Hindi. */
export function callConfirmation(input: {
  customerName: string;
  businessName: string;
  instalments: readonly Instalment[];
  payUrl: string;
}): string {
  const lines = input.instalments.map((i) => `${formatInr(i.amountPaise)} ${hindiDate(i.date)} तक`).join("; ");
  return (
    `नमस्ते ${spokenName(input.customerName)} जी, ${input.businessName} का संदेश। ` +
    `आज फ़ोन पर तय हुई किश्तें: ${lines}। यहाँ से भरें: ${input.payUrl} धन्यवाद।`
  );
}

/** A wa.me link with the text filled in; an Indian 10-digit number gets 91 in front. */
export function whatsappLink(phone: string | null, message: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const to = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${to}?text=${encodeURIComponent(message)}`;
}
