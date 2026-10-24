import { useMemo } from "react";
import type { CallRow, EventRow } from "@tagada/appwrite";
import { impact, type Impact, type ImpactEvent, type ImpactPromise } from "@tagada/domain";
import { callCredits } from "@tagada/money";
import { DEMO_TODAY } from "@tagada/seed";
import { istDay } from "./pricing.ts";
import { usePaymentHistory, useWorkspaceRows, useWorld } from "./world.tsx";

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

export type ImpactState = { status: "loading" } | { status: "failed" } | { status: "ready"; impact: Impact };

/** What Tagada changed since the story started, from the loaded world, its events and its calls. */
export function useImpact(): ImpactState {
  const world = useWorld();
  const events = usePaymentHistory();
  const calls = useWorkspaceRows<CallRow>("calls");

  return useMemo((): ImpactState => {
    if (events === "failed") return { status: "failed" };
    if (events === "loading" || calls === null) return { status: "loading" };
    // Without the call rows, a call with no credit count is priced at nothing rather than holding the numbers back.
    const durations = new Map(Array.isArray(calls) ? calls.map((c) => [c.$id, c.durationS]) : []);
    const promises: ImpactPromise[] = world.promises.flatMap((p) => {
      try {
        return [{ $id: p.$id, invoiceId: p.invoiceId, status: p.status, instalments: JSON.parse(p.instalments) }];
      } catch {
        return [];
      }
    });
    return {
      status: "ready",
      impact: impact({
        today: world.workspace.today,
        // Tagada starts chasing on the day the story starts.
        since: DEMO_TODAY,
        customers: [...world.customers.values()],
        invoices: world.invoices,
        events: events.map((e) => impactEventOf(e, durations)),
        promises,
      }),
    };
  }, [world, events, calls]);
}
