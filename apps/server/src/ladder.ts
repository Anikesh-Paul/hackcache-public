// The daily Ladder run (build plan §2.6), shared by the Render workflow, the
// 10:00 IST cron and the Demo date stepper, so all three walk the same code.
// A run plans the day (breaking any Promise whose date passed), then sends
// each Reminder; the Reminder's row ID is its idempotency key, created before
// anything goes out, so no Reminder is ever sent twice. An Invoice whose money
// is already in the bank, waiting for the Owner to confirm it, is not chased.
import { Permission, Role } from "node-appwrite";
import { differencePaise, formatDate, formatInr, isCivilDate, sumPaise } from "@tagada/money";
import {
  DEFAULT_AUTO_SEND,
  REMINDER_NAMES,
  REPEAT_REFUSED,
  isCustomerLang,
  isRepeatRefused,
  ladderDay,
  nextAction,
  promiseBroken,
  reminderMessage,
  suggestedInBank,
  waitingInBank,
  type InvoiceFacts,
  type LadderInvoice,
  type PromiseFacts,
} from "@tagada/domain";
import { SEEDED_FAILURE, failsFirstSend } from "@tagada/seed";
import { bankSuggestions } from "./bank-credits.ts";
import { refreshProofs } from "./bank.ts";
import type { OwnedRow, StoredRow, WorldStore } from "./demo.ts";
import type { Mail, Mailer } from "./email.ts";
import { newId, stamp } from "./pay.ts";

export type LadderDeps = {
  worlds: WorldStore;
  /** Null when Resend is not set up: every email then fails, and says why. */
  mailer: Mailer | null;
  /** Where every reminder email really goes. */
  demoInbox: string | null;
  /** The web app's origin, for the https pay link. */
  webOrigin: string;
};

/** One Reminder the run wants: what `sendReminder` is given, on its own compute. */
export type ReminderJob = {
  workspaceId: string;
  runId: string;
  demoDate: string;
  invoiceId: string;
  customerId: string;
  stage: number;
  send: "auto" | "owner" | "capped";
};

/**
 * `retried`: sent, after an earlier attempt under the same key failed.
 * `duplicate`: the key was already sent. `ready`: left for the Owner to send.
 * `capped`: the Customer had a message today; it rolls to tomorrow.
 * `refused`: the email service refused the key as a repeat; it is not tried again.
 */
export type SendResult = "sent" | "retried" | "duplicate" | "failed" | "refused" | "ready" | "capped";

export type RunSummary = {
  runId: string;
  demoDate: string;
  scanned: number;
  sent: number;
  skippedDuplicate: number;
  /** Not chased: the money is in the bank, waiting for the Owner to confirm it. */
  skippedInBank: number;
  retried: number;
  failed: number;
  ready: number;
  capped: number;
};

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const whole = (value: unknown): number => (typeof value === "number" && Number.isInteger(value) ? value : 0);

export const reminderKey = (invoiceId: string, stage: number) => `rem_${invoiceId}_s${stage}`;

/**
 * Resend's key: the Reminder's, under this seeding of the world. Reset demo
 * keeps the workspace ID but writes a new workspace row, and the new world's
 * emails carry new pay links, so the old key would be refused for 24 hours.
 */
export const resendKey = (workspace: StoredRow, key: string) => {
  const seeding = text(workspace.$createdAt)?.replace(/[^0-9]/g, "");
  return seeding ? `${workspace.$id}/${key}/${seeding}` : `${workspace.$id}/${key}`;
};

/** A run stands for its Demo date's 10:00 IST run, whenever the stepper starts it. */
const runTime = (demoDate: string) => `${demoDate}T10:00:00.000+05:30`;

function permissionsOf(workspace: StoredRow): string[] {
  const userId = text(workspace.ownerUserId) ?? workspace.$id.slice(1);
  return [Permission.read(Role.user(userId)), Permission.update(Role.user(userId))];
}

function facts(invoice: StoredRow): LadderInvoice {
  return {
    $id: invoice.$id,
    customerId: text(invoice.customerId) ?? "",
    totalPaise: whole(invoice.totalPaise),
    paidPaise: whole(invoice.paidPaise),
    status: (text(invoice.status) ?? "sent") as InvoiceFacts["status"],
    dueDate: text(invoice.dueDate) ?? "",
    ladderStage: whole(invoice.ladderStage),
    pausedUntil: text(invoice.pausedUntil),
    pauseReason: text(invoice.pauseReason),
  };
}

