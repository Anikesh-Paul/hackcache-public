import { useMemo } from "react";
import type { BankAllocation, BankTxnRow, CashItemRow } from "@tagada/appwrite";
import { todayBook, type BookCredit, type BookPromise, type TodayBook } from "@tagada/domain";
import { DEMO_TODAY } from "@tagada/seed";
import { istDay } from "./pricing.ts";
import { usePaymentHistory, useWorkspaceRows, useWorld } from "./world.tsx";

/** Bank credit rows as the domain reads them: when they came in, and which Invoices a suggested match says are paid. */
export function bankSuggestionsOf(rows: readonly BankTxnRow[]): BookCredit[] {
  return rows.map((t) => ({
    date: t.date,
    amountPaise: t.amountPaise,
    matchStatus: t.matchStatus,
    allocations: t.allocations ? (JSON.parse(t.allocations) as BankAllocation[]) : [],
  }));
}

export type TodayState = { status: "loading" } | { status: "failed" } | { status: "ready"; book: TodayBook };

/**
 * Today's book from the loaded world plus its events, bank credits and cash
 * items. A new Promise in the world (an approved Plan) gives a new book;
 * so does `extra`, an approval the server has not echoed back yet.
 */
export function useTodayBook(extra: BookPromise | null = null): TodayState {
  const world = useWorld();
  const events = usePaymentHistory();
  const credits = useWorkspaceRows<BankTxnRow>("bank_txns", true);
  const cash = useWorkspaceRows<CashItemRow>("cash_items", true);

  return useMemo((): TodayState => {
    if (events === "failed" || credits === "failed" || cash === "failed") return { status: "failed" };
    if (events === "loading" || credits === null || cash === null) return { status: "loading" };
    const promises: BookPromise[] = [...world.promisesByInvoice.entries()].flatMap(([invoiceId, list]) =>
      list.map((p) => ({ invoiceId, ...p })),
    );
    if (extra && !promises.some((p) => p.invoiceId === extra.invoiceId && p.status === "approved")) promises.push(extra);
    return {
      status: "ready",
      book: todayBook({
        today: world.workspace.today,
        openingCashPaise: world.workspace.openingCashPaise ?? 0,
        // The seed counts the opening balance on the day the story starts.
        cashAsOf: DEMO_TODAY,
        customers: [...world.customers.values()],
        invoices: world.invoices,
        promises,
        events: events.map((e) => ({ invoiceId: e.invoiceId, type: e.type, date: istDay(e.at) })),
        bankCredits: bankSuggestionsOf(credits),
        cashItems: cash,
      }),
    };
  }, [world, events, credits, cash, extra]);
}
