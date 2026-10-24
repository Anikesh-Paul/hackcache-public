// The Customer's pay link (build plan §4). The token has been checked before
// any of this runs; everything here is one Invoice of one workspace, and the
// answer carries nothing else of the Owner's books.
import { createHash, randomBytes } from "node:crypto";
import { Permission, Role } from "node-appwrite";
import type { EventActor, InboxKind, PayInstalment, PaySlip } from "@tagada/appwrite";
import { bengaliDate, differencePaise, formatAmountInput, formatDate, formatInr, hindiDate, hindiRupees } from "@tagada/money";
import {
  PROOF_LABEL,
  checkProof,
  invoiceStanding,
  planInWords,
  planRule,
  proofFromModel,
  waitingInBank,
  type InvoiceFacts,
  type PromiseFacts,
  type ProofCredit,
  type ProofResultKind,
} from "@tagada/domain";
import { bankSuggestions } from "./bank-credits.ts";
import type { OwnedRow, StoredRow, WorldStore } from "./demo.ts";
import type { PayRef } from "./pay-token.ts";
import type { ProofReader } from "./proof-read.ts";

/** An Invoice to act on; `token` is set when the request came through its pay link. */
type Ref = PayRef & { token?: string };

export type FileStore = {
  /** Into the `screenshots` bucket, readable by the Owner alone. */
  saveScreenshot(file: { fileId: string; ownerUserId: string; name: string; bytes: Uint8Array }): Promise<void>;
  /** A read-aloud clip stored earlier, or null. */
  audio(fileId: string): Promise<Uint8Array | null>;
  saveAudio(fileId: string, bytes: Uint8Array): Promise<void>;
  /** A screenshot the Owner uploaded, or null when the file is gone. */
  readScreenshot(fileId: string): Promise<{ bytes: Uint8Array; mime: string } | null>;
};

/** Text to speech: MP3 bytes. `language` is the ElevenLabs language code. */
export type SpeakLanguage = "hi" | "bn" | "en";
export type Voice = { speak(text: string, language?: SpeakLanguage): Promise<Uint8Array> };

export type PayDeps = { worlds: WorldStore; files: FileStore; voice: Voice; proof?: ProofReader | null };

export type PayFailure = { ok: false; status: 400 | 404 | 409; error: string; reason?: string };
export type PayResult = { ok: true; slip: PaySlip } | PayFailure;

const fail = (status: PayFailure["status"], error: string, reason?: string): PayFailure => ({
  ok: false,
  status,
  error,
  ...(reason ? { reason } : {}),
});

export type Book = {
  workspace: StoredRow;
  invoice: StoredRow;
  customer: StoredRow | undefined;
  promises: StoredRow[];
  events: StoredRow[];
  /** The world's Bank credits: a suggested match against this Invoice means the money is in the bank. */
  bank: StoredRow[];
};

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const whole = (value: unknown): number => (typeof value === "number" && Number.isInteger(value) ? value : 0);

/**
 * One Invoice and what hangs off it. From a pay link, the token must still be
 * the one the Invoice carries: a link from before Reset demo opens nothing.
 * The Owner's own requests come with no token.
 */
export async function open(worlds: WorldStore, { workspaceId, invoiceId, token }: Ref): Promise<Book | null> {
  // One round trip: every Customer of the world (a dozen rows) rather than waiting for the Invoice's customerId.
  const [workspaces, invoices, promises, events, customers, bank] = await Promise.all([
    worlds.list("workspaces", workspaceId),
    worlds.list("invoices", workspaceId, { $id: invoiceId }),
    worlds.list("promises", workspaceId, { invoiceId }),
    worlds.list("events", workspaceId, { invoiceId }),
    worlds.list("customers", workspaceId),
    worlds.list("bank_txns", workspaceId),
  ]);
  const [workspace] = workspaces;
  const invoice = invoices.find((i) => i.$id === invoiceId);
  if (!workspace || !invoice) return null;
  if (token !== undefined && invoice.payToken !== token) return null;
  const customer = customers.find((c) => c.$id === invoice.customerId);
  return { workspace, invoice, customer, promises, events, bank };
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

/**
 * The Invoice as its Customer sees it on the Demo date. Money in the bank,
 * waiting for the Owner to confirm it, reads as "waiting for the bank to
 * confirm", the same as an "already paid": never as late.
 */
export function slipOf({ workspace, invoice, customer, promises, events, bank }: Book): PaySlip {
  const today = text(workspace.today) ?? "";
  const known = promises.map(promiseFacts);
  const standing = invoiceStanding(facts(invoice), known, today);
  const inBank = waitingInBank(bankSuggestions(bank), [{ $id: invoice.$id, ...facts(invoice) }]).has(invoice.$id);
  const rule = planRule.parse(text(workspace.planRule));
  const has = (type: string) => events.some((e) => e.type === type);
  const agreed = known.find((p) => p.status === "approved");
  const waiting = known.find((p) => p.status === "needs_owner");

  const claimed = has("paid_claim") || has("proof_uploaded");
  let state: PaySlip["state"] = "owing";
  let plan: PayInstalment[] | null = null;
  if (standing.state === "paid") state = "paid";
  else if (standing.state === "cancelled") state = "cancelled";
  else if (standing.state === "disputed") state = "disputed";
  else if (inBank || claimed) state = "paid_claim";
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
    inBank: state === "paid_claim" && !claimed,
    choices: standing.balancePaise > 0 ? planRule.choices(rule, { owedPaise: standing.balancePaise, today }) : [],
    rule,
  };
}

