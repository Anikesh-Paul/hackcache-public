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
