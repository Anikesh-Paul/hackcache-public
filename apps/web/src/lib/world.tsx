import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CustomerRow, EventRow, InvoiceRow, PromiseRow, WorkspaceRow } from "@tagada/appwrite";
import { invoiceStanding, type InvoiceStanding, type PromiseFacts } from "@tagada/domain";
import { resetDemo, rowsOf, startDemo, type DemoStarted } from "./appwrite.ts";

export type World = {
  workspace: WorkspaceRow;
  customers: Map<string, CustomerRow>;
  invoices: InvoiceRow[];
  promisesByInvoice: Map<string, PromiseFacts[]>;
};

type WorldState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; world: World };

/** Payment history for grades. "loading" until the seed's events have been read. */
export type PaymentHistory = EventRow[] | "loading" | "failed";

type WorldContext = WorldState & {
  reset: () => Promise<void>;
  retry: () => void;
  /** Reads the world again, including rows saved after the page opened. */
  reload: () => Promise<void>;
  /** One load for every screen, retried while a fresh seed is still writing events. */
  events: PaymentHistory;
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

/** The rows a fresh seed handed back, or else a read of the visitor's world. */
async function loadWorld(started: DemoStarted): Promise<World> {
  const rows = started.seeded ? started.world : await readWorld(started.workspaceId);
  const { workspaces, customers, invoices, promises } = rows;
  const [workspace] = workspaces;
  if (!workspace) throw new Error("This Demo world is still being set up.");
  const promisesByInvoice = new Map<string, PromiseFacts[]>();
  for (const p of promises) {
    const list = promisesByInvoice.get(p.invoiceId) ?? [];
    list.push({ status: p.status, instalments: JSON.parse(p.instalments) as PromiseFacts["instalments"] });
    promisesByInvoice.set(p.invoiceId, list);
  }
  return { workspace, customers: new Map(customers.map((c) => [c.$id, c])), invoices, promisesByInvoice };
}

/** Starts (or reuses) the visitor's anonymous session and Demo world, then loads it. */
export function WorldProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorldState>({ status: "loading" });
  const [events, setEvents] = useState<PaymentHistory>("loading");
  const [attempt, setAttempt] = useState(0);
  const world = state.status === "ready" ? state.world : null;

  useEffect(() => {
    let live = true;
    startDemo()
      .then(loadWorld)
      .then(
        (world) => live && setState({ status: "ready", world }),
        (e: unknown) => {
          console.error("Demo world failed to load", e);
          if (live) setState({ status: "error", message: "Your Demo world could not be opened." });
        },
      );
    return () => {
      live = false;
    };
  }, [attempt]);

  useEffect(() => {
    if (!world) return;
    let live = true;
    setEvents("loading");
    const load = async () => {
      for (let attempt = 1; ; attempt++) {
        const found = await rowsOf<EventRow>("events", world.workspace.$id);
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
  }, [world]);

  const reset = useCallback(async () => {
    setEvents("loading");
    setState({ status: "loading" });
    try {
      setState({ status: "ready", world: await loadWorld(await resetDemo()) });
    } catch (e) {
      console.error("Reset failed", e);
      setState({ status: "error", message: "The demo could not be reset." });
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

  const value = useMemo(() => ({ ...state, reset, retry, reload, events }), [state, reset, retry, reload, events]);
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
 * Rows that hang off one Invoice (its lines, its events), loaded on demand:
 * null while loading. Every Invoice has both, so an empty answer means a
 * fresh world is still being written; it is asked again a few times.
 */
export function useInvoiceRows<T>(tableId: string, invoiceId: string | undefined) {
  const state = useWorldState();
  // A new world object (first load, or after Reset demo) loads the rows again.
  const world = state.status === "ready" ? state.world : null;
  const [rows, setRows] = useState<T[] | "failed" | null>(null);
  useEffect(() => {
    if (!world || !invoiceId) return;
    let live = true;
    setRows(null);
    const load = async () => {
      for (let attempt = 1; ; attempt++) {
        const found = await rowsOf<T>(tableId, world.workspace.$id, { invoiceId });
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
  }, [tableId, world, invoiceId]);
  return rows;
}

/**
 * Every row of one workspace table. Null while loading. An empty table is a
 * real answer, unless `seeded`: then it is asked again a few times, since a
 * fresh world writes the table a moment after the first screens.
 */
export function useWorkspaceRows<T>(tableId: string, seeded = false): T[] | "failed" | null {
  const state = useWorldState();
  const world = state.status === "ready" ? state.world : null;
  const [rows, setRows] = useState<T[] | "failed" | null>(null);
  useEffect(() => {
    if (!world) return;
    let live = true;
    setRows(null);
    const load = async () => {
      for (let attempt = 1; ; attempt++) {
        const found = await rowsOf<T>(tableId, world.workspace.$id);
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
  }, [tableId, world, seeded]);
  return rows;
}
