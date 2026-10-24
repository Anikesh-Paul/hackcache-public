import { describe, expect, it } from "vitest";
import type { EventRow } from "@tagada/appwrite";
import { impactEventOf } from "./impact.ts";

const row = (over: Partial<EventRow>): EventRow =>
  ({
    $id: "e1",
    workspaceId: "w",
    invoiceId: "i1",
    at: "2026-11-09T15:00:00.000+05:30",
    type: "payment",
    actor: "owner",
    summary: "",
    payload: null,
    ...over,
  }) as EventRow;

describe("impactEventOf", () => {
  it("reads a payment's cash and TDS, dated by its IST day", () => {
    const event = row({ at: "2026-11-08T20:00:00.000Z", payload: JSON.stringify({ amountPaise: 6_000_000, tdsPaise: 2_000 }) });
    expect(impactEventOf(event, new Map())).toEqual({
      invoiceId: "i1",
      type: "payment",
      actor: "owner",
      date: "2026-11-09",
      amountPaise: 6_000_000,
      tdsPaise: 2_000,
    });
  });

  it("prices a closed call by its duration when ElevenLabs sent no credit count", () => {
    const close = row({ type: "call", actor: "ai", payload: JSON.stringify({ callId: "k1", credits: null }) });
    // 134 s at 450 credits a minute.
    expect(impactEventOf(close, new Map([["k1", 134]]))).toMatchObject({ callId: "k1", credits: 1005 });
    expect(impactEventOf(close, new Map())).toMatchObject({ callId: "k1", credits: null });
  });

  it("keeps an event with an unreadable payload as its type", () => {
    expect(impactEventOf(row({ type: "reminder", actor: "workflow", payload: "{" }), new Map())).toEqual({
      invoiceId: "i1",
      type: "reminder",
      actor: "workflow",
      date: "2026-11-09",
    });
  });
});
