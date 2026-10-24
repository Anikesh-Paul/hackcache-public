// The domain cases /proof runs beside the money cases. Expected text is a
// fixed literal. Actual text is whatever the public functions return.
import { formatInr } from "@tagada/money";
import { grade, type GradeInput } from "./grade.ts";
import { LADDER_STAGES, ladderDay, nextAction, type LadderInvoice, type NextAction } from "./ladder.ts";
import { matcherBrief, type BriefRow } from "./matcher.ts";
import { DEFAULT_PLAN_RULE, planRule, type PlanVerdict } from "./plan-rule.ts";
import { todayBook, type BookInvoice } from "./today.ts";

const noDisputesOrBrokenPromises = { disputeDates: [] as string[], brokenPromiseDates: [] as string[] };

const ladderInvoice: LadderInvoice = {
  $id: "i1",
  customerId: "c1",
  totalPaise: 11_800_000,
  paidPaise: 0,
  status: "sent",
  dueDate: "2026-11-10",
  ladderStage: 0,
  pausedUntil: null,
  pauseReason: null,
};

function ladderWords(action: NextAction): string {
  if (action.kind === "wait") return action.why;
  const name = LADDER_STAGES.find((stage) => stage.stage === action.stage)?.name ?? "Reminder";
  return `${name}, ${action.send === "auto" ? "sent for you" : "for you to send"}`;
}

function planWords(verdict: PlanVerdict): string {
  if (verdict.verdict === "accept") return "accept";
  if (verdict.verdict === "counter") {
    return `counter, first instalment ${formatInr(verdict.instalments[0]?.amountPaise ?? 0)}`;
  }
  if (verdict.verdict === "needs_owner") return "Needs your decision";
  return verdict.reason;
}

function gradeWords(input: GradeInput): string {
  const result = grade(input);
  return `${result.grade}: ${result.reason}`;
}

function row(id: string, area: string, input: string, expected: string, actual: string): BriefRow {
  return { id, area, input, expected, actual, pass: actual === expected };
}

function ageingActual(): string {
  const today = "2026-11-02";
  const open = (id: string, dueDate: string, totalPaise: number): BookInvoice => ({
    $id: id,
    customerId: "c1",
    number: id,
    issueDate: dueDate,
    dueDate,
    totalPaise,
    paidPaise: 0,
    status: "sent",
    ladderStage: 0,
    pausedUntil: null,
    pauseReason: null,
  });
  const book = todayBook({
    today,
    openingCashPaise: 0,
    customers: [{ $id: "c1", name: "Alpha Stores", consentCalls: false }],
    invoices: [
      open("a", "2026-10-20", 1_000_000),
      open("b", "2026-09-20", 2_000_000),
      open("c", "2026-08-20", 3_000_000),
      open("d", "2026-07-01", 4_000_000),
    ],
    promises: [],
    events: [],
    bankCredits: [],
    cashItems: [],
  });
  const buckets = book.ageing.map((bucket) => `${bucket.label} ${formatInr(bucket.amountPaise)}`).join(", ");
  return `${buckets}, total ${formatInr(book.totals.receivablesPaise)}`;
}

