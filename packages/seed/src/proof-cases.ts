// The forecast headline /proof shows, computed from the seeded books by the
// same domain code Today uses. Expected text is the spec literal.
import { todayBook, type BookInput, type BookPromise, type BriefRow, type TodayBook } from "@tagada/domain";
import { formatInr } from "@tagada/money";
import { seedWorld } from "./index.ts";

const world = seedWorld({ workspaceId: "wproof0000000000000001", ownerUserId: "proof0000000000000001" });
const [workspace] = world.workspaces;

function bookInput(promises: BookPromise[]): BookInput {
  return {
    today: workspace!.today,
    openingCashPaise: workspace!.openingCashPaise ?? 0,
    customers: world.customers,
    invoices: world.invoices,
    promises,
    events: world.events.map((event) => ({ invoiceId: event.invoiceId, type: event.type, date: event.at.slice(0, 10) })),
    bankCredits: world.bank_txns.map((txn) => ({
      matchStatus: txn.matchStatus,
      allocations: txn.allocations ? (JSON.parse(txn.allocations) as BookInput["bankCredits"][number]["allocations"]) : [],
    })),
    cashItems: world.cash_items,
  };
}

function headline(book: TodayBook): string {
  const salary = book.salary;
  if (!salary) return "No salary day in the next 13 weeks";
  if (salary.cashAfterPaise < 0) {
    const days = salary.daysAway === 1 ? "day" : "days";
    return `Salary day in ${salary.daysAway} ${days}, ${formatInr(-salary.cashAfterPaise)} short`;
  }
  return `Salary covered, ${formatInr(salary.cashAfterPaise)} spare`;
}

function row(id: string, input: string, expected: string, actual: string): BriefRow {
  return { id, area: "Forecast", input, expected, actual, pass: actual === expected };
}

/** Salary-day headline before Gupta's Plan, and after the ₹60,000 instalment is approved. */
export function runForecastCases(): BriefRow[] {
  const seeded: BookPromise[] = world.promises.map((promise) => ({
    invoiceId: promise.invoiceId,
    status: promise.status,
    instalments: JSON.parse(promise.instalments) as BookPromise["instalments"],
  }));
  const gupta = world.invoices.find((invoice) => invoice.totalPaise === 11_800_000 && invoice.status === "sent");
  const before = todayBook(bookInput(seeded));
  const after = todayBook(
    bookInput([
      ...seeded,
      {
        invoiceId: gupta?.$id ?? "",
        status: "approved",
        instalments: [
          { amountPaise: 6_000_000, date: "2026-11-06" },
          { amountPaise: 5_800_000, date: "2026-12-02" },
        ],
      },
    ]),
  );
  return [
    row(
      "forecast-short",
      "Seeded books on Mon 2 Nov 2026, before Gupta Traders' Plan",
      "Salary day in 8 days, ₹48,000 short",
      headline(before),
    ),
    row(
      "forecast-spare",
      "The same books once Gupta Traders' ₹60,000 on Fri 6 Nov is approved",
      "Salary covered, ₹12,000 spare",
      headline(after),
    ),
  ];
}
