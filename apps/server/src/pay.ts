// The Customer's pay link (build plan §4). The token has been checked before
// any of this runs; everything here is one Invoice of one workspace, and the
// answer carries nothing else of the Owner's books.
import { createHash, randomBytes } from "node:crypto";
import { Permission, Role } from "node-appwrite";
import type { EventActor, InboxKind, PayInstalment, PaySlip } from "@tagada/appwrite";
import { formatDate, formatInr, hindiDate, hindiRupees } from "@tagada/money";
import { invoiceStanding, planRule, type InvoiceFacts, type PromiseFacts } from "@tagada/domain";
import type { OwnedRow, StoredRow, WorldStore } from "./demo.ts";
import type { PayRef } from "./pay-token.ts";

/** An Invoice to act on; `token` is set when the request came through its pay link. */
type Ref = PayRef & { token?: string };

export type FileStore = {
  /** Into the `screenshots` bucket, readable by the Owner alone. */
  saveScreenshot(file: { fileId: string; ownerUserId: string; name: string; bytes: Uint8Array }): Promise<void>;
  /** A read-aloud clip stored earlier, or null. */
  audio(fileId: string): Promise<Uint8Array | null>;
  saveAudio(fileId: string, bytes: Uint8Array): Promise<void>;
};

/** Text to speech: MP3 bytes. */
export type Voice = { speak(text: string): Promise<Uint8Array> };

export type PayDeps = { worlds: WorldStore; files: FileStore; voice: Voice };

export type PayFailure = { ok: false; status: 400 | 404 | 409; error: string; reason?: string };
export type PayResult = { ok: true; slip: PaySlip } | PayFailure;

const fail = (status: PayFailure["status"], error: string, reason?: string): PayFailure => ({
  ok: false,
  status,
  error,
  ...(reason ? { reason } : {}),
});

type Book = {
  workspace: StoredRow;
  invoice: StoredRow;
  customer: StoredRow | undefined;
  promises: StoredRow[];
  events: StoredRow[];
};

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const whole = (value: unknown): number => (typeof value === "number" && Number.isInteger(value) ? value : 0);

/**
 * One Invoice and what hangs off it. From a pay link, the token must still be
 * the one the Invoice carries: a link from before Reset demo opens nothing.
 * The Owner's own requests come with no token.
 */
async function open(worlds: WorldStore, { workspaceId, invoiceId, token }: Ref): Promise<Book | null> {
  // One round trip: every Customer of the world (a dozen rows) rather than waiting for the Invoice's customerId.
  const [workspaces, invoices, promises, events, customers] = await Promise.all([
    worlds.list("workspaces", workspaceId),
    worlds.list("invoices", workspaceId, { $id: invoiceId }),
    worlds.list("promises", workspaceId, { invoiceId }),
    worlds.list("events", workspaceId, { invoiceId }),
    worlds.list("customers", workspaceId),
  ]);
  const [workspace] = workspaces;
  const invoice = invoices.find((i) => i.$id === invoiceId);
  if (!workspace || !invoice) return null;
  if (token !== undefined && invoice.payToken !== token) return null;
  const customer = customers.find((c) => c.$id === invoice.customerId);
  return { workspace, invoice, customer, promises, events };
}

