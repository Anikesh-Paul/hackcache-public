// Bank credit rows as stored (allocations are a JSON string), read for the
// domain. Shared by the Bank page's server code, the daily Ladder and the pay link.
import type { BankAllocation } from "@tagada/appwrite";
import type { BankSuggestion } from "@tagada/domain";
import type { StoredRow } from "./demo.ts";

/** A stored JSON column, parsed; null when it does not parse. A value already parsed passes through. */
export function readJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

/** The Bank credits as the domain reads them: which Invoices a suggested match says are paid. */
export function bankSuggestions(bank: readonly StoredRow[]): BankSuggestion[] {
  return bank.map((credit) => ({
    ...(Number.isSafeInteger(credit.amountPaise) ? { amountPaise: credit.amountPaise as number } : {}),
    matchStatus: credit.matchStatus === "suggested" || credit.matchStatus === "confirmed" ? credit.matchStatus : "unmatched",
    allocations: allocationsOf(credit.allocations),
  }));
}

export function allocationsOf(value: unknown): BankAllocation[] {
  const parsed = readJson(value);
  if (!Array.isArray(parsed)) return [];
  const out: BankAllocation[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.invoiceId !== "string" || !Number.isSafeInteger(row.amountPaise)) continue;
    const allocation: BankAllocation = { invoiceId: row.invoiceId, amountPaise: row.amountPaise as number };
    if (Number.isSafeInteger(row.tdsPaise)) allocation.tdsPaise = row.tdsPaise as number;
    out.push(allocation);
  }
  return out;
}
