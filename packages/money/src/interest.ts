import {
  SECTION16_RATE_BEFORE_BPS,
  SECTION16_RATE_CHANGE,
  SECTION16_RATE_FROM_BPS,
} from "./config.ts";
import { addMonths, parseCivilDate } from "./date.ts";
import { divRound, requireInt, toInt } from "./integer.ts";

export type Section16Rest = {
  /** Date the rest is applied. Null when the caller asked for a flat rate. */
  asOf: string | null;
  /** Annual §16 rate in basis points. 1650 is 16.5%, 1725 is 17.25%. */
  annualBps: number;
  interestPaise: number;
  /** Principal plus this rest and every rest before it. */
  balancePaise: number;
};

export type Section16Interest = {
  interestPaise: number;
  rests: Section16Rest[];
};

/** §16 rate in force on `isoDate`. */
export function section16RateBps(isoDate: string): number {
  if (!parseCivilDate(isoDate)) throw new Error(`not a date: ${isoDate}`);
  return isoDate < SECTION16_RATE_CHANGE ? SECTION16_RATE_BEFORE_BPS : SECTION16_RATE_FROM_BPS;
}

function oneRest(balance: bigint, annualBps: number): bigint {
  // Monthly rate = annualBps / 10000 / 12.
  return divRound(balance * BigInt(annualBps), 120_000n);
}

/**
 * Compound interest with monthly rests, each rest rounded to the paisa.
 *
 * Pass `annualBps` for a flat rate (the 2-month and 6-month examples).
 * Pass `from` to date each rest: rest `i` falls on `from` plus `i` months and
 * uses the Bank Rate table. `from` is the first day interest accrues.
 */
export function section16Interest(input: {
  principalPaise: number;
  months: number;
  from?: string;
  annualBps?: number;
}): Section16Interest {
  const principal = requireInt(input.principalPaise, "principalPaise");
  if (principal < 0n) throw new Error("principalPaise must be ≥ 0");
  if (!Number.isSafeInteger(input.months) || input.months < 0) {
    throw new Error("months must be a non-negative integer");
  }
  const dated = input.from !== undefined;
  const flat = input.annualBps !== undefined;
  if (dated === flat) throw new Error("pass from or annualBps, not both");
  if (input.annualBps !== undefined && (!Number.isSafeInteger(input.annualBps) || input.annualBps < 0)) {
    throw new Error("annualBps must be a non-negative integer");
  }
  if (dated && !parseCivilDate(input.from ?? "")) throw new Error(`not a date: ${input.from}`);
  const flatRate = input.annualBps;

  let balance = principal;
  let interest = 0n;
  const rests: Section16Rest[] = [];
  for (let i = 1; i <= input.months; i++) {
    const asOf = input.from === undefined ? null : addMonths(input.from, i);
    const annualBps = asOf === null ? flatRate : section16RateBps(asOf);
    if (annualBps === undefined) throw new Error("pass from or annualBps, not both");
    const gained = oneRest(balance, annualBps);
    balance += gained;
    interest += gained;
    rests.push({
      asOf,
      annualBps,
      interestPaise: toInt(gained, "interest"),
      balancePaise: toInt(balance, "balance"),
    });
  }
  return { interestPaise: toInt(interest, "interest"), rests };
}
