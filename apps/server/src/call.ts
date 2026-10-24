// Call with AI on the server (build plan §4, §5): the private agent's session,
// what a call may record, the Owner's decision on it, and the transcript from
// the signed webhook. Every value the browser sends is checked again here.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { CallSession, EventActor, InboxKind } from "@tagada/appwrite";
import {
  DEMO_CLOCK,
  callCalendar,
  callDay,
  callGuard,
  checkOutcome,
  planInWords,
  planRule,
  spokenName,
  stripTags,
  type CallBlock,
  type CallContext,
  type CallOutcome,
  type Instalment,
  type PlanRule,
} from "@tagada/domain";
import { callCostPaise, callCredits, formatDate, formatInr, hindiDate, hindiRupees } from "@tagada/money";
import type { OwnedRow, StoredRow, WorldStore } from "./demo.ts";
import { newId, open, owner, record, slipOf, stamp, type Book } from "./pay.ts";

/** The private ElevenLabs agent: one WebRTC conversation token per call. */
export type Agent = { token(): Promise<{ token: string; conversationId: string | null }> };

/** Hindi transcript lines in English, one for one. */
export type Gloss = { english(lines: readonly string[]): Promise<string[]> };

export type CallLimits = { perWorkspace: number; perDay: number };

export const CALL_LIMITS: CallLimits = { perWorkspace: 5, perDay: 60 };

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const whole = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;

function contextOf(book: Book): CallContext & { disputed: boolean } {
  const slip = slipOf(book);
  return { rule: slip.rule, owedPaise: slip.invoice.balancePaise, today: slip.today, disputed: slip.state === "disputed" };
}

/** Consent, calling hours and something still owed, asked before a session and again before an outcome is kept. */
function guardOf(book: Book, ctx: ReturnType<typeof contextOf>) {
  return callGuard({
    customerName: text(book.customer?.name) ?? "This Customer",
    consentCalls: book.customer?.consentCalls === true,
    consentAt: text(book.customer?.consentAt),
    clock: text(book.workspace.clock) ?? DEMO_CLOCK,
    balancePaise: ctx.owedPaise,
    disputed: ctx.disputed,
  });
}

/** Everything the agent is told, from the database. Strings, so the webhook can compare them as sent. */
function variablesFor(book: Book, ctx: CallContext, callId: string): Record<string, string> {
  const { workspace, invoice, customer } = book;
  const slip = slipOf(book);
  const rule: PlanRule = ctx.rule;
  return {
    business_name: text(workspace.businessName) ?? "",
    customer_name: spokenName(text(customer?.name) ?? ""),
    customer_gender: text(customer?.gender) ?? "neutral",
    invoice_no: text(invoice.number) ?? "",
    amount_words: hindiRupees(ctx.owedPaise),
    days_overdue: String(slip.invoice.daysLate),
    due_date_words: hindiDate(text(invoice.dueDate) ?? ""),
    today: callDay(ctx.today),
    calendar: callCalendar(ctx.today),
    rule_min_first_pct: String(rule.minFirstPct),
    rule_first_within_days: String(rule.firstWithinDays),
    rule_rest_within_days: String(rule.restWithinDays),
    invoice_id: invoice.$id,
    workspace_id: workspace.$id,
    call_id: callId,
  };
}

export type SessionResult =
  | { ok: true; session: CallSession }
  | {
      ok: false;
      status: 403 | 404 | 429 | 503;
      error: CallBlock | "not_found" | "limit_reached" | "daily_cap" | "call_unavailable";
      message: string;
    };

