import { CALL_CREDITS_PER_MINUTE, CALL_CREDIT_PAISE_PER_THOUSAND } from "./config.ts";
import { divRound, requireInt, toInt } from "./integer.ts";

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