export async function paySlip(worlds: WorldStore, ref: Ref): Promise<PayResult> {
  const book = await open(worlds, ref);
  return book ? { ok: true, slip: slipOf(book) } : fail(404, "invalid_link");
}

export const newId = (prefix: string) => `${prefix}${randomBytes(12).toString("hex")}`;

/** The Demo date with the IST time of day now, so new events sort after the seeded ones. */
export function stamp(today: string): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(11, 23);
  return `${today}T${ist}+05:30`;
}

export function owner(book: Book) {
  const userId = text(book.workspace.ownerUserId) ?? book.workspace.$id.slice(1);
  return { userId, permissions: [Permission.read(Role.user(userId)), Permission.update(Role.user(userId))] };
}

/**
 * Writes an event on the Invoice, the Inbox item that points at it and any
 * other rows, in one round trip: the Owner hears in well under a second. The
 * Owner's screen shows an item whose event has not arrived yet as loading.
 */
export async function record(
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
    const bytes = new Uint8Array(await file.arrayBuffer());
    await deps.files.saveScreenshot({
      fileId,
      ownerUserId: owner(book).userId,
      name: `${fileId}.${ext}`,
      bytes,
    });
    const checked = await readProof(deps, book, bytes, file.type);
    const { permissions } = owner(book);
    await record(
      deps.worlds,
      book,
      {
        type: "proof_uploaded",
        actor: "customer",
        summary: `Sent a UPI screenshot on the pay link. ${checked.label}.`,
        payload: { fileId },
      },
      "proof_uploaded",
      {
        proof_checks: [
          {
            $id: newId("f"),
            workspaceId: book.workspace.$id,
            $permissions: permissions,
            invoiceId: book.invoice.$id,
            fileId,
            extracted: checked.extracted ? JSON.stringify(checked.extracted) : null,
            result: checked.result,
            checkedAt: stamp(text(book.workspace.today) ?? ""),
          },
        ],
      },
    );
  });
}

/** Read the screenshot, if a reader is configured, and check it. A missing reader is "not found yet". */
async function readProof(
  deps: PayDeps,
  book: Book,
  bytes: Uint8Array,
  mime: string,
): Promise<{ result: ProofResultKind; label: string; extracted: ReturnType<typeof proofFromModel> }> {
  let extracted = null;
  if (deps.proof) {
    try {
      extracted = proofFromModel(await deps.proof.read({ bytes, mime }));
    } catch (e) {
      console.error("proof read failed", e);
    }
  }
  if (!extracted) return { result: "not_found_yet", label: PROOF_LABEL.not_found_yet, extracted: null };
  const credits = book.bank;
  const view = checkProof({
    extracted,
    today: text(book.workspace.today) ?? "",
    balancePaise: differencePaise(whole(book.invoice.totalPaise), whole(book.invoice.paidPaise)),
    credits: proofCredits(credits, book.invoice.$id),
  });
  return { result: view.result, label: view.label, extracted };
}

/** Bank credits as a proof check reads them, marking those already confirmed against this Invoice. */
export function proofCredits(rows: readonly StoredRow[], invoiceId: string): ProofCredit[] {
  return rows.map((row) => {
    let confirmedHere = false;
    if (row.matchStatus === "confirmed" && typeof row.allocations === "string") {
      try {
        const shares = JSON.parse(row.allocations) as unknown;
        confirmedHere = Array.isArray(shares) && shares.some((share) => (share as { invoiceId?: unknown })?.invoiceId === invoiceId);
      } catch {
        confirmedHere = false;
      }
    }
    return { utr: text(row.utr), amountPaise: whole(row.amountPaise), confirmedHere };
  });
}

const words = planInWords;

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
          payload: { reason },
        },
        actor === "customer" ? "dispute" : null,
      ),
    ]);
  });
}

/** What the read-aloud button says, in the page's language. Hindi amounts use Hindi words. */
export function spokenSlip(slip: PaySlip, language: SpeakLanguage): string {
  if (language === "bn") return spokenBengali(slip);
  if (language === "en") return spokenEnglish(slip);
  return spokenHindi(slip);
}

