// The browser's only link to Appwrite: the endpoint and project ID, never a key.
// The visitor's anonymous session reads their own rows; row permissions do the rest.
import { Account, AppwriteException, Channel, Client, Query, Realtime, TablesDB, type RealtimeSubscription } from "appwrite";
import { DATABASE_ID, type DemoStarted } from "@tagada/appwrite";

export type { DemoStarted };

const client = new Client()
  .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT)
  .setProject(import.meta.env.VITE_APPWRITE_PROJECT);

const account = new Account(client);
const db = new TablesDB(client);
const realtime = new Realtime(client);
const SERVER_URL = import.meta.env.VITE_SERVER_URL;

/** Every row of one table in a workspace, optionally narrowed by more equalities. */
export async function rowsOf<T>(
  tableId: string,
  workspaceId: string,
  where: Record<string, string> = {},
): Promise<T[]> {
  const queries = [
    Query.equal("workspaceId", workspaceId),
    ...Object.entries(where).map(([key, value]) => Query.equal(key, value)),
    // Insertion order, so an Invoice's lines come back as they were written.
    Query.orderAsc("$sequence"),
    Query.limit(500),
  ];
  const { rows } = await db.listRows({ databaseId: DATABASE_ID, tableId, queries, total: false });
  return rows as unknown as T[];
}

const HINT = "tagada.session";

function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(HINT) === "1";
  } catch {
    return false;
  }
}

function rememberSession() {
  try {
    localStorage.setItem(HINT, "1");
  } catch {
    // only costs one extra round trip next time
  }
}

const is = (e: unknown, code: number, type?: string) =>
  e instanceof AppwriteException && e.code === code && (type === undefined || e.type === type);

/**
 * A short-lived JWT for the visitor's session, for the server to check.
 * Reuses the session in this browser; creates an anonymous one only when
 * there is none (Appwrite allows 50 an hour per IP, and refuses a second
 * session while one is active). Round trips: 1 when returning, 2 when new.
 */
async function sessionJwt(): Promise<string> {
  if (hasSessionHint()) {
    try {
      return (await account.createJWT()).jwt;
    } catch (e) {
      if (!is(e, 401)) throw e;
    }
  }
  try {
    await account.createAnonymousSession();
  } catch (e) {
    if (!is(e, 401, "user_session_already_exists")) throw e;
  }
  rememberSession();
  return (await account.createJWT()).jwt;
}

