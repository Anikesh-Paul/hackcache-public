import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CustomerRow, EventRow, InboxRow, InvoiceRow, PromiseRow, ReminderRow, WorkspaceRow } from "@tagada/appwrite";
import { invoiceStanding, type InvoiceStanding, type PromiseFacts } from "@tagada/domain";
import { resetDemo, rowsOf, startDemo, watchRows, type DemoStarted, type LiveRow } from "./appwrite.ts";

export type World = {
  workspace: WorkspaceRow;
  customers: Map<string, CustomerRow>;
  invoices: InvoiceRow[];
  promises: PromiseRow[];
  promisesByInvoice: Map<string, PromiseFacts[]>;
  /** Changes on every load or reset, not on live updates: rows read on demand are read again only then. */
  generation: number;
};

type WorldState = { status: "loading" } | { status: "error"; failed: "open" | "reset" } | { status: "ready"; world: World };

/** Payment history for grades. "loading" until the seed's events have been read. */
export type PaymentHistory = EventRow[] | "loading" | "failed";

/** What Customers did on the pay link, kept live. */
export type InboxState = InboxRow[] | "loading" | "failed";

/** The Ladder's Reminders, kept live. */
export type RemindersState = ReminderRow[] | "loading" | "failed";

type WorldContext = WorldState & {
  reset: () => Promise<void>;
  retry: () => void;
  /** Reads the world again, including rows saved after the page opened. */
  reload: () => Promise<void>;
  /** One load for every screen, retried while a fresh seed is still writing events. Kept live. */
  events: PaymentHistory;
  inbox: InboxState;
  reminders: RemindersState;
};

const Ctx = createContext<WorldContext | null>(null);

type FirstLoad = Extract<DemoStarted, { seeded: true }>["world"];

async function readWorld(workspaceId: string): Promise<FirstLoad> {
  const [workspaces, customers, invoices, promises] = await Promise.all([
    rowsOf<WorkspaceRow>("workspaces", workspaceId),
    rowsOf<CustomerRow>("customers", workspaceId),
    rowsOf<InvoiceRow>("invoices", workspaceId),
    rowsOf<PromiseRow>("promises", workspaceId),
  ]);
  return { workspaces, customers, invoices, promises };
}

function byInvoice(promises: readonly PromiseRow[]): Map<string, PromiseFacts[]> {
  const out = new Map<string, PromiseFacts[]>();
  for (const p of promises) {
    const list = out.get(p.invoiceId) ?? [];
    list.push({ status: p.status, instalments: JSON.parse(p.instalments) as PromiseFacts["instalments"] });
    out.set(p.invoiceId, list);
  }
  return out;
}

let generations = 0;
/** Seed answers already loaded. `startDemo` hands the same answer to every later mount, which must read afresh. */
const loaded = new WeakSet<DemoStarted>();

/**
 * The rows a fresh seed handed back, the first time. After that a read of the
 * visitor's world, so pages opened again (after the pay link, say) see what
 * changed since; the seed's rows still stand in while the seed is being
 * written, which ends with the workspace row.
 */
async function loadWorld(started: DemoStarted): Promise<World> {
  let rows: FirstLoad;
  if (started.seeded && !loaded.has(started)) rows = started.world;
  else {
    rows = await readWorld(started.workspaceId);
    if (started.seeded && rows.workspaces.length === 0) rows = started.world;
  }
  loaded.add(started);
  const { workspaces, customers, invoices, promises } = rows;
  const [workspace] = workspaces;
  if (!workspace) throw new Error("This Demo world is still being set up.");
  return {
    workspace,
    customers: new Map(customers.map((c) => [c.$id, c])),
    invoices,
    promises,
    promisesByInvoice: byInvoice(promises),
    generation: ++generations,
  };
}

/** Puts a live row in place of the one with its ID, or adds it; removes it when deleted. */
function upsert<T extends { $id: string }>(rows: readonly T[], row: T, deleted: boolean): T[] {
  const rest = rows.filter((r) => r.$id !== row.$id);
  if (deleted) return rest;
  return rows.length === rest.length ? [...rows, row] : rows.map((r) => (r.$id === row.$id ? row : r));
}

/** Rows read once, with any that arrived live while the read was on its way. */
function merge<T extends { $id: string }>(read: readonly T[], live: readonly T[]): T[] {
  return live.reduce((rows, row) => upsert(rows, row, false), [...read]);
}

/**
 * The Owner's world with one live change applied: the workspace (a new Demo
 * date, from the stepper or the tour) and the Customers, Invoices and Promises the screens keep in memory.
 */