function spokenBengali(slip: PaySlip): string {
  const hello = `নমস্কার, ${slip.customer.name}। ${slip.from.businessName}-এর বার্তা।`;
  // The number and the word টাকা, with no ₹ sign: the sign would be read as a second currency word.
  // No grouping commas either (formatAmountInput): the voice reads one plain number, not its parts.
  const money = (paise: number) => `${formatAmountInput(paise)} টাকা`;
  if (slip.state === "paid") return `${hello} আপনার বিল পুরো মিটে গেছে। ধন্যবাদ।`;
  if (slip.state === "cancelled") return `${hello} এই বিল বাতিল করা হয়েছে। এর জন্য কিছু দিতে হবে না।`;
  if (slip.state === "paid_claim") return `${hello} ধন্যবাদ। ব্যাংকে নিশ্চিত হলেই আপনাকে জানাব।`;
  if (slip.state === "disputed") return `${hello} আপনার কথা পৌঁছেছে। উত্তর আসা পর্যন্ত কোনো অনুস্মারক পাঠানো হবে না।`;
  if (slip.plan && (slip.state === "plan" || slip.state === "asked")) {
    const lines = slip.plan.map((i) => `${money(i.amountPaise)}, ${bengaliDate(i.date)}-এর মধ্যে`).join("। ");
    return `${hello} আপনার কিস্তি: ${lines}।`;
  }
  const due = slip.invoice.daysLate > 0 ? "ছিল" : "আছে";
  return (
    `${hello} বিলের ${money(slip.invoice.balancePaise)} বাকি ${due}। ` +
    `শেষ তারিখ ${bengaliDate(slip.invoice.dueDate)}। ` +
    "UPI দিয়ে দিতে, কিস্তি বেছে নিতে বা বিলের ভুল জানাতে নিচের বোতাম চাপুন।"
  );
}

function spokenEnglish(slip: PaySlip): string {
  const hello = `Namaste, ${slip.customer.name}. A message from ${slip.from.businessName}.`;
  if (slip.state === "paid") return `${hello} This bill is paid in full. Thank you.`;
  if (slip.state === "cancelled") return `${hello} This bill was cancelled. Nothing is due on it.`;
  if (slip.state === "paid_claim") return `${hello} Thank you. We'll let you know as soon as the bank confirms it.`;
  if (slip.state === "disputed") return `${hello} Your message has reached them. No reminders are sent meanwhile.`;
  if (slip.plan && (slip.state === "plan" || slip.state === "asked")) {
    const lines = slip.plan.map((i) => `${formatInr(i.amountPaise)} by ${formatDate(i.date, { weekday: false })}`).join(". ");
    return `${hello} Your instalments: ${lines}.`;
  }
  return (
    `${hello} ${formatInr(slip.invoice.balancePaise)} is still due on this Invoice. ` +
    `The last date is ${formatDate(slip.invoice.dueDate, { weekday: false })}. ` +
    "Use the buttons below to pay by UPI, pick instalments, or tell us what is wrong with the bill."
  );
}

/** What the read-aloud button says: the slip in spoken Hindi, amounts and dates in words. */
export function spokenHindi(slip: PaySlip): string {
  const hello = `नमस्ते, ${slip.customer.name}। ${slip.from.businessName} का संदेश।`;
  if (slip.state === "paid") return `${hello} आपका बिल पूरा भर दिया गया है। धन्यवाद।`;
  if (slip.state === "cancelled") return `${hello} यह बिल रद्द कर दिया गया है। इस पर कुछ नहीं देना है।`;
  if (slip.state === "paid_claim") return `${hello} धन्यवाद। बैंक में पुष्टि होते ही हम आपको बताएंगे।`;
  if (slip.state === "disputed") return `${hello} आपकी शिकायत हमें मिल गई है। जवाब आने तक कोई अनुस्मारक नहीं भेजा जाएगा।`;
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
export async function readAloud(deps: PayDeps, ref: Ref, language: SpeakLanguage = "hi"): Promise<Uint8Array | null> {
  const book = await open(deps.worlds, ref);
  if (!book) return null;
  const words = spokenSlip(slipOf(book), language);
  const fileId = `a${createHash("sha256").update(`${language}:${words}`).digest("hex").slice(0, 32)}`;
  const stored = await deps.files.audio(fileId).catch((e: unknown) => {
    console.error("read-aloud clip not read", e);
    return null;
  });
  if (stored) return stored;
  const bytes = await deps.voice.speak(words, language);
  // Storing is only a saving: the Customer hears the clip either way.
  await deps.files.saveAudio(fileId, bytes).catch((e: unknown) => console.error("read-aloud clip not stored", e));
  return bytes;
}
