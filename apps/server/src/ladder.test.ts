import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import type { Mail, Mailer } from "./email.ts";
import { memoryFiles, memoryStore } from "./memory-store.ts";
import { payTokens } from "./pay-token.ts";

const USER = "64f0c2a91be7d3e85f10";
const WS = `w${USER}`;
const jwt = { authorization: "Bearer jwt-asha" };
const INBOX = "demo-inbox@example.com";

let db: ReturnType<typeof memoryStore>;
let app: ReturnType<typeof createApp>;
let mails: Mail[];
let refuse: (mail: Mail) => string | null;
/** Resend's answer to a key it already holds for another body. */
let repeat: (mail: Mail) => boolean;
let pending: Promise<void>[];
/** The clock pay links are signed by. */
let clock: number;

beforeEach(async () => {
  db = memoryStore();
  clock = Date.parse("2026-11-02T06:00:00Z");
  mails = [];
  refuse = () => null;
  repeat = () => false;
  pending = [];
  const mailer: Mailer = {
    async send(mail) {
      if (repeat(mail)) {
        mails.push(mail);
        return { ok: false, error: "Resend 409: This idempotency key has already been used on a request that had a different payload.", repeat: true };
      }
      const error = refuse(mail);
      if (error) return { ok: false, error };
      mails.push(mail);
      return { ok: true, id: `msg_${mails.length}` };
    },
  };
  let rows = 0;
  app = createApp({
    probeAppwrite: async () => {},
    demo: {
      userFromJwt: async (token) => (token === "jwt-asha" ? USER : null),
      worlds: db.store,
      later: (task) => void pending.push(task),
      tokens: payTokens("test-secret", () => clock),
    },
    files: memoryFiles().files,
    voice: { async speak() { return new Uint8Array(); } },
    ladder: { mailer, demoInbox: INBOX, webOrigin: "https://tagada.example", runId: () => `run${++rows}` },
  });
  await app.request("/api/demo/start", { method: "POST", headers: jwt });
  while (pending.length) await pending.shift();
});

const post = (path: string, body: unknown, headers: Record<string, string> = jwt) =>
  app.request(path, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) });

type Summary = {
  runId: string;
  demoDate: string;
  scanned: number;
  sent: number;
  skippedDuplicate: number;
  skippedInBank: number;
  retried: number;
  failed: number;
  ready: number;
};
const run = async (date: string) => {
  const res = await post("/api/ladder/run", { date });
  expect(res.status).toBe(200);
  return (await res.json()) as Summary;
};

const customerId = (name: string) => db.table("customers").find((row) => row.name === name)!.$id;
const invoicesOf = (name: string) => db.table("invoices").filter((row) => row.customerId === customerId(name));
const openOf = (name: string) => invoicesOf(name).filter((row) => row.status !== "paid");
const reminder = (invoiceId: string, stage: number) => db.table("reminders").find((r) => r.$id === `rem_${invoiceId}_s${stage}`);
const workspace = () => db.table("workspaces").find((w) => w.$id === WS)!;

