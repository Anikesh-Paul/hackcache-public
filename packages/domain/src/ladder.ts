import type { InvoiceFacts, InvoiceStanding } from "./invoice.ts";

/** The six Ladder stages, foot first. Owner screens show the name, never the number. */
export const LADDER_STAGES = [
  { stage: 1, name: "Friendly heads-up", how: "Email or WhatsApp, before the due date" },
  { stage: 2, name: "Due-date reminder", how: "Email or WhatsApp, on the due date" },
  { stage: 3, name: "Overdue reminder with pay link", how: "WhatsApp or email with the pay link" },
  { stage: 4, name: "Reminder call", how: "Call with AI, only with consent" },
  { stage: 5, name: "Payment Demand Letter", how: "You send it; never automatic" },
  { stage: 6, name: "ODR case file", how: "For the MSME online dispute resolution (ODR) portal" },
] as const;

export type LadderStage = (typeof LADDER_STAGES)[number];

export type Rung = LadderStage & { state: "climbed" | "today" | "next" };

/**
 * The Ladder as drawn: stages already taken are climbed; the next one is
 * today's rung while the Invoice is overdue and nothing pauses it.
 */
export function ladderRungs(invoice: InvoiceFacts, standing: InvoiceStanding): Rung[] {
  const climbing = standing.state === "overdue" && !invoice.pauseReason;
  return LADDER_STAGES.map((stage) => ({
    ...stage,
    state:
      stage.stage <= invoice.ladderStage
        ? "climbed"
        : climbing && stage.stage === invoice.ladderStage + 1
          ? "today"
          : "next",
  }));
}
