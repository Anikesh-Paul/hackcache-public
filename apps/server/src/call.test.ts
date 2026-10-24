import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { PaySlip } from "@tagada/appwrite";
import { createApp, type CallDeps } from "./app.ts";
import { memoryFiles, memoryStore } from "./memory-store.ts";
import { payTokens } from "./pay-token.ts";

const USER = "64f0c2a91be7d3e85f10";
const WORKSPACE = `w${USER}`;
const OWNER = [`read("user:${USER}")`, `update("user:${USER}")`];
const SECRET = "wsec_test";
const AUTH = { authorization: "Bearer jwt-asha" };

let db: ReturnType<typeof memoryStore>;
let app: ReturnType<typeof createApp>;
let now: number;
let tokens: number;
let glossed: string[][];
let pending: Promise<void>[];

function build(call: Partial<CallDeps> = {}) {
  app = createApp({
    probeAppwrite: async () => {},
    demo: {
      userFromJwt: async (jwt) => (jwt === "jwt-asha" ? USER : null),
      worlds: db.store,
      later: (task) => void pending.push(task),
      tokens: payTokens("test-secret", () => now),
    },
    files: memoryFiles().files,
    voice: { speak: async () => new Uint8Array() },
    call: {
      agent: {
        async token() {
          tokens++;
          return { token: `rtc-${tokens}`, conversationId: null };
        },
      },
      webhookSecret: SECRET,
      gloss: {
        async english(lines) {
          glossed.push([...lines]);
          return lines.map((l) => `EN: ${l}`);
        },
      },
      now: () => now,
      ...call,
    },
  });
}

beforeEach(async () => {
  db = memoryStore();
  now = Date.parse("2026-10-23T10:00:00Z");
  tokens = 0;
  glossed = [];
  pending = [];
  build();
  await app.request("/api/demo/start", { method: "POST", headers: AUTH });
  while (pending.length) await pending.shift();
});

const customerId = (name: string) => db.table("customers").find((c) => c.name === name)?.$id;
const openInvoice = (name: string) => {
  const found = db.table("invoices").find((i) => i.customerId === customerId(name) && i.status !== "paid");
  if (!found) throw new Error(`no open invoice for ${name}`);
  return found;
};
const gupta = () => openInvoice("Gupta Traders");
/** The call this test just started. The seed also stores one earlier call for the case file. */
const callRow = (callId: string) => {
  const found = db.table("calls").find((row) => row.$id === callId);
  if (!found) throw new Error(`no call ${callId}`);
  return found;
};

type Session = {
  conversationToken: string;
  callId: string;
  dynamicVariables: Record<string, string>;
  context: { owedPaise: number; today: string; rule: { minFirstPct: number } };
};

const session = (invoiceId: string) => app.request(`/api/call/signed-url?invoiceId=${invoiceId}`, { headers: AUTH });
async function started(invoiceId = gupta().$id): Promise<Session> {
  const res = await session(invoiceId);
  expect(res.status).toBe(200);
  return (await res.json()) as Session;
}

const postJson = (path: string, body: unknown, headers: Record<string, string> = AUTH) =>
  app.request(path, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) });
const outcome = (callId: string, invoiceId: string, args: unknown) => postJson("/api/call/outcome", { callId, invoiceId, args });
const decide = (promiseId: string, action: string) => postJson(`/api/promises/${promiseId}/decide`, { action });

const HERO_PLAN = { outcome: "plan", amount_rupees: 60000, date: "2026-11-06", rest_date: "2026-12-02" };
const eventsOf = (invoiceId: string) => db.table("events").filter((e) => e.invoiceId === invoiceId);
const slipOf = async (token: unknown) => (await (await app.request(`/api/pay/${String(token)}`)).json()) as PaySlip;