describe("POST /api/ladder/run", () => {
  it("moves the Demo date and runs the Ladder for it, logging the run", async () => {
    const summary = await run("2026-11-05");
    expect(workspace().today).toBe("2026-11-05");
    expect(summary).toMatchObject({ demoDate: "2026-11-05", sent: 1, skippedDuplicate: 0, retried: 0, failed: 0 });
    expect(summary.scanned).toBeGreaterThan(0);
    const logged = db.table("workflow_runs").find((r) => r.runId === summary.runId);
    expect(logged).toMatchObject({ demoDate: "2026-11-05", sent: 1, invoicesScanned: summary.scanned });
    // Each run stands for that Demo date's 10:00 IST run, whatever the clock says.
    expect(logged?.startedAt).toBe("2026-11-05T10:00:00.000+05:30");
  });

  it("emails Saha Furniture Mart's friendly heads-up to the Demo inbox, from the business via Tagada, and keeps a copy", async () => {
    await run("2026-11-05");
    const [saha] = openOf("Saha Furniture Mart");
    expect(mails).toHaveLength(1);
    const [mail] = mails;
    expect(mail).toMatchObject({ fromName: "Tripura Bamboo Works via Tagada", to: INBOX, replyTo: "accounts@tripurabamboo.example" });
    expect(mail?.subject).toContain(saha!.number as string);
    expect(mail?.text).toContain(`https://tagada.example/pay/${saha!.payToken as string}`);
    // Resend drops a second request under the same key, so a send that died before it was noted never goes twice.
    expect(mail?.idempotencyKey).toMatch(new RegExp(`^${WS}/rem_${saha!.$id}_s1/\\d+$`));
    expect(reminder(saha!.$id, 1)).toMatchObject({ status: "sent", channel: "email", attempts: 1, providerMessageId: "msg_1", sentDate: "2026-11-05" });
    expect(saha!.ladderStage).toBe(1);
    const copy = db.table("events").find((e) => e.invoiceId === saha!.$id && e.type === "reminder" && e.actor === "workflow" && String(e.at).startsWith("2026-11-05"));
    expect(copy?.summary).toBe("Friendly heads-up sent by email");
    expect(copy?.at).toBe("2026-11-05T10:00:00.000+05:30");
    expect(JSON.parse(copy?.payload as string)).toMatchObject({ stage: 1, email: { to: INBOX, subject: mail?.subject, text: mail?.text } });
  });

  it("running twice for the same date sends nothing twice", async () => {
    await run("2026-11-05");
    const before = db.table("reminders").length;
    const again = await run("2026-11-05");
    expect(mails).toHaveLength(1);
    expect(db.table("reminders")).toHaveLength(before);
    expect(again.sent).toBe(0);
  });

  it("even when an Invoice forgot its stage, the Reminder's key stops a second email", async () => {
    await run("2026-11-05");
    const [saha] = openOf("Saha Furniture Mart");
    await db.store.update("invoices", saha!.$id, { ladderStage: 0 });
    const again = await run("2026-11-05");
    expect(mails).toHaveLength(1);
    expect(again).toMatchObject({ sent: 0, skippedDuplicate: 1 });
  });

  it("retries Paul Gift House's refused first email under the same key, then sends it", async () => {
    const summary = await run("2026-11-15");
    const paul = openOf("Paul Gift House").find((i) => i.dueDate === "2026-11-18")!;
    expect(reminder(paul.$id, 1)).toMatchObject({ status: "sent", attempts: 2 });
    expect(reminder(paul.$id, 1)?.error).toBeTruthy();
    expect(mails.filter((m) => m.subject.includes(paul.number as string))).toHaveLength(1);
    expect(summary.retried).toBe(1);
    expect(db.table("workflow_runs").find((r) => r.runId === summary.runId)?.retried).toBe(1);
  });

  it("refuses Paul Gift House's first live email only once, not one per Invoice", async () => {
    await run("2026-11-15");
    const later = await run("2026-11-18");
    const paul = openOf("Paul Gift House").find((i) => i.dueDate === "2026-11-18")!;
    expect(reminder(paul.$id, 2)).toMatchObject({ status: "sent", attempts: 1, error: null });
    expect(later.retried).toBe(0);
  });

  it("counts a send that keeps failing as failed, and the next run tries the same key again", async () => {
    refuse = () => "Resend is down";
    const first = await run("2026-11-05");
    const [saha] = openOf("Saha Furniture Mart");
    expect(first).toMatchObject({ sent: 0, failed: 1 });
    expect(reminder(saha!.$id, 1)).toMatchObject({ status: "failed", error: "Resend is down" });
    expect(saha!.ladderStage).toBe(0);
    refuse = () => null;
    const second = await run("2026-11-05");
    expect(second).toMatchObject({ sent: 1, retried: 1 });
    expect(reminder(saha!.$id, 1)).toMatchObject({ status: "sent" });
  });

  it("gives each seeding of the world its own Resend key, while the Reminder's row ID stays its idempotency key", async () => {
    await run("2026-11-05");
    const [first] = openOf("Saha Furniture Mart");
    clock += 60_000;
    await post("/api/demo/reset", {});
    while (pending.length) await pending.shift();
    await run("2026-11-05");
    const [again] = openOf("Saha Furniture Mart");
    expect(again!.$id).toBe(first!.$id);
    expect(mails).toHaveLength(2);
    // A reset world sends a new body (a new pay link); under the old key Resend would refuse it for 24 hours.
    expect(mails[1]!.text).not.toBe(mails[0]!.text);
    expect(mails[1]!.idempotencyKey).not.toBe(mails[0]!.idempotencyKey);
    for (const mail of mails) expect(mail.idempotencyKey).toMatch(new RegExp(`^${WS}/rem_${first!.$id}_s1/`));
    expect(reminder(again!.$id, 1)).toMatchObject({ status: "sent", attempts: 1, error: null });
  });

  it("records Resend's refusal of a reused key once, plainly, and does not retry it", async () => {
    repeat = (mail) => mail.subject.includes(openOf("Saha Furniture Mart")[0]!.number as string);
    const first = await run("2026-11-05");
    const [saha] = openOf("Saha Furniture Mart");
    expect(mails).toHaveLength(1);
    expect(first).toMatchObject({ sent: 0, failed: 1, retried: 0 });
    expect(reminder(saha!.$id, 1)).toMatchObject({ status: "failed", attempts: 1 });
    expect(String(reminder(saha!.$id, 1)?.error)).toMatch(/^Refused as a repeat: Resend 409/);
    const second = await run("2026-11-06");
    expect(mails).toHaveLength(1);
    expect(second.failed).toBe(0);
    expect(reminder(saha!.$id, 1)).toMatchObject({ status: "failed", attempts: 1, sentDate: "2026-11-05" });
  });

  it("sends nothing to a Customer whose money is waiting in Bank, and counts those skips", async () => {
    const inBank = ["Roy Furnishings", "Barua Stores", "Sen Handicrafts", "Hotel Gomati View", "Brahmaputra Home Stores Pvt Ltd"];
    const summaries = [await run("2026-11-02"), await run("2026-11-12"), await run("2026-11-25")];
    const runs = new Set(summaries.map((s) => s.runId));
    const waiting = new Set(inBank.flatMap((name) => openOf(name).map((i) => i.$id)));
    expect(waiting.size).toBe(6);
    expect(db.table("reminders").filter((r) => runs.has(String(r.runId)) && waiting.has(String(r.invoiceId)))).toEqual([]);
    expect(mails.some((m) => inBank.some((name) => m.text.includes(name)))).toBe(false);
    expect(summaries[0]!.skippedInBank).toBeGreaterThan(0);
    const logged = db.table("workflow_runs").find((r) => r.runId === summaries[0]!.runId);
    expect(logged?.skippedInBank).toBe(summaries[0]!.skippedInBank);
  });

  it("leaves a stage that is switched off as Ready to send, and sends nothing", async () => {
    await db.store.update("workspaces", WS, { autoSendStages: [2] });
    const summary = await run("2026-11-05");
    const [saha] = openOf("Saha Furniture Mart");
    expect(mails).toHaveLength(0);
    expect(reminder(saha!.$id, 1)).toMatchObject({ status: "skipped_stage_off", attempts: 0 });
    expect(saha!.ladderStage).toBe(0);
    expect(summary.ready).toBeGreaterThan(0);
  });

  it("marks Das & Sons' Promise broken the day after its date, and the Ladder resumes", async () => {
    await run("2026-11-06");
    const [das] = openOf("Das & Sons");
    expect(db.table("promises").find((p) => p.invoiceId === das!.$id)?.status).toBe("approved");
    expect(reminder(das!.$id, 3)).toBeUndefined();

    await run("2026-11-07");
    expect(db.table("promises").find((p) => p.invoiceId === das!.$id)?.status).toBe("broken");
    expect(das).toMatchObject({ pauseReason: null, pausedUntil: null });
    const broke = db.table("events").find((e) => e.invoiceId === das!.$id && e.type === "promise_broken");
    expect(broke?.actor).toBe("workflow");
    expect(reminder(das!.$id, 3)).toMatchObject({ status: "skipped_stage_off" });
  });

  it("refuses a date it cannot read, and a stranger", async () => {
    expect((await post("/api/ladder/run", { date: "5 Nov" })).status).toBe(400);
    expect((await post("/api/ladder/run", { date: "2026-11-05" }, { authorization: "Bearer nope" })).status).toBe(401);
  });
});

