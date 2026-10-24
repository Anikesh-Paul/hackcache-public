import { LADDER_STAGE_DAYS, addDays, differencePaise, sumPaise } from "@tagada/money";
import type { InvoiceFacts, InvoiceStanding, PromiseFacts } from "./invoice.ts";

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

/** A stage's name, or "Reminder" for a number outside the Ladder. */
export function stageName(stage: number): string {
  return LADDER_STAGES.find((s) => s.stage === stage)?.name ?? "Reminder";
}

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

/** The stages the daily run may send on its own, each behind a Settings switch: the three messages. */
export const AUTO_SEND_SWITCHES = [1, 2, 3] as const;

/** On until the Owner says otherwise: the friendly heads-up and the due-date reminder. */
export const DEFAULT_AUTO_SEND = [1, 2] as const;

/** The last stage the Ladder catches a late Invoice up to without the Owner. */
const LAST_MESSAGE_STAGE = 3;

export type LadderInvoice = InvoiceFacts & { $id: string; customerId: string };

export type NextAction =
  | { kind: "wait"; why: "paid" | "cancelled" | "disputed" | "paused" | "done" }
  | { kind: "wait"; why: "not_yet"; on: string }
  /** `auto`: the daily run sends it. `owner`: it waits for the Owner to send, call or print. */
  | { kind: "act"; stage: number; send: "auto" | "owner"; amountPaise: number };

/**
 * An agreed Promise or Plan is broken once a day it named has passed and the
 * Invoice still owes more than the instalments yet to come.
 */
export function promiseBroken(promise: PromiseFacts, invoice: InvoiceFacts, today: string): boolean {
  if (promise.status !== "approved") return false;
  if (!promise.instalments.some((i) => i.date < today)) return false;
  const toCome = sumPaise(promise.instalments.filter((i) => i.date >= today).map((i) => i.amountPaise));
  return differencePaise(invoice.totalPaise, invoice.paidPaise) > toCome;
}

/**
 * What the Ladder wants for one Invoice on the Demo date `today`. Stages are
 * taken in order, each once, on whole IST days from the due date; an Invoice
 * found late is caught up to the overdue reminder, never past a stage the
 * Owner takes. The call, the Payment Demand Letter and the ODR case file are
 * always the Owner's to send.
 */
export function nextAction(input: {
  invoice: InvoiceFacts;
  promises: readonly PromiseFacts[];
  today: string;
  autoSendStages: readonly number[];
  stageDays?: readonly number[];
}): NextAction {
  const { invoice, promises, today, autoSendStages, stageDays = LADDER_STAGE_DAYS } = input;
  const owed = differencePaise(invoice.totalPaise, invoice.paidPaise);
  if (invoice.status === "cancelled") return { kind: "wait", why: "cancelled" };
  if (invoice.status === "paid" || owed <= 0) return { kind: "wait", why: "paid" };
  if (invoice.status === "disputed" || invoice.pauseReason === "dispute") return { kind: "wait", why: "disputed" };
  const running = promises.some(
    (p) => p.status === "needs_owner" || (p.status === "approved" && !promiseBroken(p, invoice, today)),
  );
  if (running) return { kind: "wait", why: "paused" };
  if (invoice.ladderStage >= LADDER_STAGES.length) return { kind: "wait", why: "done" };

  const dueOn = (stage: number) => addDays(invoice.dueDate, stageDays[stage - 1] ?? 0);
  let stage = invoice.ladderStage + 1;
  if (today < dueOn(stage)) return { kind: "wait", why: "not_yet", on: dueOn(stage) };
  while (stage < LAST_MESSAGE_STAGE && today >= dueOn(stage + 1)) stage++;
  const switchable = (AUTO_SEND_SWITCHES as readonly number[]).includes(stage);
  const send = switchable && autoSendStages.includes(stage) ? "auto" : "owner";
  return { kind: "act", stage, send, amountPaise: owed };
}

export type LadderStep = {
  invoiceId: string;
  customerId: string;
  stage: number;
  amountPaise: number;
  /** `capped`: the Customer already has a message today, so it rolls to tomorrow. */
  send: "auto" | "owner" | "capped";
};

/**
 * Everything the Ladder wants on one IST day, oldest due date first. At most
 * one message goes to a Customer per day: `sentToday` names the Customers who
 * already had one, and every further step for them is capped; otherwise the
 * first automatic send goes and any other automatic one is capped.
 */
export function ladderDay(input: {
  invoices: readonly LadderInvoice[];
  promises: readonly (PromiseFacts & { invoiceId: string })[];
  today: string;
  autoSendStages: readonly number[];
  sentToday: readonly string[];
  stageDays?: readonly number[];
}): LadderStep[] {
  const already = new Set(input.sentToday);
  const messaged = new Set(input.sentToday);
  const steps: LadderStep[] = [];
  const oldestFirst = [...input.invoices].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.$id.localeCompare(b.$id));
  for (const invoice of oldestFirst) {
    const action = nextAction({
      invoice,
      promises: input.promises.filter((p) => p.invoiceId === invoice.$id),
      today: input.today,
      autoSendStages: input.autoSendStages,
      stageDays: input.stageDays,
    });
    if (action.kind !== "act") continue;
    let send: LadderStep["send"] = action.send;
    if (already.has(invoice.customerId)) send = "capped";
    else if (send === "auto") {
      if (messaged.has(invoice.customerId)) send = "capped";
      else messaged.add(invoice.customerId);
    }
    steps.push({ invoiceId: invoice.$id, customerId: invoice.customerId, stage: action.stage, amountPaise: action.amountPaise, send });
  }
  return steps;
}