describe("GET /api/call/signed-url", () => {
  it("gives a private session about the Invoice opened, with the agent's facts from the server", async () => {
    const s = await started();
    expect(s.conversationToken).toBe("rtc-1");
    expect(s.dynamicVariables).toMatchObject({
      business_name: "Tripura Bamboo Works",
      customer_name: "Gupta",
      customer_gender: "male",
      invoice_no: String(gupta().number),
      amount_words: "एक लाख अठारह हज़ार रुपये",
      days_overdue: "38",
      due_date_words: "शुक्रवार, पच्चीस सितंबर",
      today: "Monday 2026-11-02",
      rule_min_first_pct: "50",
      rule_first_within_days: "7",
      rule_rest_within_days: "30",
      invoice_id: gupta().$id,
      workspace_id: WORKSPACE,
      call_id: s.callId,
    });
    expect(s.dynamicVariables.calendar?.split(", ")).toHaveLength(15);
    expect(s.context).toMatchObject({ owedPaise: 11_800_000, today: "2026-11-02", rule: { minFirstPct: 50 } });
    expect(callRow(s.callId)).toMatchObject({
      invoiceId: gupta().$id,
      consentShown: true,
      outcome: null,
      $permissions: OWNER,
    });
  });

  it("needs the Owner's session", async () => {
    expect((await app.request(`/api/call/signed-url?invoiceId=${gupta().$id}`)).status).toBe(401);
    expect(tokens).toBe(0);
  });

  it("blocks a call outside 10 AM to 6 PM by the Demo date clock, before asking ElevenLabs", async () => {
    await db.store.update("workspaces", WORKSPACE, { clock: "19:05" });
    const res = await session(gupta().$id);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "outside_hours",
      message: "It is 19:05 by the Demo date clock. Calls are made only between 10 AM and 6 PM.",
    });
    expect(tokens).toBe(0);
  });

  it("blocks a Customer without consent", async () => {
    const res = await session(openInvoice("Sen Handicrafts").$id);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "no_consent" });
    expect(tokens).toBe(0);
  });

  it("stops at the per-workspace limit and the global daily cap", async () => {
    // The seeded transcript already uses one slot.
    build({ limits: { perWorkspace: db.table("calls").length + 2, perDay: 3 } });
    await started();
    await started();
    const res = await session(gupta().$id);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "limit_reached" });

    build({ limits: { perWorkspace: 10, perDay: 1 } });
    await started();
    expect((await session(gupta().$id)).status).toBe(429);
    now += 24 * 60 * 60 * 1000; // a new IST day
    expect((await session(gupta().$id)).status).toBe(200);
  });

  it("says calls are unavailable when the agent is not set up", async () => {
    build({ agent: null });
    const res = await session(gupta().$id);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "call_unavailable" });
  });
});