/** Ladder, matcher, Plan rule, Grade and Ageing, in the shape /proof renders. */
export function runDomainCases(): BriefRow[] {
  const paused = nextAction({
    invoice: { ...ladderInvoice, ladderStage: 2 },
    promises: [{ status: "approved", instalments: [{ amountPaise: 11_800_000, date: "2026-11-20" }] }],
    today: "2026-11-18",
    autoSendStages: [1, 2],
  });
  const resumed = nextAction({
    invoice: { ...ladderInvoice, ladderStage: 3 },
    promises: [{ status: "approved", instalments: [{ amountPaise: 11_800_000, date: "2026-11-24" }] }],
    today: "2026-11-25",
    autoSendStages: [1, 2],
  });
  const letter = nextAction({
    invoice: { ...ladderInvoice, ladderStage: 4 },
    promises: [],
    today: "2026-12-01",
    autoSendStages: [1, 2, 3, 4, 5, 6],
  });
  const day = ladderDay({
    invoices: [
      { ...ladderInvoice, $id: "i2", dueDate: "2026-11-10", ladderStage: 1 },
      { ...ladderInvoice, ladderStage: 1, dueDate: "2026-11-09" },
    ],
    promises: [],
    today: "2026-11-10",
    autoSendStages: [1, 2],
    sentToday: [],
  });
  const offer = (...instalments: { amountPaise: number; date: string | null }[]) =>
    planRule.evaluate(DEFAULT_PLAN_RULE, { owedPaise: 11_800_000, today: "2026-11-02", instalments });
  const capped = day
    .map((step) => {
      const what = step.send === "auto" ? "sends" : step.send === "capped" ? "waits until tomorrow" : "is for you to send";
      return `${step.invoiceId} ${what}`;
    })
    .join("; ");

  return [
    row(
      "ladder-pause",
      "Ladder",
      "₹1,18,000 due 10 Nov, a Promise of the full amount by 20 Nov, today 18 Nov",
      "paused",
      ladderWords(paused),
    ),
    row(
      "ladder-resume",
      "Ladder",
      "Promise of ₹1,18,000 by 24 Nov, nothing paid, today 25 Nov",
      "Reminder call, for you to send",
      ladderWords(resumed),
    ),
    row(
      "ladder-letter",
      "Ladder",
      "Every stage switched on, and the Payment Demand Letter is the next stage",
      "Payment Demand Letter, for you to send",
      ladderWords(letter),
    ),
    row(
      "ladder-one-a-day",
      "Ladder",
      "Two Invoices for one Customer, both due a reminder on 10 Nov",
      "i1 sends; i2 waits until tomorrow",
      capped,
    ),
    ...matcherBrief(),
    row(
      "plan-accept",
      "Plan rule",
      "₹1,18,000 owed. ₹60,000 by Fri 6 Nov and ₹58,000 by Wed 2 Dec",
      "accept",
      planWords(offer({ amountPaise: 6_000_000, date: "2026-11-06" }, { amountPaise: 5_800_000, date: "2026-12-02" })),
    ),
    row(
      "plan-counter",
      "Plan rule",
      "₹40,000 by Fri 6 Nov and ₹78,000 by Wed 2 Dec",
      "counter, first instalment ₹59,000",
      planWords(offer({ amountPaise: 4_000_000, date: "2026-11-06" }, { amountPaise: 7_800_000, date: "2026-12-02" })),
    ),
    row(
      "plan-owner",
      "Plan rule",
      "₹60,000 by Thu 12 Nov and ₹58,000 by Sun 20 Dec, outside the Owner's dates",
      "Needs your decision",
      planWords(offer({ amountPaise: 6_000_000, date: "2026-11-12" }, { amountPaise: 5_800_000, date: "2026-12-20" })),
    ),
    row(
      "plan-reject",
      "Plan rule",
      "₹60,000 by Fri 6 Nov, and a second instalment with no date",
      "Not recorded: every instalment needs a date (YYYY-MM-DD). Ask for the missing date and check the Plan again.",
      planWords(offer({ amountPaise: 6_000_000, date: "2026-11-06" }, { amountPaise: 5_800_000, date: null })),
    ),
    row(
      "grade-a",
      "Grade",
      "Pays 7 days late, no Dispute in the last 6 months",
      "A: usually pays 7 days late",
      gradeWords({ today: "2026-11-02", paidDaysLate: [7], openDueDates: [], ...noDisputesOrBrokenPromises }),
    ),
    row(
      "grade-b",
      "Grade",
      "Paid 14 days late and 10 days late, one Invoice due 25 Sep 2026 still open on 2 Nov",
      "B: usually pays 12 days late; this one is 38 days late",
      gradeWords({ today: "2026-11-02", paidDaysLate: [14, 10], openDueDates: ["2026-09-25"], ...noDisputesOrBrokenPromises }),
    ),
    row(
      "grade-c",
      "Grade",
      "Pays 31 days late on average",
      "C: usually pays 31 days late",
      gradeWords({ today: "2026-11-02", paidDaysLate: [31], openDueDates: [], ...noDisputesOrBrokenPromises }),
    ),
    row(
      "ageing-sum",
      "Ageing",
      "Four open Invoices on 2 Nov 2026, one in each bucket: ₹10,000, ₹20,000, ₹30,000 and ₹40,000",
      "0–30 ₹10,000, 31–60 ₹20,000, 61–90 ₹30,000, 90+ ₹40,000, total ₹1,00,000",
      ageingActual(),
    ),
  ];
}
