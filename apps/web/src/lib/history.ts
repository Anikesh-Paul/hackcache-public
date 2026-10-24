// A stored event in the Owner's language. The server writes each event's
// summary once, in English; the other languages word it again from the event's
// type and data. A type this does not know keeps its stored sentence.
import type { EventRow, PromiseRow } from "@tagada/appwrite";
import { formatInr } from "@tagada/money";
import { reminderName, type Copy } from "../i18n/index.ts";

type Payload = {
  totalPaise?: unknown;
  amountPaise?: unknown;
  stage?: unknown;
  promiseId?: unknown;
  channel?: unknown;
  email?: unknown;
  reason?: unknown;
  /** A payment recorded by hand: cash, cheque, upi or bank_transfer, and the day it came. */
  mode?: unknown;
  date?: unknown;
  fromTotalPaise?: unknown;
  dueDate?: unknown;
};

function payloadOf(event: EventRow): Payload {
  if (!event.payload) return {};
  try {
    const parsed = JSON.parse(event.payload) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Payload) : {};
  } catch {
    return {};
  }
}

const money = (value: unknown) => (typeof value === "number" && Number.isSafeInteger(value) ? formatInr(value) : null);

/** What the Customer said: the payload's reason, or for older events the quote in the stored sentence. */
function reasonOf(p: Payload, summary: string): string | null {
  return typeof p.reason === "string" ? p.reason : (/"([^"]+)"/.exec(summary)?.[1] ?? null);
}

/** Sent by email: the payload's channel, or for older events the stored sentence. */
function byEmail(p: Payload, summary: string): boolean {
  if (typeof p.channel === "string") return p.channel === "email";
  return p.email !== undefined || /by email/.test(summary);
}

/** The Promise's instalments in words, or null when the stored JSON cannot be read. */
function planOf(t: Copy, promise: PromiseRow): string | null {
  try {
    const instalments = JSON.parse(promise.instalments) as unknown;
    return Array.isArray(instalments) ? t.call.plan(instalments as { amountPaise: number; date: string }[]) : null;
  } catch {
    return null;
  }
}

export function eventText(t: Copy, event: EventRow, promises: readonly PromiseRow[]): string {
  if (t.lang === "en") return event.summary;
  const p = payloadOf(event);
  const h = t.history;
  const promise = typeof p.promiseId === "string" ? promises.find((row) => row.$id === p.promiseId) : undefined;
  const plan = promise ? planOf(t, promise) : null;
  switch (event.type) {
    case "sent":
      return h.sent(money(p.totalPaise));
    case "reminder": {
      const stage = typeof p.stage === "number" ? reminderName(t, p.stage) : t.ladder.reminder;
      return h.reminder(stage, byEmail(p, event.summary));
    }
    case "payment":
      return typeof p.mode === "string" && p.mode in t.invoice.payModes
        ? h.paymentByHand(
            money(p.amountPaise),
            t.invoice.payModes[p.mode as keyof typeof t.invoice.payModes],
            typeof p.date === "string" ? t.date(p.date, { weekday: false }) : null,
          )
        : h.payment(money(p.amountPaise));
    case "cancelled":
      return h.cancelled(reasonOf(p, event.summary));
    case "edited":
      return h.edited(money(p.fromTotalPaise), money(p.totalPaise), typeof p.dueDate === "string" ? t.date(p.dueDate, { weekday: false }) : null);
    case "advance":
      return h.advance(money(p.amountPaise));
    case "paid_claim":
      return h.paidClaim;
    case "proof_uploaded":
      return h.proofUploaded;
    case "proof_matched":
      return h.proofMatched;
    case "talk_requested":
      return h.talkRequested;
    case "plan_accepted":
      return h.planAccepted(plan);
    case "plan_requested":
      return h.planRequested(plan);
    case "plan_approved":
      return h.planApproved(plan);
    case "plan_approval_undone":
      return h.planUndone(plan);
    case "plan_declined":
      return h.planDeclined(plan);
    case "promise":
      return h.promise;
    case "promise_broken":
      return h.promiseBroken;
    case "dispute":
      return h.dispute(reasonOf(p, event.summary));
    case "consent":
      return h.consent;
    case "link_opened":
      return h.linkOpened;
    case "call":
      return h.call;
    default:
      return event.summary;
  }
}