describe("POST /api/call/outcome and the Owner's decision", () => {
  it("runs the Gupta call: ₹40k refused with a sentence, ₹60k agreed, approved, shown on the pay link", async () => {
    const s = await started();
    const invoice = gupta();

    const low = await outcome(s.callId, invoice.$id, { ...HERO_PLAN, amount_rupees: 40000 });
    expect(low.status).toBe(400);
    expect(((await low.json()) as { say: string }).say).toMatch(/at least 59000/);
    expect(db.table("promises").filter((p) => p.source === "call")).toEqual([]);

    const res = await outcome(s.callId, invoice.$id, HERO_PLAN);
    expect(res.status).toBe(200);
    const recorded = (await res.json()) as { say: string; promiseId: string };
    expect(recorded.say).toBe("recorded");

    const promise = db.table("promises").find((p) => p.$id === recorded.promiseId);
    expect(promise).toMatchObject({ source: "call", status: "needs_owner", transcriptRef: s.callId, $permissions: OWNER });
    expect(JSON.parse(String(promise?.instalments))).toEqual([
      { amountPaise: 6_000_000, date: "2026-11-06" },
      { amountPaise: 5_800_000, date: "2026-12-02" },
    ]);
    const agreed = eventsOf(invoice.$id).find((e) => e.type === "call_plan");
    expect(agreed).toMatchObject({ actor: "ai" });
    expect(String(agreed?.summary)).toMatch(/^Plan agreed on the call: ₹60,000 by Fri 6 Nov, then ₹58,000 by Wed 2 Dec/);
    expect(db.table("inbox")).toEqual([expect.objectContaining({ kind: "plan_accepted", refId: agreed?.$id })]);
    expect(callRow(s.callId)).toMatchObject({ outcome: "plan" });

    const ok = await decide(recorded.promiseId, "approve");
    expect(ok.status).toBe(200);
    expect(db.table("promises").find((p) => p.$id === recorded.promiseId)).toMatchObject({ status: "approved" });
    expect(gupta()).toMatchObject({ pauseReason: "plan", pausedUntil: "2026-12-02" });
    expect(eventsOf(invoice.$id).find((e) => e.type === "plan_approved")).toMatchObject({ actor: "owner" });
    expect(await slipOf(invoice.payToken)).toMatchObject({
      state: "plan",
      plan: [
        { amountPaise: 6_000_000, date: "2026-11-06" },
        { amountPaise: 5_800_000, date: "2026-12-02" },
      ],
    });
  });

  it("undoes an approval: the Plan waits again and the Ladder is as it was", async () => {
    const s = await started();
    const { promiseId } = (await (await outcome(s.callId, gupta().$id, HERO_PLAN)).json()) as { promiseId: string };
    const before = { pauseReason: gupta().pauseReason ?? null, pausedUntil: gupta().pausedUntil ?? null };
    await decide(promiseId, "approve");
    const res = await decide(promiseId, "undo");
    expect(res.status).toBe(200);
    expect(db.table("promises").find((p) => p.$id === promiseId)).toMatchObject({ status: "needs_owner" });
    expect({ pauseReason: gupta().pauseReason, pausedUntil: gupta().pausedUntil }).toEqual(before);
    expect((await decide(promiseId, "undo")).status).toBe(409);
  });

  it("keeps an offer outside the rule for the Owner, who can decline or counter", async () => {
    const s = await started();
    const res = await outcome(s.callId, gupta().$id, { ...HERO_PLAN, outcome: "plan_needs_owner", amount_rupees: 40000 });
    expect(res.status).toBe(200);
    const { promiseId } = (await res.json()) as { promiseId: string };
    expect(db.table("inbox")).toEqual([expect.objectContaining({ kind: "needs_decision" })]);

    const countered = await decide(promiseId, "counter");
    expect(countered.status).toBe(200);
    expect(await countered.json()).toMatchObject({
      status: "declined",
      counter: [
        { amountPaise: 5_900_000, date: "2026-11-09" },
        { amountPaise: 5_900_000, date: "2026-12-02" },
      ],
    });
    expect(eventsOf(gupta().$id).find((e) => e.type === "plan_countered")).toMatchObject({ actor: "owner" });
    expect((await slipOf(gupta().payToken)).state).toBe("owing");
    expect((await decide(promiseId, "approve")).status).toBe(409);
  });

  it("declines an offer", async () => {
    const s = await started();
    const res = await outcome(s.callId, gupta().$id, { ...HERO_PLAN, outcome: "plan_needs_owner", amount_rupees: 40000 });
    const { promiseId } = (await res.json()) as { promiseId: string };
    expect((await decide(promiseId, "decline")).status).toBe(200);
    expect(db.table("promises").find((p) => p.$id === promiseId)).toMatchObject({ status: "declined" });
    expect((await decide(promiseId, "shrug")).status).toBe(400);
  });

  it("records a Dispute from the call and stops the Ladder", async () => {
    const s = await started();
    const res = await outcome(s.callId, gupta().$id, { outcome: "dispute", notes: "Two chairs came broken" });
    expect(res.status).toBe(200);
    expect(gupta()).toMatchObject({ status: "disputed", pauseReason: "dispute" });
    expect(db.table("inbox")).toEqual([expect.objectContaining({ kind: "dispute" })]);
  });

  it("refuses an outcome once the Invoice is disputed meanwhile", async () => {
    const s = await started();
    await postJson(`/api/invoices/${gupta().$id}/dispute`, { reason: "Wrong quantity" });
    const res = await outcome(s.callId, gupta().$id, HERO_PLAN);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "disputed" });
    expect(db.table("promises").filter((p) => p.source === "call")).toEqual([]);
  });

  it("refuses an outcome for another Invoice, an unknown call or a second outcome", async () => {
    const s = await started();
    const other = openInvoice("Das & Sons").$id;
    const swapped = await outcome(s.callId, other, HERO_PLAN);
    expect(swapped.status).toBe(409);
    expect(await swapped.json()).toMatchObject({ error: "tampered" });
    expect((await outcome("knotacall", gupta().$id, HERO_PLAN)).status).toBe(409);
    expect((await postJson("/api/call/outcome", { callId: s.callId, invoiceId: gupta().$id, args: HERO_PLAN }, {})).status).toBe(
      401,
    );

    expect((await outcome(s.callId, gupta().$id, HERO_PLAN)).status).toBe(200);
    const again = await outcome(s.callId, gupta().$id, { outcome: "refused" });
    expect(again.status).toBe(409);
    expect(((await again.json()) as { say: string }).say).toMatch(/already recorded/);
    expect(db.table("promises").filter((p) => p.source === "call")).toHaveLength(1);
  });
});

