// The Owner's Plan rule, enforced here and never by the AI. A Plan is two or
// more instalments; one amount by one date is a Promise.
import {
  addDays,
  daysBetween,
  differencePaise,
  formatDate,
  formatInr,
  isCivilDate,
  minimumSharePaise,
  nearestPaise,
  sharePaise,
  sumPaise,
} from "@tagada/money";

export type PlanRule = {
  /** The first instalment is at least this share of what is owed, in whole percent. */
  minFirstPct: number;
  /** …and falls within this many days of the Demo date. */
  firstWithinDays: number;
  /** Every later instalment falls within this many days. */
  restWithinDays: number;
};

export const DEFAULT_PLAN_RULE: PlanRule = { minFirstPct: 50, firstWithinDays: 7, restWithinDays: 30 };

export type Instalment = { amountPaise: number; date: string };

export type PlanOffer = {
  owedPaise: number;
  /** The Demo date. */
  today: string;
  instalments: readonly { amountPaise: number; date: string | null }[];
};

/** Why a Plan is outside the rule, as facts: each screen words them in its own language. */
export type PlanIssue =
  | { kind: "first_short"; amountPaise: number; minPaise: number; pct: number }
  | { kind: "first_late" | "last_late"; date: string; by: string; days: number };

/** The English sentence for an issue: what the AI is told and what stored summaries say. */
export function planIssueReason(issue: PlanIssue): string {
  if (issue.kind === "first_short") {
    return `The first instalment, ${formatInr(issue.amountPaise)}, is below your ${issue.pct}% rule (${formatInr(issue.minPaise)}).`;
  }
  const which = issue.kind === "first_late" ? "first" : "last";
  return `The ${which} instalment is due on ${formatDate(issue.date)}, after your ${issue.days} days (${formatDate(issue.by)}).`;
}

export type PlanVerdict =
  | { verdict: "accept"; minFirstPaise: number; instalments: Instalment[] }
  /** Only the first amount is short: the same dates with exactly the minimum first. */
  | { verdict: "counter"; minFirstPaise: number; instalments: Instalment[]; issues: PlanIssue[]; reasons: string[] }
  | { verdict: "needs_owner"; minFirstPaise: number; instalments: Instalment[]; issues: PlanIssue[]; reasons: string[] }
  /** Not a Plan that can be recorded. The sentence says what to do instead. */
  | { verdict: "reject"; minFirstPaise: number; reason: string };

function minimumFirst(rule: PlanRule, owedPaise: number): number {
  return minimumSharePaise(owedPaise, rule.minFirstPct * 100);
}

