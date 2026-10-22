import {
  SECTION16_RATE_BEFORE_BPS,
  SECTION16_RATE_CHANGE,
  SECTION16_RATE_FROM_BPS,
} from "./config.ts";
import { addMonths, daysBetween, parseCivilDate } from "./date.ts";
import { divRound, requireInt, toInt } from "./integer.ts";

/** The §16 rate by the first day it applies. The first row covers every earlier date. */
const SECTION16_TABLE: readonly { from: string; annualBps: number }[] = [
  { from: "0001-01-01", annualBps: SECTION16_RATE_BEFORE_BPS },
  { from: SECTION16_RATE_CHANGE, annualBps: SECTION16_RATE_FROM_BPS },
];

export type Section16RatePart = {
  /** Annual §16 rate in basis points. 1650 is 16.5%, 1725 is 17.25%. */
  annualBps: number;
  /** Days of the rest at this rate. Null for a flat-rate month. */
  days: number | null;
};

export type Section16Rest = {
  /** First day of the period. Null when the caller asked for a flat rate. */
  start: string | null;
  /** Day the rest is applied: a month after `start`, or `to` for a part month. */
  end: string | null;
  /** One part, or one per rate when the Bank Rate changed inside the period. */
  rates: Section16RatePart[];
  interestPaise: number;
  /** Principal plus this rest and every rest before it. */
  balancePaise: number;
};

export type Section16Interest = {
  interestPaise: number;
  rests: Section16Rest[];
};

type Section16Base = { principalPaise: number };

/** A flat rate for whole months, or a date range that reads the Bank Rate table day by day. */
export type Section16Input =
  | (Section16Base & { months: number; annualBps: number; from?: undefined; to?: undefined })
  | (Section16Base & { from: string; to: string; months?: undefined; annualBps?: undefined });

/** §16 rate in force on `isoDate`. */
export function section16RateBps(isoDate: string): number {
  if (!parseCivilDate(isoDate)) throw new Error(`not a date: ${isoDate}`);
  return isoDate < SECTION16_RATE_CHANGE ? SECTION16_RATE_BEFORE_BPS : SECTION16_RATE_FROM_BPS;
}

/**
 * Compound interest with monthly rests, each rest rounded to the paisa.
 *
 * Pass `months` and `annualBps` for a flat rate (the 2-month and 6-month
 * examples): each rest is the balance × rate / 12.
 *
 * Pass `from` and `to` to follow the Bank Rate table. `from` is the first day
 * interest accrues and `to` is the day it is worked out to (not counted).
 * Rests fall on the same day each month after `from`. Each day of a period
 * earns the rate in force on that day, so a month that starts before 7 Oct
 * 2026 pays 16.5% for its days before the change. The last part month is
 * pro-rated by its days.
 */
export function section16Interest(input: Section16Input): Section16Interest {
  const principal = requireInt(input.principalPaise, "principalPaise");
  if (principal < 0n) throw new Error("principalPaise must be ≥ 0");
  const periods = input.from !== undefined ? datedPeriods(input.from, input.to) : flatPeriods(input);

  let balance = principal;
  let interest = 0n;
  const rests: Section16Rest[] = [];
  for (const period of periods) {
    const gained = divRound(balance * period.weightedBps, 12n * 10_000n * period.monthDays);
    balance += gained;
    interest += gained;
    rests.push({
      start: period.start,
      end: period.end,
      rates: period.rates,
      interestPaise: toInt(gained, "interest"),
      balancePaise: toInt(balance, "balance"),
    });
  }
  return { interestPaise: toInt(interest, "interest"), rests };
}

type Period = {
  start: string | null;
  end: string | null;
  rates: Section16RatePart[];
  /** Σ days × annual bps over the period's days (bps alone for a flat month). */
  weightedBps: bigint;
  /** Days in the whole month the period belongs to (1 for a flat month). */
  monthDays: bigint;
};

function flatPeriods(input: { months: number; annualBps: number }): Period[] {
  if (!Number.isSafeInteger(input.months) || input.months < 0) {
    throw new Error("months must be a non-negative integer");
  }
  const annualBps = input.annualBps;
  if (!Number.isSafeInteger(annualBps) || annualBps < 0) {
    throw new Error("annualBps must be a non-negative integer");
  }
  return Array.from({ length: input.months }, () => ({
    start: null,
    end: null,
    rates: [{ annualBps, days: null }],
    weightedBps: BigInt(annualBps),
    monthDays: 1n,
  }));
}

function datedPeriods(from: string, to: string): Period[] {
  if (!parseCivilDate(from)) throw new Error(`not a date: ${from}`);
  if (!parseCivilDate(to)) throw new Error(`not a date: ${to}`);
  if (to < from) throw new Error("to must not be before from");

  const periods: Period[] = [];
  for (let month = 1; ; month++) {
    const start = addMonths(from, month - 1);
    if (start >= to) break;
    const restDay = addMonths(from, month);
    const end = restDay < to ? restDay : to;
    const rates = ratesBetween(start, end);
    const weightedBps = rates.reduce((sum, part) => sum + BigInt(part.days ?? 0) * BigInt(part.annualBps), 0n);
    periods.push({ start, end, rates, weightedBps, monthDays: BigInt(daysBetween(start, restDay)) });
  }
  return periods;
}

/** The days from `start` up to (not including) `end`, split where the table changes rate. */
function ratesBetween(start: string, end: string): Section16RatePart[] {
  const parts: Section16RatePart[] = [];
  SECTION16_TABLE.forEach((row, index) => {
    const next = SECTION16_TABLE[index + 1]?.from;
    const from = start > row.from ? start : row.from;
    const until = next !== undefined && next < end ? next : end;
    if (from < until) parts.push({ annualBps: row.annualBps, days: daysBetween(from, until) });
  });
  return parts;
}
