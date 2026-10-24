// A stored event in the Owner's language. The server writes each event's
// summary once, in English; the other languages word it again from the event's
// type and data. A type this does not know keeps its stored sentence.
import type { EventRow, PromiseRow } from "@tagada/appwrite";
import { formatInr } from "@tagada/money";
import type { Copy } from "../i18n/index.ts";

type Payload = { totalPaise?: unknown; amountPaise?: unknown; stage?: unknown; promiseId?: unknown; email?: unknown };

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

/** What the Customer said, when the stored sentence quotes it. */
function quoted(summary: string): string | null {
  return /"([^"]+)"/.exec(summary)?.[1] ?? null;
}

export function eventText(t: Copy, event: EventRow, promises: readonly PromiseRow[]): string {
  if (t.lang === "en") return event.summary;
  const p = payloadOf(event);
  const h = t.history;
  const promise = typeof p.promiseId === "string" ? promises.find((row) => row.$id === p.promiseId) : undefined;
  const plan = promise ? t.call.plan(JSON.parse(promise.instalments) as { amountPaise: number; date: string }[]) : null;
  switch (event.type) {
    case "sent":
      return h.sent(money(p.totalPaise));
    case "reminder": {
      const stage = typeof p.stage === "number" ? (t.ladder.reminderNames[p.stage - 1] ?? t.ladder.stages[p.stage - 1]?.name) : null;
      return h.reminder(stage ?? t.ladder.reminder, p.email !== undefined || /by email/.test(event.summary));
    }
    case "payment":
      return h.payment(money(p.amountPaise));
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
      return h.dispute(quoted(event.summary));
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
