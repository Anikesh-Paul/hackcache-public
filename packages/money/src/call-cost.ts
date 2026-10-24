import { CALL_CREDITS_PER_MINUTE, CALL_CREDIT_PAISE_PER_THOUSAND, EMAIL_PAISE_PER_THOUSAND } from "./config.ts";
import { divRound, requireInt, toInt } from "./integer.ts";
import { sumPaise } from "./ledger.ts";

/** The agent's whole rupees as paise. A fraction is refused: the agent only ever names whole rupees. */
export function paiseFromRupees(rupees: number): number {
  return toInt(requireInt(rupees, "rupees") * 100n, "paise");
}

/** Paise as whole rupees, half up: what the agent is told. */
export function rupeesFromPaise(paise: number): number {
  return toInt(divRound(requireInt(paise, "paise"), 100n), "rupees");
}

function count(value: number, name: string): bigint {
  const n = requireInt(value, name);
  if (n < 0n) throw new Error(`${name} must be ≥ 0`);
  return n;
}

/** Credits a call of this many seconds uses, by the second, half up. */
export function callCredits(durationS: number): number {
  return toInt(divRound(count(durationS, "durationS") * BigInt(CALL_CREDITS_PER_MINUTE), 60n), "credits");
}

/** What these credits cost in paise, half up. */
export function callCostPaise(credits: number): number {
  return toInt(divRound(count(credits, "credits") * BigInt(CALL_CREDIT_PAISE_PER_THOUSAND), 1000n), "cost");
}

/** What this many emails cost in paise, half up. */
export function emailCostPaise(emails: number): number {
  return toInt(divRound(count(emails, "emails") * BigInt(EMAIL_PAISE_PER_THOUSAND), 1000n), "cost");
}

/** What it cost to collect each ₹100, in paise, half up. Null when nothing was collected. */
export function costPerHundredPaise(costPaise: number, collectedPaise: number): number | null {
  const collected = count(collectedPaise, "collectedPaise");
  if (collected === 0n) return null;
  return toInt(divRound(count(costPaise, "costPaise") * 10_000n, collected), "cost");
}

/** What the AI calls cost, and what the Plans and Promises agreed on them secured: the ROI tile on Today. */
export function callReturn(input: {
  /** ElevenLabs' credit count for each call when it sent one; else the credits for its duration; else nothing yet. */
  calls: readonly { credits: number | null; durationS: number | null }[];
  securedPaise: readonly number[];
}): { calls: number; costPaise: number; securedPaise: number } {
  const credits = input.calls.map((call) => call.credits ?? (call.durationS === null ? 0 : callCredits(call.durationS)));
  const total = credits.reduce((sum, c) => sum + count(c, "credits"), 0n);
  return {
    calls: input.calls.length,
    costPaise: callCostPaise(toInt(total, "credits")),
    securedPaise: sumPaise(input.securedPaise),
  };
}