async function demoCall(path: "start" | "reset"): Promise<DemoStarted> {
  const jwt = await sessionJwt();
  const res = await fetch(`${SERVER_URL}/api/demo/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) throw new Error(`demo ${path}: ${res.status}`);
  return (await res.json()) as DemoStarted;
}

let started: Promise<DemoStarted> | null = null;

/** Seeds this visitor's Demo world once per page load (no-op if it exists). */
export function startDemo(): Promise<DemoStarted> {
  started ??= demoCall("start");
  started.catch(() => {
    started = null;
  });
  return started;
}

/** Deletes and reseeds this visitor's world. */
export function resetDemo(): Promise<DemoStarted> {
  started = demoCall("reset");
  return started;
}

export class SaveError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** Saves an Invoice. The server recomputes every total, so the body carries lines, not figures. */
export async function createInvoice(body: unknown): Promise<{ invoiceId: string }> {
  const jwt = await sessionJwt();
  const res = await fetch(`${SERVER_URL}/api/invoices`, {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as { error?: string; invoice?: { $id?: string } } | null;
  if (!res.ok || !data?.invoice?.$id) throw new SaveError(data?.error ?? "save_failed");
  return { invoiceId: data.invoice.$id };
}

export type ImportReport = { already: number; added: number; summary: string };

async function authed(path: string, body: unknown): Promise<unknown> {
  const jwt = await sessionJwt();
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
  if (!res.ok) throw new SaveError(data?.message ?? data?.error ?? "save_failed");
  return data;
}

/** Import statement 2, or a CSV. The summary is "N already imported, N new". */
export async function importBank(body: { sample?: true; csv?: string }): Promise<ImportReport> {
  const data = (await authed("/api/bank/import", body)) as Partial<ImportReport> | null;
  if (!data || typeof data.summary !== "string" || typeof data.already !== "number" || typeof data.added !== "number") {
    throw new SaveError("import_failed");
  }
  return { already: data.already, added: data.added, summary: data.summary };
}

/**
 * Confirm suggestions. `allExact` confirms every Exact credit and nothing else.
 * `message` says when a credit's suggestion changed since import and was not confirmed.
 */
export async function confirmBank(body: { ids?: string[]; allExact?: boolean }): Promise<{ confirmed: number; message: string | null }> {
  const data = (await authed("/api/bank/confirm", body)) as { confirmed?: number; message?: unknown } | null;
  if (!data || typeof data.confirmed !== "number") throw new SaveError("confirm_failed");
  return { confirmed: data.confirmed, message: typeof data.message === "string" ? data.message : null };
}

export type LiveRow = { $id: string; $tableId: string; workspaceId: string } & Record<string, unknown>;

/**
 * Calls `onChange` for every row of these tables that changes in this
 * workspace. Appwrite only sends rows this visitor can read; the workspace
 * check keeps a second world of the same visitor apart. Returns a stop.
 */
export function watchRows(
  workspaceId: string,
  tableIds: readonly string[],
  onChange: (row: LiveRow, deleted: boolean) => void,
): () => void {
  let subscription: RealtimeSubscription | null = null;
  let stopped = false;
  const channels = tableIds.map((tableId) => Channel.tablesdb(DATABASE_ID).table(tableId).row());
  realtime
    .subscribe(channels, (event) => {
      const row = event.payload as LiveRow | undefined;
      if (!row || row.workspaceId !== workspaceId || !tableIds.includes(row.$tableId)) return;
      onChange(row, event.events.some((name) => name.endsWith(".delete")));
    })
    .then(
      (s) => (stopped ? void s.unsubscribe() : (subscription = s)),
      (e: unknown) => console.error("live updates could not start", e),
    );
  return () => {
    stopped = true;
    void subscription?.unsubscribe();
  };
}

/** The Owner has seen these Inbox items. Row permissions let the Owner update their own. */
export async function markInboxRead(ids: readonly string[]): Promise<void> {
  await Promise.all(
    ids.map((rowId) => db.updateRow({ databaseId: DATABASE_ID, tableId: "inbox", rowId, data: { read: true } })),
  );
}

/** The Owner's "Mark as disputed". The server writes the Invoice, its event and the pause. */
export async function markDisputed(invoiceId: string, reason: string): Promise<void> {
  const jwt = await sessionJwt();
  const res = await fetch(`${SERVER_URL}/api/invoices/${encodeURIComponent(invoiceId)}/dispute`, {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new SaveError(data?.error ?? "save_failed");
}

/** A call to the server as the Owner. Resolves to the JSON answer, whatever the status. */
export async function ownerApi<T>(path: string, init: RequestInit = {}): Promise<{ status: number; data: T | null }> {
  const jwt = await sessionJwt();
  const res = await fetch(`${SERVER_URL}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${jwt}`, ...(init.body ? { "content-type": "application/json" } : {}) },
  });
  return { status: res.status, data: (await res.json().catch(() => null)) as T | null };
}

/** What a Ladder run did, as `/api/ladder/run` answers. */
export type LadderRun = {
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

/** The header's ‹ › stepper: moves the Demo date and runs the daily Ladder for it, as the 10:00 cron does. */
export async function runLadder(date: string): Promise<LadderRun> {
  const data = (await authed("/api/ladder/run", { date })) as Partial<LadderRun> | null;
  if (!data || typeof data.runId !== "string" || typeof data.sent !== "number") throw new SaveError("run_failed");
  return data as LadderRun;
}

/** The Owner sent a ready Reminder from their own phone or mail. */
export async function markReminderSent(body: { invoiceId: string; stage: number; channel: "whatsapp_link" | "email" }) {
  await authed("/api/ladder/sent", body);
}

/** Where reminder emails go, and whether this server can send them at all. */
export async function emailSetup(): Promise<{ demoInbox: string | null; emailReady: boolean }> {
  const { status, data } = await ownerApi<{ demoInbox?: string | null; emailReady?: boolean }>("/api/settings/email");
  if (status !== 200 || !data) throw new SaveError("email_setup_failed");
  return { demoInbox: data.demoInbox ?? null, emailReady: data.emailReady === true };
}

/** Saves some Settings. A refusal names the field it could not use. */
export async function saveSettings(patch: Record<string, unknown>): Promise<{ ok: true } | { ok: false; field: string }> {
  const { status, data } = await ownerApi<{ field?: string }>("/api/settings", { method: "POST", body: JSON.stringify(patch) });
  if (status === 200) return { ok: true };
  if (status === 400 && typeof data?.field === "string") return { ok: false, field: data.field };
  throw new SaveError("save_failed");
}