function facts(invoice: StoredRow): InvoiceFacts {
  return {
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
  return {
    status: (text(row.status) ?? "declined") as PromiseFacts["status"],
    instalments: JSON.parse(text(row.instalments) ?? "[]") as PayInstalment[],
  };
}

/** The Invoice as its Customer sees it on the Demo date. */
export function slipOf({ workspace, invoice, customer, promises, events }: Book): PaySlip {
  const today = text(workspace.today) ?? "";
  const known = promises.map(promiseFacts);
  const standing = invoiceStanding(facts(invoice), known, today);
  const rule = planRule.parse(text(workspace.planRule));
  const has = (type: string) => events.some((e) => e.type === type);
  const agreed = known.find((p) => p.status === "approved");
  const waiting = known.find((p) => p.status === "needs_owner");

  let state: PaySlip["state"] = "owing";
  let plan: PayInstalment[] | null = null;
  if (standing.state === "paid") state = "paid";
  else if (standing.state === "disputed") state = "disputed";
  else if (has("paid_claim") || has("proof_uploaded")) state = "paid_claim";
  else if (agreed) [state, plan] = ["plan", agreed.instalments];
  else if (waiting) [state, plan] = ["asked", waiting.instalments];
  else if (has("talk_requested")) state = "asked";

  return {
    today,
    from: {
      businessName: text(workspace.businessName) ?? "",
      gstin: text(workspace.gstin),
      upiVpa: text(workspace.upiVpa),
    },
    customer: { name: text(customer?.name) ?? "", lang: text(customer?.lang) },
    invoice: {
      number: text(invoice.number) ?? "",
      issueDate: text(invoice.issueDate) ?? "",
      dueDate: text(invoice.dueDate) ?? "",
      totalPaise: whole(invoice.totalPaise),
      balancePaise: standing.balancePaise,
      daysLate: standing.daysLate,
    },
    state,
    plan,
    screenshotSent: has("proof_uploaded"),
    choices: standing.balancePaise > 0 ? planRule.choices(rule, { owedPaise: standing.balancePaise, today }) : [],
    rule,
  };
}

export async function paySlip(worlds: WorldStore, ref: Ref): Promise<PayResult> {
  const book = await open(worlds, ref);
  return book ? { ok: true, slip: slipOf(book) } : fail(404, "invalid_link");
}

const newId = (prefix: string) => `${prefix}${randomBytes(12).toString("hex")}`;

/** The Demo date with the IST time of day now, so new events sort after the seeded ones. */
function stamp(today: string): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(11, 23);
  return `${today}T${ist}+05:30`;
}

function owner(book: Book) {
  const userId = text(book.workspace.ownerUserId) ?? book.workspace.$id.slice(1);
  return { userId, permissions: [Permission.read(Role.user(userId)), Permission.update(Role.user(userId))] };
}

/**
 * Writes an event on the Invoice, the Inbox item that points at it and any
 * other rows, in one round trip: the Owner hears in well under a second. The
 * Owner's screen shows an item whose event has not arrived yet as loading.
 */
async function record(
  worlds: WorldStore,
  book: Book,
  event: { type: string; actor: EventActor; summary: string; payload?: unknown },
  inbox: InboxKind | null,
  extra: Record<string, OwnedRow[]> = {},
): Promise<OwnedRow> {
  const { permissions } = owner(book);
  const workspaceId = book.workspace.$id;
  const row: OwnedRow = {
    $id: newId("v"),
    workspaceId,
    $permissions: permissions,
    invoiceId: book.invoice.$id,
    at: stamp(text(book.workspace.today) ?? ""),
    type: event.type,
    actor: event.actor,
    summary: event.summary,
    payload: event.payload === undefined ? null : JSON.stringify(event.payload),
  };
  const item = { $id: newId("x"), workspaceId, $permissions: permissions, kind: inbox, refId: row.$id, read: false };
  await worlds.write({ events: [row], ...(inbox ? { inbox: [item] } : {}), ...extra });
  return row;
}

async function act(
  worlds: WorldStore,
  ref: Ref,
  allowed: readonly PaySlip["state"][],
  run: (book: Book, slip: PaySlip) => Promise<PayFailure | void>,
): Promise<PayResult> {
  const book = await open(worlds, ref);
  if (!book) return fail(404, "invalid_link");
  const slip = slipOf(book);
  if (slip.state === "paid") return fail(409, "already_paid");
  if (!allowed.includes(slip.state)) return fail(409, `already_${slip.state}`);
  const failed = await run(book, slip);
  if (failed) return failed;
  return paySlip(worlds, ref);
}