function evaluate(rule: PlanRule, offer: PlanOffer): PlanVerdict {
  const minFirstPaise = minimumFirst(rule, offer.owedPaise);
  const reject = (reason: string): PlanVerdict => ({ verdict: "reject", minFirstPaise, reason });

  if (offer.instalments.length < 2) {
    return reject("Not recorded: a Plan needs two or more instalments. One amount by one date is a Promise.");
  }
  const instalments: Instalment[] = [];
  for (const { amountPaise, date } of offer.instalments) {
    if (date === null || !isCivilDate(date)) {
      return reject(
        "Not recorded: every instalment needs a date (YYYY-MM-DD). Ask for the missing date and check the Plan again.",
      );
    }
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      return reject("Not recorded: every instalment needs an amount above ₹0.");
    }
    instalments.push({ amountPaise, date });
  }
  const [first] = instalments;
  const last = instalments[instalments.length - 1];
  if (!first || !last) return reject("Not recorded: a Plan needs two or more instalments.");
  if (daysBetween(offer.today, first.date) < 0) {
    return reject(`Not recorded: the first instalment's date is before today, ${formatDate(offer.today)}.`);
  }
  if (instalments.some((inst, n) => n > 0 && daysBetween(instalments[n - 1]?.date ?? inst.date, inst.date) <= 0)) {
    return reject("Not recorded: each instalment must fall after the one before it.");
  }
  const total = sumPaise(instalments.map((i) => i.amountPaise));
  if (total !== offer.owedPaise) {
    return reject(
      `Not recorded: the instalments add up to ${formatInr(total)} but ${formatInr(offer.owedPaise)} is owed. ` +
        "Make the last instalment the rest and check the Plan again.",
    );
  }

  const firstBy = addDays(offer.today, rule.firstWithinDays);
  const restBy = addDays(offer.today, rule.restWithinDays);
  const short: PlanIssue | false = first.amountPaise < minFirstPaise && {
    kind: "first_short",
    amountPaise: first.amountPaise,
    minPaise: minFirstPaise,
    pct: rule.minFirstPct,
  };
  const late = [
    daysBetween(firstBy, first.date) > 0 &&
      ({ kind: "first_late", date: first.date, by: firstBy, days: rule.firstWithinDays } as const),
    daysBetween(restBy, last.date) > 0 &&
      ({ kind: "last_late", date: last.date, by: restBy, days: rule.restWithinDays } as const),
  ].filter((i): i is Extract<PlanIssue, { kind: "first_late" | "last_late" }> => i !== false);

  if (late.length > 0) {
    const issues = short ? [short, ...late] : late;
    return { verdict: "needs_owner", minFirstPaise, instalments, issues, reasons: issues.map(planIssueReason) };
  }
  if (short) {
    return {
      verdict: "counter",
      minFirstPaise,
      instalments: [
        { amountPaise: minFirstPaise, date: first.date },
        { amountPaise: differencePaise(offer.owedPaise, minFirstPaise), date: last.date },
      ],
      issues: [short],
      reasons: [planIssueReason(short)],
    };
  }
  return { verdict: "accept", minFirstPaise, instalments };
}

/**
 * Plans the rule accepts, for the pay link: the minimum first on the last
 * allowed day and the rest on the last day; then the rest in two near-halves.
 */
function choices(rule: PlanRule, { owedPaise, today }: { owedPaise: number; today: string }): Instalment[][] {
  const min = minimumFirst(rule, owedPaise);
  const rest = differencePaise(owedPaise, min);
  if (min <= 0 || rest <= 0) return [];
  const firstBy = addDays(today, rule.firstWithinDays);
  const restBy = addDays(today, rule.restWithinDays);
  const out: Instalment[][] = [
    [
      { amountPaise: min, date: firstBy },
      { amountPaise: rest, date: restBy },
    ],
  ];
  const middle = addDays(today, Math.round((rule.firstWithinDays + rule.restWithinDays) / 2));
  // Whole rupees where the amount allows it: a Customer should not be asked for ₹5,827.50.
  const half = nearestPaise(sharePaise(rest, 2), 100);
  const otherHalf = differencePaise(rest, half);
  if (half > 0 && otherHalf > 0 && daysBetween(firstBy, middle) > 0 && daysBetween(middle, restBy) > 0) {
    out.push([
      { amountPaise: min, date: firstBy },
      { amountPaise: half, date: middle },
      { amountPaise: otherHalf, date: restBy },
    ]);
  }
  return out;
}

const whole = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

/** The workspace's stored rule (a JSON column), or the default when it is missing or unusable. */
function parse(stored: string | null): PlanRule {
  if (!stored) return DEFAULT_PLAN_RULE;
  try {
    const r = JSON.parse(stored) as Partial<PlanRule>;
    if (
      whole(r.minFirstPct, 1, 100) &&
      whole(r.firstWithinDays, 0, 90) &&
      whole(r.restWithinDays, 1, 365) &&
      r.restWithinDays > r.firstWithinDays
    ) {
      return { minFirstPct: r.minFirstPct, firstWithinDays: r.firstWithinDays, restWithinDays: r.restWithinDays };
    }
  } catch {
    // falls through to the default
  }
  return DEFAULT_PLAN_RULE;
}

export const planRule = { evaluate, choices, parse };