/** Counts sessions per IST day across every world, in this process: the cap on the voice credits. */
export function dailyCounter(now: () => number) {
  let day = "";
  let count = 0;
  const today = () => new Date(now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return {
    used() {
      if (today() !== day) [day, count] = [today(), 0];
      return count;
    },
    add() {
      this.used();
      count++;
    },
  };
}

/**
 * A signed session for one call: consent, calling hours on the Demo date
 * clock and both caps are checked before ElevenLabs is asked for anything.
 */
export async function startCall(
  deps: { worlds: WorldStore; agent: Agent | null; limits: CallLimits; daily: ReturnType<typeof dailyCounter> },
  workspaceId: string,
  invoiceId: string,
): Promise<SessionResult> {
  const [book, calls] = await Promise.all([open(deps.worlds, { workspaceId, invoiceId }), deps.worlds.list("calls", workspaceId)]);
  if (!book) return { ok: false, status: 404, error: "not_found", message: "There is no such Invoice in this Demo world." };
  const ctx = contextOf(book);
  const guard = guardOf(book, ctx);
  if (!guard.ok) return { ok: false, status: 403, error: guard.block, message: guard.message };
  // The seeded transcript (conversationId seedgupta…) is for the case file. It is not a call the Owner placed.
  const placed = calls.filter((call) => !String(call.conversationId ?? "").startsWith("seedgupta"));
  if (placed.length >= deps.limits.perWorkspace) {
    return {
      ok: false,
      status: 429,
      error: "limit_reached",
      message: `This Demo world has used its ${deps.limits.perWorkspace} calls. Read an earlier call's transcript on the Invoice.`,
    };
  }
  if (deps.daily.used() >= deps.limits.perDay) {
    return { ok: false, status: 429, error: "daily_cap", message: "Today's calls are used up for everyone. Try again tomorrow." };
  }
  if (!deps.agent) return { ok: false, status: 503, error: "call_unavailable", message: "Calls are not set up on this server." };

  const { token, conversationId } = await deps.agent.token();
  deps.daily.add();
  const callId = newId("k");
  const dynamicVariables = variablesFor(book, ctx, callId);
  const row: OwnedRow = {
    $id: callId,
    workspaceId,
    $permissions: owner(book).permissions,
    invoiceId,
    conversationId,
    startedAt: stamp(ctx.today),
    durationS: null,
    outcome: null,
    transcript: JSON.stringify({ issued: dynamicVariables }),
    consentShown: true,
  };
  await deps.worlds.write({ calls: [row] });
  return {
    ok: true,
    session: { conversationToken: token, callId, dynamicVariables, context: { rule: ctx.rule, owedPaise: ctx.owedPaise, today: ctx.today } },
  };
}

const planWords = planInWords;

export type OutcomeResult =
  | { ok: true; outcome: CallOutcome["kind"]; promiseId: string | null }
  | { ok: false; status: 400 | 409; error: string; say: string };

/** What `record_outcome` reports. The call and its Invoice come from the database, never from the browser. */
export async function recordOutcome(worlds: WorldStore, workspaceId: string, body: unknown): Promise<OutcomeResult> {
  const input = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const callId = text(input.callId) ?? "";
  const [call] = callId ? await worlds.list("calls", workspaceId, { $id: callId }) : [];
  if (!call) {
    return { ok: false, status: 409, error: "unknown_call", say: "error: not recorded. This call was not started by Tagada." };
  }
  if (call.invoiceId !== input.invoiceId) {
    return { ok: false, status: 409, error: "tampered", say: "error: not recorded. This call is about a different Invoice." };
  }
  if (call.outcome) {
    return {
      ok: false,
      status: 409,
      error: "already_recorded",
      say: "error: already recorded. Say one short goodbye and call end_call.",
    };
  }
  const book = await open(worlds, { workspaceId, invoiceId: String(call.invoiceId) });
  if (!book) return { ok: false, status: 409, error: "unknown_call", say: "error: not recorded. The Invoice is gone." };
  const ctx = contextOf(book);
  const guard = guardOf(book, ctx);
  if (!guard.ok) {
    return { ok: false, status: 409, error: guard.block, say: `error: not recorded. ${guard.message} Say goodbye and call end_call.` };
  }
  const checked = checkOutcome(ctx, input.args);
  if (!checked.ok) return { ok: false, status: 400, error: "invalid_outcome", say: checked.say };

  const promiseId = await apply(worlds, book, callId, checked.outcome);
  await worlds.update("calls", callId, { outcome: checked.outcome.kind });
  return { ok: true, outcome: checked.outcome.kind, promiseId };
}

/** Writes what the call agreed or learnt: a Promise or Plan for the Owner, a claim, a Dispute or a note. */
async function apply(worlds: WorldStore, book: Book, callId: string, outcome: CallOutcome): Promise<string | null> {
  const note = (type: string, summary: string, inbox: InboxKind | null, extra?: Record<string, OwnedRow[]>, payload?: unknown) =>
    record(worlds, book, { type, actor: "ai" satisfies EventActor, summary, payload: { callId, ...(payload ?? {}) } }, inbox, extra);
  const said = (notes: string | null) => (notes ? ` They said: "${notes}".` : "");

  switch (outcome.kind) {
    case "promise":
    case "plan":
    case "plan_needs_owner": {
      const promise: OwnedRow = {
        $id: newId("p"),
        workspaceId: book.workspace.$id,
        $permissions: owner(book).permissions,
        invoiceId: book.invoice.$id,
        source: "call",
        instalments: JSON.stringify(outcome.instalments),
        // Only the Owner's Approve makes it count: it pauses the Ladder and fills the forecast.
        status: "needs_owner",
        transcriptRef: callId,
      };
      const words = planWords(outcome.instalments);
      const [type, summary, inbox] =
        outcome.kind === "plan"
          ? (["call_plan", `Plan agreed on the call: ${words}. Inside your rule; approve it to pause the Ladder.`, "plan_accepted"] as const)
          : outcome.kind === "promise"
            ? (["call_promise", `Promised on the call: ${words}. Approve it to pause the Ladder.`, "needs_decision"] as const)
            : ([
                "call_offer",
                `Offered on the call: ${words}. ${outcome.reasons.join(" ")} It needs your decision.`,
                "needs_decision",
              ] as const);
      await note(type, summary + said(outcome.notes), inbox, { promises: [promise] }, { promiseId: promise.$id });
      return promise.$id;
    }
    case "already_paid":
      await note(
        "paid_claim",
        `Said on the call that the bill is already paid${outcome.reference ? ` (reference ${outcome.reference})` : ""}. ` +
          "The bank statement will show it.",
        "paid_claim",
      );
      return null;
    case "dispute":
      await Promise.all([
        worlds.update("invoices", book.invoice.$id, { status: "disputed", pauseReason: "dispute", pausedUntil: null }),
        note("dispute", `Raised a Dispute on the call: "${outcome.notes}". The Ladder is paused until you resolve it.`, "dispute"),
      ]);
      return null;
    case "callback":
      await note(
        "call",
        `Asked to be called back${outcome.date ? ` on ${formatDate(outcome.date)}` : ""}.${said(outcome.notes)}`,
        null,
      );
      return null;
    case "refused":
      await note("call", `Did not commit to a date on the call. The Ladder carries on.${said(outcome.notes)}`, null);
      return null;
  }
}

export const DECISIONS = ["approve", "decline", "counter", "undo"] as const;
type Decision = (typeof DECISIONS)[number];

export type DecideResult =
  | { ok: true; status: "approved" | "needs_owner" | "declined"; counter: Instalment[] | null }
  | { ok: false; status: 400 | 404 | 409; error: string };

/** The Owner's Approve, Decline, Counter, or Undo after Approve, on a Promise or Plan from a call. */
export async function decide(worlds: WorldStore, workspaceId: string, promiseId: string, body: unknown): Promise<DecideResult> {
  const action = (typeof body === "object" && body !== null ? (body as Record<string, unknown>).action : null) as Decision;
  if (!DECISIONS.includes(action)) return { ok: false, status: 400, error: "invalid_action" };
  const [promise] = await worlds.list("promises", workspaceId, { $id: promiseId });
  if (!promise) return { ok: false, status: 404, error: "not_found" };
  const book = await open(worlds, { workspaceId, invoiceId: String(promise.invoiceId) });
  if (!book) return { ok: false, status: 404, error: "not_found" };
  const plan = JSON.parse(text(promise.instalments) ?? "[]") as Instalment[];
  const words = planWords(plan);
  const want = action === "undo" ? "approved" : "needs_owner";
  if (promise.status !== want) return { ok: false, status: 409, error: `already_${String(promise.status)}` };
  const by = (type: string, summary: string, payload?: Record<string, unknown>) =>
    record(worlds, book, { type, actor: "owner", summary, payload: { promiseId, ...payload } }, null);

  if (action === "approve") {
    const before = { pauseReason: text(book.invoice.pauseReason), pausedUntil: text(book.invoice.pausedUntil) };
    await Promise.all([
      worlds.update("promises", promiseId, { status: "approved" }),
      worlds.update("invoices", book.invoice.$id, {
        pauseReason: plan.length > 1 ? "plan" : "promise",
        pausedUntil: plan[plan.length - 1]?.date ?? null,
      }),
      by("plan_approved", `You approved ${words}. The Ladder is paused and the pay link shows it.`, { before }),
    ]);
    return { ok: true, status: "approved", counter: null };
  }
  if (action === "undo") {
    const approval = latest(book.events, "plan_approved", promiseId);
    const before = (approval?.before ?? {}) as { pauseReason?: string | null; pausedUntil?: string | null };
    await Promise.all([
      worlds.update("promises", promiseId, { status: "needs_owner" }),
      worlds.update("invoices", book.invoice.$id, {
        pauseReason: before.pauseReason ?? null,
        pausedUntil: before.pausedUntil ?? null,
      }),
      by("plan_approval_undone", `You undid the approval of ${words}. It waits for your decision again.`),
    ]);
    return { ok: true, status: "needs_owner", counter: null };
  }
  if (action === "decline") {
    await Promise.all([
      worlds.update("promises", promiseId, { status: "declined" }),
      by("plan_declined", `You declined ${words}. The Ladder carries on.`),
    ]);
    return { ok: true, status: "declined", counter: null };
  }
  const ctx = contextOf(book);
  const counter = planRule.choices(ctx.rule, { owedPaise: ctx.owedPaise, today: ctx.today })[0] ?? null;
  await Promise.all([
    worlds.update("promises", promiseId, { status: "declined" }),
    by(
      "plan_countered",
      counter
        ? `You countered ${words} with ${planWords(counter)}. The pay link offers it.`
        : `You declined ${words}. The pay link offers Plans inside your rule.`,
      { counter },
    ),
  ]);
  return { ok: true, status: "declined", counter };
}

function latest(events: readonly StoredRow[], type: string, promiseId: string): Record<string, unknown> | null {
  const found = events
    .filter((e) => e.type === type)
    .map((e) => JSON.parse(text(e.payload) ?? "{}") as Record<string, unknown>)
    .filter((p) => p.promiseId === promiseId);
  return found[found.length - 1] ?? null;
}

const TOLERANCE_MS = 30 * 60 * 1000;

/** `elevenlabs-signature: t=<unix>,v0=<hex>`: HMAC-SHA256 of `${t}.${rawBody}`, at most 30 minutes old. */
export function verifySignature(secret: string, header: string, rawBody: string, nowMs: number): boolean {
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v0").map(([, v]) => v ?? "");
  if (!t || !/^\d+$/.test(t) || sigs.length === 0) return false;
  if (Math.abs(nowMs - Number(t) * 1000) > TOLERANCE_MS) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"));
  return sigs.some((s) => {
    const got = Buffer.from(s);
    return got.length === want.length && timingSafeEqual(got, want);
  });
}

export type WebhookResult = { status: 200 | 401; body: Record<string, unknown> };

type Turn = { role: "agent" | "user"; message: string; t: number };

/** The post-call transcript: kept on its call row, once, and only when the call is the one the server set up. */
export async function receiveTranscript(
  worlds: WorldStore,
  secret: string,
  header: string,
  rawBody: string,
  nowMs: number,
): Promise<WebhookResult> {
  if (!verifySignature(secret, header, rawBody, nowMs)) return { status: 401, body: { error: "invalid_signature" } };
  let event: { type?: unknown; data?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return { status: 200, body: { ignored: "invalid_body" } };
  }
  if (event.type !== "post_call_transcription" || !event.data) return { status: 200, body: { ignored: String(event.type) } };
  const data = event.data;
  const init = (data.conversation_initiation_client_data ?? {}) as { dynamic_variables?: Record<string, unknown> };
  const vars = init.dynamic_variables ?? {};
  const workspaceId = text(vars.workspace_id);
  const callId = text(vars.call_id);
  const conversationId = text(data.conversation_id);
  if (!workspaceId || !callId || !conversationId) return { status: 200, body: { ignored: "unknown_call" } };
  const [call] = await worlds.list("calls", workspaceId, { $id: callId });
  if (!call) return { status: 200, body: { ignored: "unknown_call" } };
  const kept = JSON.parse(text(call.transcript) ?? "{}") as { issued?: Record<string, string>; turns?: Turn[]; tampered?: string[] };
  if (call.conversationId === conversationId && (kept.turns || kept.tampered)) return { status: 200, body: { duplicate: true } };

  const issued = kept.issued ?? {};
  const tampered = Object.keys(issued).filter((k) => String(vars[k] ?? "") !== issued[k]);
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const durationS = whole(metadata.call_duration_secs);
  if (tampered.length > 0) {
    await worlds.update("calls", callId, { conversationId, durationS, transcript: JSON.stringify({ issued, tampered }) });
    return { status: 200, body: { ignored: "tampered" } };
  }

  const turns: Turn[] = (Array.isArray(data.transcript) ? data.transcript : []).flatMap((raw) => {
    const t = (raw ?? {}) as Record<string, unknown>;
    const message = stripTags(text(t.message) ?? "");
    const role = t.role === "user" ? "user" : t.role === "agent" ? "agent" : null;
    return message && role ? [{ role, message, t: whole(t.time_in_call_secs) ?? 0 }] : [];
  });
  const credits = whole(metadata.cost) ?? (durationS === null ? null : callCredits(durationS));
  const book = await open(worlds, { workspaceId, invoiceId: String(call.invoiceId) });
  await worlds.update("calls", callId, { conversationId, durationS, transcript: JSON.stringify({ issued, turns, credits }) });
  if (book) {
    const length = durationS === null ? "" : `, ${Math.floor(durationS / 60)} min ${durationS % 60} s`;
    const cost = credits === null ? "" : ` It cost ${formatInr(callCostPaise(credits))}.`;
    await record(
      worlds,
      book,
      {
        type: "call",
        actor: "ai",
        summary: `Call with AI${length}. The transcript is kept with this Invoice.${cost}`,
        payload: { callId, conversationId, credits },
      },
      null,
    );
  }
  return { status: 200, body: { ok: true } };
}

/** Transcript lines for the gloss: up to 20 short strings. */
export function glossLines(body: unknown): string[] | null {
  const lines = typeof body === "object" && body !== null ? (body as Record<string, unknown>).lines : null;
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 20) return null;
  if (!lines.every((l): l is string => typeof l === "string" && l.length > 0 && l.length <= 600)) return null;
  return lines;
}