function promiseFacts(row: StoredRow): PromiseFacts {
  let instalments: PromiseFacts["instalments"] = [];
  try {
    const parsed = JSON.parse(text(row.instalments) ?? "[]") as unknown;
    if (Array.isArray(parsed)) instalments = parsed as PromiseFacts["instalments"];
  } catch {
    // an unreadable Promise counts as having no dates
  }
  return { status: (text(row.status) ?? "declined") as PromiseFacts["status"], instalments };
}

function autoSendOf(workspace: StoredRow): readonly number[] {
  const stages = workspace.autoSendStages;
  return Array.isArray(stages) ? stages.filter((s): s is number => Number.isInteger(s)) : DEFAULT_AUTO_SEND;
}

async function event(
  worlds: WorldStore,
  workspace: StoredRow,
  invoiceId: string,
  e: { $id: string; at: string; type: string; actor: "owner" | "workflow"; summary: string; payload?: unknown },
) {
  await worlds.write({
    events: [
      {
        workspaceId: workspace.$id,
        $permissions: permissionsOf(workspace),
        invoiceId,
        ...e,
        payload: e.payload === undefined ? null : JSON.stringify(e.payload),
      },
    ],
  });
}

/**
 * Marks each agreed Promise broken once a date it named has passed unpaid,
 * and lifts its pause, so the Ladder resumes. Money waiting in Bank for the
 * Owner's Confirm counts as paid. Returns the Promises as they now stand.
 */
async function breakPromises(
  worlds: WorldStore,
  workspace: StoredRow,
  invoices: StoredRow[],
  promises: StoredRow[],
  inBank: ReadonlyMap<string, number>,
  today: string,
) {
  const out: (PromiseFacts & { invoiceId: string })[] = [];
  for (const row of promises) {
    const promise = promiseFacts(row);
    const invoiceId = text(row.invoiceId) ?? "";
    const invoice = invoices.find((i) => i.$id === invoiceId);
    const known = invoice && facts(invoice);
    const owed = known && { ...known, paidPaise: sumPaise([known.paidPaise, inBank.get(invoiceId) ?? 0]) };
    if (invoice && owed && invoice.status !== "paid" && promiseBroken(promise, owed, today)) {
      const missed = promise.instalments.find((i) => i.date < today);
      const what = promise.instalments.length > 1 ? "The Plan's instalment of" : "The Promise of";
      await worlds.update("promises", row.$id, { status: "broken" });
      if (invoice.pauseReason === "promise" || invoice.pauseReason === "plan") {
        await worlds.update("invoices", invoice.$id, { pauseReason: null, pausedUntil: null });
      }
      await event(worlds, workspace, invoiceId, {
        $id: `b${row.$id}`.slice(0, 36),
        at: stamp(today),
        type: "promise_broken",
        actor: "workflow",
        summary: `${what} ${formatInr(missed?.amountPaise ?? 0)} by ${formatDate(missed?.date ?? today)} was not paid. The Ladder resumes.`,
      });
      out.push({ ...promise, status: "broken", invoiceId });
    } else {
      out.push({ ...promise, invoiceId });
    }
  }
  return out;
}

