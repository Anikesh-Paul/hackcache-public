import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CustomerRow, InvoiceRow, PromiseRow, WorkspaceRow } from "@tagada/appwrite";
import { invoiceStanding, type InvoiceStanding, type PromiseFacts } from "@tagada/domain";
import { resetDemo, rowsOf, startDemo, type DemoStarted } from "./appwrite.ts";

export type World = {
  workspace: WorkspaceRow;
  customers: Map<string, CustomerRow>;
  invoices: InvoiceRow[];
  promisesByInvoice: Map<string, PromiseFacts[]>;
};

type WorldState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; world: World };

type WorldContext = WorldState & { reset: () => Promise<void>; retry: () => void };

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
  const [attempt, setAttempt] = useState(0);

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

  const reset = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", world: await loadWorld(await resetDemo()) });
    } catch (e) {
      console.error("Reset failed", e);
      setState({ status: "error", message: "The demo could not be reset." });
    }
  }, []);
  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  const value = useMemo(() => ({ ...state, reset, retry }), [state, reset, retry]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorldState(): WorldContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorldState needs a WorldProvider");
  return ctx;
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

/** Rows that hang off one Invoice (its lines, its events), loaded on demand: null while loading. */
export function useInvoiceRows<T>(tableId: string, invoiceId: string | undefined) {
  const state = useWorldState();
  // A new world object (first load, or after Reset demo) loads the rows again.
  const world = state.status === "ready" ? state.world : null;
  const [rows, setRows] = useState<T[] | "failed" | null>(null);
  useEffect(() => {
    if (!world || !invoiceId) return;
    let live = true;
    setRows(null);
    rowsOf<T>(tableId, world.workspace.$id, { invoiceId }).then(
      (r) => live && setRows(r),
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