/** "मैंने भुगतान कर दिया है". Never doubted in words: the bank statement checks it. */
export function claimPaid(worlds: WorldStore, ref: Ref): Promise<PayResult> {
  return act(worlds, ref, ["owing", "plan", "asked", "paid_claim"], async (book, slip) => {
    if (slip.state === "paid_claim") return;
    await record(
      worlds,
      book,
      { type: "paid_claim", actor: "customer", summary: "Said on the pay link that the bill is already paid" },
      "paid_claim",
    );
  });
}

const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

export function uploadScreenshot(deps: PayDeps, ref: Ref, file: unknown): Promise<PayResult> {
  return act(deps.worlds, ref, ["owing", "plan", "asked", "paid_claim"], async (book) => {
    if (!(file instanceof File)) return fail(400, "invalid_file");
    const ext = IMAGE_TYPES.get(file.type);
    if (!ext || file.size === 0 || file.size > MAX_SCREENSHOT_BYTES) return fail(400, "invalid_file");
    const fileId = newId("s");
    await deps.files.saveScreenshot({
      fileId,
      ownerUserId: owner(book).userId,
      name: `${fileId}.${ext}`,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    await record(
      deps.worlds,
      book,
      {
        type: "proof_uploaded",
        actor: "customer",
        summary: "Sent a UPI screenshot on the pay link, to be checked against the bank statement",
        payload: { fileId },
      },
      "proof_uploaded",
    );
  });
}

const words = (plan: readonly PayInstalment[]) =>
  plan.map((i) => `${formatInr(i.amountPaise)} by ${formatDate(i.date)}`).join(", then ");

function parseInstalments(value: unknown): { amountPaise: number; date: string | null }[] | null {
  if (!Array.isArray(value) || value.length > 12) return null;
  const out: { amountPaise: number; date: string | null }[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const { amountPaise, date } = item as Record<string, unknown>;
    if (typeof amountPaise !== "number" || !Number.isSafeInteger(amountPaise)) return null;
    if (date !== null && date !== undefined && typeof date !== "string") return null;
    out.push({ amountPaise, date: typeof date === "string" ? date : null });
  }
  return out;
}

/** "थोड़ा समय चाहिए": a Plan inside the rule is agreed; anything else waits for the Owner. */
export function choosePlan(worlds: WorldStore, ref: Ref, body: unknown): Promise<PayResult> {
  return act(worlds, ref, ["owing"], async (book, slip) => {
    const input = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    if (input.talkToOwner === true) {
      await record(
        worlds,
        book,
        { type: "talk_requested", actor: "customer", summary: "Asked on the pay link to talk to you about more time" },
        "needs_decision",
      );
      return;
    }
    const instalments = parseInstalments(input.instalments);
    if (!instalments) return fail(400, "invalid_plan", "Not recorded: send the instalments as amounts and dates.");
    const verdict = planRule.evaluate(slip.rule, {
      owedPaise: slip.invoice.balancePaise,
      today: slip.today,
      instalments,
    });
    if (verdict.verdict === "reject") return fail(400, "invalid_plan", verdict.reason);

    const { permissions } = owner(book);
    const agreed = verdict.verdict === "accept";
    const promise: OwnedRow = {
      $id: newId("p"),
      workspaceId: book.workspace.$id,
      $permissions: permissions,
      invoiceId: book.invoice.$id,
      source: "link",
      instalments: JSON.stringify(agreed ? verdict.instalments : instalments),
      status: agreed ? "approved" : "needs_owner",
      transcriptRef: null,
    };
    const asked = agreed ? verdict.instalments : (instalments as PayInstalment[]);
    const last = asked[asked.length - 1];
    const pause = agreed
      ? worlds.update("invoices", book.invoice.$id, { pauseReason: "plan", pausedUntil: last?.date ?? null })
      : Promise.resolve();
    const told = record(
      worlds,
      book,
      agreed
        ? {
            type: "plan_accepted",
            actor: "customer",
            summary: `Chose a Plan on the pay link: ${words(asked)}. The Ladder is paused.`,
            payload: { promiseId: promise.$id },
          }
        : {
            type: "plan_requested",
            actor: "customer",
            summary: `Asked on the pay link for ${words(asked)}. ${verdict.reasons.join(" ")} It needs your decision.`,
            payload: { promiseId: promise.$id },
          },
      agreed ? "plan_accepted" : "needs_decision",
      { promises: [promise] },
    );
    await Promise.all([pause, told]);
  });
}

function reasonOf(body: unknown): string | null {
  const reason = typeof body === "object" && body !== null ? (body as Record<string, unknown>).reason : null;
  if (typeof reason !== "string") return null;
  const trimmed = reason.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 && trimmed.length <= 500 ? trimmed : null;
}

/** "बिल में गड़बड़ी है? बताएं", or the Owner's "Mark as disputed". Stops the Ladder until resolved. */
export function raiseDispute(worlds: WorldStore, ref: Ref, body: unknown, actor: "customer" | "owner") {
  return act(worlds, ref, ["owing", "plan", "asked", "paid_claim"], async (book) => {
    const reason = reasonOf(body);
    if (!reason) return fail(400, "invalid_reason");
    await Promise.all([
      worlds.update("invoices", book.invoice.$id, { status: "disputed", pauseReason: "dispute", pausedUntil: null }),
      record(
        worlds,
        book,
        {
          type: "dispute",
          actor,
          summary:
            actor === "customer"
              ? `Raised a Dispute on the pay link: "${reason}". The Ladder is paused until you resolve it.`
              : `Marked as disputed: "${reason}". The Ladder is paused until you resolve it.`,
        },
        actor === "customer" ? "dispute" : null,
      ),
    ]);
  });
}

/** What the read-aloud button says: the slip in spoken Hindi, amounts and dates in words. */
export function spokenHindi(slip: PaySlip): string {
  const hello = `नमस्ते, ${slip.customer.name}। ${slip.from.businessName} का संदेश।`;
  if (slip.state === "paid") return `${hello} आपका बिल पूरा भर दिया गया है। धन्यवाद।`;
  if (slip.state === "paid_claim") return `${hello} धन्यवाद। बैंक में पुष्टि होते ही हम आपको बताएंगे।`;
  if (slip.state === "disputed") return `${hello} आपकी शिकायत हमें मिल गई है। जवाब आने तक कोई याद नहीं भेजी जाएगी।`;
  if (slip.plan && (slip.state === "plan" || slip.state === "asked")) {
    const lines = slip.plan.map((i) => `${hindiRupees(i.amountPaise)}, ${hindiDate(i.date)} तक`).join("। ");
    return `${hello} आपकी किश्तें: ${lines}।`;
  }
  const due = slip.invoice.daysLate > 0 ? "थी" : "है";
  return (
    `${hello} बिल के ${hindiRupees(slip.invoice.balancePaise)} बाकी हैं। ` +
    `आखिरी तारीख ${hindiDate(slip.invoice.dueDate)} ${due}। ` +
    "UPI से भरने, किश्तें चुनने या बिल में गड़बड़ी बताने के लिए नीचे के बटन दबाएं।"
  );
}

/** The Hindi read-aloud clip, spoken once per wording and then played from Storage. */
export async function readAloud(deps: PayDeps, ref: Ref): Promise<Uint8Array | null> {
  const book = await open(deps.worlds, ref);
  if (!book) return null;
  const words = spokenHindi(slipOf(book));
  const fileId = `a${createHash("sha256").update(words).digest("hex").slice(0, 32)}`;
  const stored = await deps.files.audio(fileId).catch((e: unknown) => {
    console.error("read-aloud clip not read", e);
    return null;
  });
  if (stored) return stored;
  const bytes = await deps.voice.speak(words);
  // Storing is only a saving: the Customer hears the clip either way.
  await deps.files.saveAudio(fileId, bytes).catch((e: unknown) => console.error("read-aloud clip not stored", e));
  return bytes;
}