describe("GET /api/settings/email", () => {
  it("names the Demo inbox every reminder email goes to", async () => {
    const res = await app.request("/api/settings/email", { headers: jwt });
    expect(await res.json()).toEqual({ demoInbox: INBOX, emailReady: true });
  });
});

describe("POST /api/ladder/sent", () => {
  it("records the Owner's WhatsApp send of a ready Reminder and moves the Ladder on", async () => {
    await run("2026-11-02");
    const [gupta] = openOf("Gupta Traders");
    expect(reminder(gupta!.$id, 4)).toMatchObject({ status: "skipped_stage_off" });

    const res = await post("/api/ladder/sent", { invoiceId: gupta!.$id, stage: 4, channel: "whatsapp_link" });
    expect(res.status).toBe(200);
    expect(reminder(gupta!.$id, 4)).toMatchObject({ status: "sent", channel: "whatsapp_link", sentDate: "2026-11-02" });
    expect(gupta!.ladderStage).toBe(4);
    const event = db.table("events").find((e) => e.invoiceId === gupta!.$id && e.type === "reminder" && e.actor === "owner" && String(e.at).startsWith("2026-11-02"));
    expect(event?.summary).toBe("Firm reminder sent on WhatsApp");

    // A second tap changes nothing.
    expect((await post("/api/ladder/sent", { invoiceId: gupta!.$id, stage: 4, channel: "whatsapp_link" })).status).toBe(200);
    expect(db.table("events").filter((e) => e.invoiceId === gupta!.$id && e.summary === "Firm reminder sent on WhatsApp")).toHaveLength(1);
  });

  it("holds the next message to the same Customer until tomorrow", async () => {
    const [gupta] = openOf("Gupta Traders");
    expect((await post("/api/ladder/sent", { invoiceId: gupta!.$id, stage: 4, channel: "whatsapp_link" })).status).toBe(200);
    const res = await post("/api/ladder/sent", { invoiceId: gupta!.$id, stage: 5, channel: "whatsapp_link" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "one_a_day" });
    expect(reminder(gupta!.$id, 5)).toBeUndefined();
  });

  it("refuses a stage the Ladder is not on", async () => {
    const [gupta] = openOf("Gupta Traders");
    expect((await post("/api/ladder/sent", { invoiceId: gupta!.$id, stage: 6, channel: "whatsapp_link" })).status).toBe(409);
  });
});