function applyLive(world: World, row: LiveRow, deleted: boolean): World {
  if (row.$tableId === "workspaces") {
    return deleted || row.$id !== world.workspace.$id ? world : { ...world, workspace: row as unknown as WorkspaceRow };
  }
  if (row.$tableId === "customers") {
    const customers = new Map(world.customers);
    if (deleted) customers.delete(row.$id);
    else customers.set(row.$id, row as unknown as CustomerRow);
    return { ...world, customers };
  }
  if (row.$tableId === "invoices") {
    return { ...world, invoices: upsert(world.invoices, row as unknown as InvoiceRow, deleted) };
  }
  if (row.$tableId === "promises") {
    const promises = upsert(world.promises, row as unknown as PromiseRow, deleted);
    return { ...world, promises, promisesByInvoice: byInvoice(promises) };
  }
  return world;
}

/** Starts (or reuses) the visitor's anonymous session and Demo world, then loads it. */
export function WorldProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorldState>({ status: "loading" });
  const [events, setEvents] = useState<PaymentHistory>("loading");
  const [inbox, setInbox] = useState<InboxState>("loading");
  const [reminders, setReminders] = useState<RemindersState>("loading");
  // Rows that arrived live, laid over the rows read once (and kept apart while that read is on its way).
  const [liveEvents, setLiveEvents] = useState<EventRow[]>([]);
  const [liveInbox, setLiveInbox] = useState<InboxRow[]>([]);
  const [liveReminders, setLiveReminders] = useState<ReminderRow[]>([]);
  const [attempt, setAttempt] = useState(0);
  const world = state.status === "ready" ? state.world : null;
  const workspaceId = world?.workspace.$id;
  const generation = world?.generation;

  useEffect(() => {
    let live = true;
    startDemo()
      .then(loadWorld)
      .then(
        (world) => live && setState({ status: "ready", world }),
        (e: unknown) => {
          console.error("Demo world failed to load", e);
          if (live) setState({ status: "error", failed: "open" });
        },
      );
    return () => {
      live = false;
    };
  }, [attempt]);

  useEffect(() => {
    if (!workspaceId) return;
    let live = true;
    setEvents("loading");
    const load = async () => {
      for (let attempt = 1; ; attempt++) {
        const found = await rowsOf<EventRow>("events", workspaceId);
        if (found.length > 0 || attempt >= 6) return found;
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (!live) return found;
      }
    };
    load().then(
      (found) => live && setEvents(found),
      (e: unknown) => {
        console.error("events failed to load", e);
        if (live) setEvents("failed");
      },
    );
    return () => {
      live = false;
    };
  }, [workspaceId, generation]);

  useEffect(() => {
    if (!workspaceId) return;
    let live = true;
    setInbox("loading");
    rowsOf<InboxRow>("inbox", workspaceId).then(
      (found) => live && setInbox(found),
      (e: unknown) => {
        console.error("inbox failed to load", e);
        if (live) setInbox("failed");
      },
    );
    return () => {
      live = false;
    };
  }, [workspaceId, generation]);

  useEffect(() => {
    if (!workspaceId) return;
    let live = true;
    setReminders("loading");
    rowsOf<ReminderRow>("reminders", workspaceId).then(
      (found) => live && setReminders(found),
      (e: unknown) => {
        console.error("reminders failed to load", e);
        if (live) setReminders("failed");
      },
    );
    return () => {
      live = false;
    };
  }, [workspaceId, generation]);

  // Pay-link actions reach the Owner's screens here, in well under a second.
  useEffect(() => {
    if (!workspaceId) return;
    setLiveEvents([]);
    setLiveInbox([]);
    setLiveReminders([]);
    return watchRows(workspaceId, ["workspaces", "inbox", "events", "customers", "invoices", "promises", "reminders"], (row, deleted) => {
      if (row.$tableId === "inbox") {
        setLiveInbox((now) => upsert(now, row as unknown as InboxRow, deleted));
      } else if (row.$tableId === "reminders") {
        setLiveReminders((now) => upsert(now, row as unknown as ReminderRow, deleted));
      } else if (row.$tableId === "events") {
        setLiveEvents((now) => upsert(now, row as unknown as EventRow, deleted));
      } else {
        setState((now) => (now.status === "ready" ? { ...now, world: applyLive(now.world, row, deleted) } : now));
      }
    });
  }, [workspaceId, generation]);

  const reset = useCallback(async () => {
    setEvents("loading");
    setInbox("loading");
    setState({ status: "loading" });
    try {
      setState({ status: "ready", world: await loadWorld(await resetDemo()) });
    } catch (e) {
      console.error("Reset failed", e);
      setState({ status: "error", failed: "reset" });
    }
  }, []);
  const retry = useCallback(() => {
    setEvents("loading");
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  const reload = useCallback(async () => {
    setEvents("loading");
    const started = await startDemo();
    setState({ status: "ready", world: await loadWorld({ workspaceId: started.workspaceId, seeded: false }) });
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      reset,
      retry,
      reload,
      events: Array.isArray(events) ? merge(events, liveEvents) : events,
      inbox: Array.isArray(inbox) ? merge(inbox, liveInbox) : inbox,
      reminders: Array.isArray(reminders) ? merge(reminders, liveReminders) : reminders,
    }),
    [state, reset, retry, reload, events, inbox, reminders, liveEvents, liveInbox, liveReminders],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorldState(): WorldContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorldState needs a WorldProvider");
  return ctx;
}

/** Events for every Customer screen. Loading until the world, and its history, are in. */
export function usePaymentHistory(): PaymentHistory {
  const ctx = useWorldState();
  if (ctx.status !== "ready") return "loading";
  return ctx.events;
}

/** The Inbox, live. "loading" until read. */
export function useInbox(): InboxState {
  const ctx = useWorldState();
  return ctx.status === "ready" ? ctx.inbox : "loading";
}

/** The Ladder's Reminders, live. "loading" until read. */
export function useReminders(): RemindersState {
  const ctx = useWorldState();
  return ctx.status === "ready" ? ctx.reminders : "loading";
}

/** The loaded world. Only call under <WorldGate>. */
export function useWorld(): World {
  const ctx = useWorldState();
  if (ctx.status !== "ready") throw new Error("useWorld before the world loaded");
  return ctx.world;
}

export type InvoiceView = { invoice: InvoiceRow; customer: CustomerRow | undefined; standing: InvoiceStanding };

export function viewOf(world: World, invoice: InvoiceRow): InvoiceView {
  return {
    invoice,
    customer: world.customers.get(invoice.customerId),
    standing: invoiceStanding(invoice, world.promisesByInvoice.get(invoice.$id) ?? [], world.workspace.today),
  };
}

/**
 * Rows that hang off one Invoice (its lines), loaded on demand: null while
 * loading. Every Invoice has lines, so an empty answer means a fresh world is
 * still being written; it is asked again a few times.
 */
export function useInvoiceRows<T>(tableId: string, invoiceId: string | undefined) {
  const state = useWorldState();
  // A new load (first load, or after Reset demo) reads the rows again; a live update does not.
  const workspaceId = state.status === "ready" ? state.world.workspace.$id : null;
  const generation = state.status === "ready" ? state.world.generation : null;
  const [rows, setRows] = useState<T[] | "failed" | null>(null);
  useEffect(() => {
    if (!workspaceId || !invoiceId) return;
    let live = true;
    setRows(null);
    const load = async () => {
      for (let attempt = 1; ; attempt++) {
        const found = await rowsOf<T>(tableId, workspaceId, { invoiceId });
        if (found.length > 0 || attempt >= 6) return found;
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (!live) return found;
      }
    };
    load().then(
      (r) => live && setRows(r.length > 0 ? r : "failed"),
      (e: unknown) => {
        console.error(`${tableId} failed to load`, e);
        if (live) setRows("failed");
      },
    );
    return () => {
      live = false;
    };
  }, [tableId, workspaceId, generation, invoiceId]);
  return rows;
}

/**
 * Every row of one workspace table. Null while loading. An empty table is a
 * real answer, unless `seeded`: then it is asked again a few times, since a
 * fresh world writes the table a moment after the first screens.
 */
export function useWorkspaceRows<T>(tableId: string, seeded = false): T[] | "failed" | null {
  const state = useWorldState();
  const workspaceId = state.status === "ready" ? state.world.workspace.$id : null;
  const generation = state.status === "ready" ? state.world.generation : null;
  const [rows, setRows] = useState<T[] | "failed" | null>(null);
  useEffect(() => {
    if (!workspaceId) return;
    let live = true;
    setRows(null);
    const load = async () => {
      for (let attempt = 1; ; attempt++) {
        const found = await rowsOf<T>(tableId, workspaceId);
        if (!seeded || found.length > 0 || attempt >= 6) return found;
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (!live) return found;
      }
    };
    load().then(
      (found) => live && setRows(found),
      (e: unknown) => {
        console.error(`${tableId} failed to load`, e);
        if (live) setRows("failed");
      },
    );
    return () => {
      live = false;
    };
  }, [tableId, workspaceId, generation, seeded]);
  return rows;
}
