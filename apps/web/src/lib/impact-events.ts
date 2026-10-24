// A stored event as the impact numbers read it. Pure, so it is tested without the world.
import type { EventRow } from "@tagada/appwrite";
import type { ImpactEvent } from "@tagada/domain";
import { callCredits } from "@tagada/money";
import { istDay } from "./pricing.ts";

const whole = (value: unknown) => (typeof value === "number" && Number.isSafeInteger(value) ? value : undefined);
const word = (value: unknown) => (typeof value === "string" ? value : undefined);

/**
 * A stored event as the impact numbers read it. A call closed without
 * ElevenLabs' credit count is priced by its duration, as the AI calls tile does.
 */
export function impactEventOf(event: EventRow, durations: ReadonlyMap<string, number | null>): ImpactEvent {
  let p: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(event.payload ?? "null") as unknown;
    if (typeof parsed === "object" && parsed !== null) p = parsed as Record<string, unknown>;
  } catch {
    // An unreadable payload still counts as its type.
  }
  const callId = word(p.callId);
  const out: ImpactEvent = { invoiceId: event.invoiceId, type: event.type, actor: event.actor, date: istDay(event.at) };
  const amountPaise = whole(p.amountPaise);
  const tdsPaise = whole(p.tdsPaise);
  const channel = word(p.channel);
  const promiseId = word(p.promiseId);
  if (amountPaise !== undefined) out.amountPaise = amountPaise;
  if (tdsPaise !== undefined) out.tdsPaise = tdsPaise;
  if (channel !== undefined) out.channel = channel;
  if (promiseId !== undefined) out.promiseId = promiseId;
  if (callId !== undefined) out.callId = callId;
  if ("credits" in p) {
    const duration = callId ? durations.get(callId) : null;
    out.credits = whole(p.credits) ?? (typeof duration === "number" ? callCredits(duration) : null);
  }
  return out;
}
