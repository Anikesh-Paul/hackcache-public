// The browser's only link to Appwrite: the endpoint and project ID, never a key.
// The visitor's anonymous session reads their own rows; row permissions do the rest.
import { Account, AppwriteException, Client, Query, TablesDB } from "appwrite";
import { DATABASE_ID, type DemoStarted } from "@tagada/appwrite";

export type { DemoStarted };

const client = new Client()
  .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT)
  .setProject(import.meta.env.VITE_APPWRITE_PROJECT);

const account = new Account(client);
const db = new TablesDB(client);
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
