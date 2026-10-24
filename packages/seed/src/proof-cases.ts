// The forecast headline /proof shows, computed from the seeded books by the
// same domain code Today uses. Expected text is the spec literal.
import { salaryDayIn, todayBook, type BookInput, type BookPromise, type BriefRow, type TodayBook } from "@tagada/domain";
import { formatInr } from "@tagada/money";
import { GUPTA_PLAN, seedWorld } from "./index.ts";

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
  if (salary.cashAfterPaise < 0) return `${salaryDayIn(salary.daysAway)}, ${formatInr(-salary.cashAfterPaise)} short`;
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
        instalments: [...GUPTA_PLAN],
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
      "The same books once Gupta Traders' Plan of ₹60,000 by Fri 6 Nov and ₹58,000 by Wed 2 Dec is approved",
      "Salary covered, ₹12,000 spare",
      headline(after),
    ),
  ];
}