function signed(body: unknown, at = now, secret = SECRET) {
  const raw = JSON.stringify(body);
  const t = Math.floor(at / 1000);
  const v0 = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return { raw, header: `t=${t},v0=${v0}` };
}

const webhook = (raw: string, header: string) =>
  app.request("/webhooks/elevenlabs", {
    method: "POST",
    headers: { "content-type": "application/json", "elevenlabs-signature": header },
    body: raw,
  });

function transcription(s: Session, vars: Record<string, string> = s.dynamicVariables) {
  return {
    type: "post_call_transcription",
    event_timestamp: Math.floor(now / 1000),
    data: {
      agent_id: "agent_x",
      conversation_id: "conv_gupta_1",
      status: "done",
      transcript: [
        { role: "agent", message: "[polite] नमस्ते गुप्ता जी, मैं Munim, एक AI सहायक।", time_in_call_secs: 0 },
        { role: "user", message: "शुक्रवार को चालीस हज़ार दे दूँगा", time_in_call_secs: 9 },
        { role: "agent", message: "[warmly]", time_in_call_secs: 12 },
      ],
      metadata: { call_duration_secs: 134, cost: 1005 },
      conversation_initiation_client_data: { dynamic_variables: vars },
    },
  };
}

describe("POST /webhooks/elevenlabs", () => {
  it("stores the transcript on the call, without voice tags, and notes it on the Invoice", async () => {
    const s = await started();
    const { raw, header } = signed(transcription(s));
    const res = await webhook(raw, header);
    expect(res.status).toBe(200);

    const call = callRow(s.callId);
    expect(call).toMatchObject({ conversationId: "conv_gupta_1", durationS: 134 });
    expect(JSON.parse(String(call.transcript)).turns).toEqual([
      { role: "agent", message: "नमस्ते गुप्ता जी, मैं Munim, एक AI सहायक।", t: 0 },
      { role: "user", message: "शुक्रवार को चालीस हज़ार दे दूँगा", t: 9 },
    ]);
    const note = eventsOf(gupta().$id).filter((e) => e.type === "call");
    expect(note).toHaveLength(1);
    expect(note[0]).toMatchObject({ actor: "ai", $permissions: OWNER });
    expect(String(note[0]?.summary)).toMatch(/2 min 14 s/);
  });

  it("does nothing on a replay of the same conversation", async () => {
    const s = await started();
    const { raw, header } = signed(transcription(s));
    await webhook(raw, header);
    const writes = db.writes();
    const res = await webhook(raw, header);
    expect(res.status).toBe(200);
    expect(db.writes()).toBe(writes);
    expect(eventsOf(gupta().$id).filter((e) => e.type === "call")).toHaveLength(1);
  });

  it("rejects a bad or stale signature", async () => {
    const s = await started();
    const body = transcription(s);
    expect((await webhook(signed(body, now, "wrong").raw, signed(body, now, "wrong").header)).status).toBe(401);
    const stale = signed(body, now - 31 * 60 * 1000);
    expect((await webhook(stale.raw, stale.header)).status).toBe(401);
    expect((await webhook(JSON.stringify(body), "")).status).toBe(401);
    const good = signed(body);
    expect((await webhook(`${good.raw} `, good.header)).status).toBe(401);
    expect(callRow(s.callId)).toMatchObject({ conversationId: null });
  });

  it("does not keep a transcript whose call details were changed in the browser", async () => {
    const s = await started();
    const forged = { ...s.dynamicVariables, amount_words: "चालीस हज़ार रुपये" };
    const { raw, header } = signed(transcription(s, forged));
    const res = await webhook(raw, header);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: "tampered" });
    const call = callRow(s.callId);
    expect(JSON.parse(String(call.transcript)).turns).toBeUndefined();
    expect(JSON.parse(String(call.transcript)).tampered).toEqual(["amount_words"]);
  });
});

describe("POST /api/call/gloss", () => {
  it("glosses transcript lines in English for the Owner", async () => {
    const res = await postJson("/api/call/gloss", { lines: ["शुक्रवार को साठ हज़ार"] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ gloss: ["EN: शुक्रवार को साठ हज़ार"] });
    expect((await postJson("/api/call/gloss", { lines: "x" })).status).toBe(400);
    expect((await postJson("/api/call/gloss", { lines: ["x"] }, {})).status).toBe(401);
  });
});