/** The first half of `dailyLadder`: breaks Promises whose date passed, then lists the day's Reminders. */
export async function planRun(deps: LadderDeps, workspaceId: string, demoDate: string, runId: string) {
  const { worlds } = deps;
  const [workspace, invoices, promises, reminders, bank] = await Promise.all([
    worlds.get("workspaces", workspaceId),
    worlds.list("invoices", workspaceId),
    worlds.list("promises", workspaceId),
    worlds.list("reminders", workspaceId),
    worlds.list("bank_txns", workspaceId),
  ]);
  if (!workspace) throw new Error(`no workspace ${workspaceId}`);
  const open = invoices.filter((i) => i.status !== "paid");
  const standing = await breakPromises(worlds, workspace, open, promises, suggestedInBank(bankSuggestions(bank)), demoDate);
  // Read again after breaking Promises: a broken one no longer pauses its Invoice.
  const ladderInvoices = open.map((i) => {
    const f = facts(i);
    const broke = standing.some((p) => p.invoiceId === i.$id && p.status === "broken");
    return broke && (f.pauseReason === "promise" || f.pauseReason === "plan") ? { ...f, pauseReason: null, pausedUntil: null } : f;
  });
  const waiting = waitingInBank(bankSuggestions(bank), ladderInvoices);
  const day = (list: LadderInvoice[]) =>
    ladderDay({
      invoices: list,
      promises: standing,
      today: demoDate,
      autoSendStages: autoSendOf(workspace),
      sentToday: reminders.filter((r) => r.status === "sent" && r.sentDate === demoDate).map((r) => text(r.customerId) ?? ""),
    });
  const steps = day(ladderInvoices.filter((i) => !waiting.has(i.$id)));
  // What the Ladder would have sent, had the money not been waiting in the bank.
  const skippedInBank = day(ladderInvoices.filter((i) => waiting.has(i.$id))).length;
  const jobs: ReminderJob[] = steps.map((step) => ({
    workspaceId,
    runId,
    demoDate,
    invoiceId: step.invoiceId,
    customerId: step.customerId,
    stage: step.stage,
    send: step.send,
  }));
  return { scanned: open.length, jobs, skippedInBank };
}

/**
 * `sendReminder`: creates the Reminder's row first, under its key. If the key
 * is already there and sent, it stops; otherwise it carries on under the same
 * key and counts the attempt. Only an automatic stage is emailed.
 */
export async function sendReminder(deps: LadderDeps, job: ReminderJob): Promise<SendResult> {
  const { worlds } = deps;
  const [workspace, invoice, customer] = await Promise.all([
    worlds.get("workspaces", job.workspaceId),
    worlds.get("invoices", job.invoiceId),
    worlds.get("customers", job.customerId),
  ]);
  if (!workspace || !invoice || !customer || invoice.workspaceId !== job.workspaceId) {
    throw new Error(`reminder ${job.invoiceId}: its rows are not in ${job.workspaceId}`);
  }
  const key = reminderKey(job.invoiceId, job.stage);
  const auto = job.send === "auto";
  const waiting = job.send === "owner" ? "skipped_stage_off" : "skipped_cap";
  const row: OwnedRow = {
    $id: key,
    workspaceId: job.workspaceId,
    $permissions: permissionsOf(workspace),
    invoiceId: job.invoiceId,
    customerId: job.customerId,
    sentDate: job.demoDate,
    stage: job.stage,
    channel: auto ? "email" : "whatsapp_link",
    status: auto ? "queued" : waiting,
    attempts: auto ? 1 : 0,
    providerMessageId: null,
    error: null,
    runId: job.runId,
  };
  let attempts = 1;
  let retry = false;
  if ((await worlds.create("reminders", row)) === "exists") {
    const known = await worlds.get("reminders", key);
    // A key the email service refused as a repeat was recorded once; trying it again cannot help.
    if (known?.status === "sent" || (known?.status === "failed" && isRepeatRefused(text(known.error)))) return "duplicate";
    if (!auto) {
      await worlds.update("reminders", key, { status: waiting, sentDate: job.demoDate, runId: job.runId });
      return job.send === "owner" ? "ready" : "capped";
    }
    retry = whole(known?.attempts) > 0;
    attempts = whole(known?.attempts) + 1;
    await worlds.update("reminders", key, {
      status: "queued",
      channel: "email",
      attempts,
      sentDate: job.demoDate,
      runId: job.runId,
    });
  } else if (!auto) {
    return job.send === "owner" ? "ready" : "capped";
  }

  const ownerEmail = text(workspace.ownerEmail);
  const businessName = text(workspace.businessName) ?? "";
  const lang = text(customer.lang) ?? "en";
  const message = reminderMessage({
    stage: job.stage,
    lang: isCustomerLang(lang) ? lang : "en",
    businessName,
    customerName: text(customer.name) ?? "",
    number: text(invoice.number) ?? "",
    amountPaise: differencePaise(whole(invoice.totalPaise), whole(invoice.paidPaise)),
    dueDate: text(invoice.dueDate) ?? "",
    today: job.demoDate,
    payUrl: `${deps.webOrigin}/pay/${text(invoice.payToken) ?? ""}`,
    contact: ownerEmail ?? businessName,
  });
  const mail: Mail = {
    fromName: `${businessName} via Tagada`,
    to: deps.demoInbox ?? "",
    replyTo: ownerEmail,
    subject: message.subject,
    text: message.text,
    idempotencyKey: resendKey(workspace, key),
  };
  const outcome =
    !deps.mailer || !deps.demoInbox
      ? { ok: false as const, error: "Email is not set up on this server (RESEND_API_KEY and DEMO_INBOX_EMAIL)" }
      : attempts === 1 && (await refusedOnce(worlds, job))
        ? { ok: false as const, error: SEEDED_FAILURE }
        : await deps.mailer.send(mail);
  if (!outcome.ok) {
    const repeat = "repeat" in outcome && outcome.repeat === true;
    await worlds.update("reminders", key, { status: "failed", error: repeat ? `${REPEAT_REFUSED}${outcome.error}` : outcome.error });
    return repeat ? "refused" : "failed";
  }

  // The earlier attempt's error stays on the row, so the log can show the retry.
  await worlds.update("reminders", key, { status: "sent", providerMessageId: outcome.id });
  if (whole(invoice.ladderStage) < job.stage) await worlds.update("invoices", job.invoiceId, { ladderStage: job.stage });
  await event(worlds, workspace, job.invoiceId, {
    $id: `${key}e`,
    at: runTime(job.demoDate),
    type: "reminder",
    actor: "workflow",
    summary: `${REMINDER_NAMES[job.stage - 1] ?? "Reminder"} sent by email`,
    // The copy the Sent mail page shows.
    payload: { stage: job.stage, email: mail, providerMessageId: outcome.id },
  });
  return retry ? "retried" : "sent";
}

