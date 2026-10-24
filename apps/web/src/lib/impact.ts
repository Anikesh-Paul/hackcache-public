import { useMemo } from "react";
import type { CallRow } from "@tagada/appwrite";
import { impact, type Impact, type ImpactPromise } from "@tagada/domain";
import { DEMO_TODAY } from "@tagada/seed";
import { impactEventOf } from "./impact-events.ts";
import { usePaymentHistory, useWorkspaceRows, useWorld } from "./world.tsx";

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