/**
 * True for the seeded Customer's first live email only: once one of their
 * live Reminders carries the seeded error, every later email goes as normal.
 */
async function refusedOnce(worlds: WorldStore, job: ReminderJob): Promise<boolean> {
  if (!failsFirstSend(job.customerId, job.workspaceId)) return false;
  const theirs = await worlds.list("reminders", job.workspaceId, { customerId: job.customerId });
  return !theirs.some((r) => r.error === SEEDED_FAILURE && !String(r.runId ?? "").startsWith("seed-"));
}

/** The last step of `dailyLadder`: the run's row in the Automation log. */
export async function recordRun(
  deps: LadderDeps,
  run: {
    workspaceId: string;
    runId: string;
    demoDate: string;
    startedAt: string;
    scanned: number;
    skippedInBank: number;
    results: SendResult[];
  },
): Promise<RunSummary> {
  const count = (...kinds: SendResult[]) => run.results.filter((r) => kinds.includes(r)).length;
  const summary: RunSummary = {
    runId: run.runId,
    demoDate: run.demoDate,
    scanned: run.scanned,
    sent: count("sent", "retried"),
    skippedDuplicate: count("duplicate"),
    skippedInBank: run.skippedInBank,
    retried: count("retried"),
    failed: count("failed", "refused"),
    ready: count("ready"),
    capped: count("capped"),
  };
  const workspace = await deps.worlds.get("workspaces", run.workspaceId);
  if (!workspace) throw new Error(`no workspace ${run.workspaceId}`);
  await deps.worlds.write({
    workflow_runs: [
      {
        $id: `r${run.runId}`.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 36),
        workspaceId: run.workspaceId,
        $permissions: permissionsOf(workspace),
        runId: run.runId,
        startedAt: run.startedAt,
        demoDate: run.demoDate,
        invoicesScanned: summary.scanned,
        sent: summary.sent,
        skippedDuplicate: summary.skippedDuplicate,
        skippedInBank: summary.skippedInBank,
        retried: summary.retried,
        failed: summary.failed,
      },
    ],
  });
  return summary;
}

/**
 * `dailyLadder` for one workspace and Demo date. `send` runs one Reminder:
 * on Render, `sendReminder` as its own task (retried by Render); here, in
 * this process, with one retry.
 */
export async function runLadder(
  deps: LadderDeps,
  workspaceId: string,
  demoDate: string,
  runId: string,
  send: (job: ReminderJob) => Promise<SendResult> = (job) => sendWithRetry(deps, job),
): Promise<RunSummary> {
  const startedAt = runTime(demoDate);
  const { scanned, jobs, skippedInBank } = await planRun(deps, workspaceId, demoDate, runId);
  const results = await Promise.all(jobs.map(send));
  return recordRun(deps, { workspaceId, runId, demoDate, startedAt, scanned, skippedInBank, results });
}

/** One send, and once more under the same key if it failed (not if it was refused as a repeat). */
export async function sendWithRetry(deps: LadderDeps, job: ReminderJob): Promise<SendResult> {
  const first = await sendReminder(deps, job);
  return first === "failed" ? sendReminder(deps, job) : first;
}

export type LadderRunner = (workspaceId: string, demoDate: string) => Promise<RunSummary>;

/** Runs the Ladder in this process. */
export function inProcessRunner(deps: LadderDeps, runId: () => string = () => newId("run")): LadderRunner {
  return (workspaceId, demoDate) => runLadder(deps, workspaceId, demoDate, runId());
}

/**
 * Moves the workspace's Demo date (the header's ‹ › stepper), checks again any
 * payment screenshot dated up to it, then runs the Ladder for it.
 */
export async function stepDemoDate(worlds: WorldStore, runner: LadderRunner, workspaceId: string, body: unknown) {
  const date = (body as { date?: unknown } | null)?.date;
  if (typeof date !== "string" || !isCivilDate(date)) return { ok: false as const, status: 400 as const, error: "invalid_date" };
  await worlds.update("workspaces", workspaceId, { today: date });
  // A screenshot left unchecked is checked again on the next import; the Ladder still runs.
  await refreshProofs(worlds, workspaceId).catch((e: unknown) => console.error("proof re-check failed", e));
  return { ok: true as const, summary: await runner(workspaceId, date) };
}

/**
 * The Owner sent a ready Reminder themself (WhatsApp, or email from their own
 * mail): the Reminder is marked sent under its key and the Ladder moves on.
 * A second tap changes nothing.
 */
export async function ownerSent(worlds: WorldStore, workspaceId: string, body: unknown) {
  const b = (body ?? {}) as { invoiceId?: unknown; stage?: unknown; channel?: unknown };
  const channel = b.channel === "email" ? "email" : b.channel === "whatsapp_link" ? "whatsapp_link" : null;
  if (typeof b.invoiceId !== "string" || !Number.isInteger(b.stage) || !channel) {
    return { ok: false as const, status: 400 as const, error: "invalid_body" };
  }
  const stage = b.stage as number;
  const [workspace, invoice, promises, reminders] = await Promise.all([
    worlds.get("workspaces", workspaceId),
    worlds.get("invoices", b.invoiceId),
    worlds.list("promises", workspaceId, { invoiceId: b.invoiceId }),
    worlds.list("reminders", workspaceId),
  ]);
  if (!workspace || !invoice || invoice.workspaceId !== workspaceId) {
    return { ok: false as const, status: 404 as const, error: "not_found" };
  }
  const key = reminderKey(invoice.$id, stage);
  if (reminders.find((r) => r.$id === key)?.status === "sent") return { ok: true as const };
  const today = text(workspace.today) ?? "";
  if (reminders.some((r) => r.status === "sent" && r.sentDate === today && r.customerId === invoice.customerId)) {
    return { ok: false as const, status: 409 as const, error: "one_a_day" };
  }
  const action = nextAction({ invoice: facts(invoice), promises: promises.map(promiseFacts), today, autoSendStages: autoSendOf(workspace) });
  if (action.kind !== "act" || action.stage !== stage || stage > REMINDER_NAMES.length) {
    return { ok: false as const, status: 409 as const, error: "not_due" };
  }
  const sent = { sentDate: today, channel, status: "sent", error: null };
  const created = await worlds.create("reminders", {
    $id: key,
    workspaceId,
    $permissions: permissionsOf(workspace),
    invoiceId: invoice.$id,
    customerId: text(invoice.customerId) ?? "",
    stage,
    attempts: 0,
    providerMessageId: null,
    runId: null,
    ...sent,
  });
  if (created === "exists") await worlds.update("reminders", key, sent);
  await worlds.update("invoices", invoice.$id, { ladderStage: stage });
  await event(worlds, workspace, invoice.$id, {
    $id: `${key}e`,
    at: stamp(today),
    type: "reminder",
    actor: "owner",
    summary: `${REMINDER_NAMES[stage - 1]} sent ${channel === "email" ? "by email" : "on WhatsApp"}`,
    payload: { stage },
  });
  return { ok: true as const };
}
