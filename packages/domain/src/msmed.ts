import { addDays, section16Interest, type Section16Rest } from "@tagada/money";
import type { InvoiceFacts, InvoiceStanding } from "./invoice.ts";

export type SellerFacts = {
  udyamType: "micro" | "small" | "medium" | "none" | null;
  isTrader: boolean;
};

export type MsmedMeter = {
  /** First day interest runs: the day after the due date. */
  from: string;
  /** The Demo date it is worked out to. */
  to: string;
  principalPaise: number;
  interestPaise: number;
  rests: Section16Rest[];
};

/**
 * MSMED Act §16 interest on what is still owed, compounded monthly at three
 * times the Bank Rate in force each day. Only a micro or small Udyam seller
 * that is not a trader can claim it, and only once the due date has passed.
 */
export function msmedInterest(
  seller: SellerFacts,
  invoice: InvoiceFacts,
  standing: InvoiceStanding,
  today: string,
): MsmedMeter | null {
  if (seller.isTrader || (seller.udyamType !== "micro" && seller.udyamType !== "small")) return null;
  if (standing.state === "paid" || standing.daysLate === 0 || standing.balancePaise <= 0) return null;
  const from = addDays(invoice.dueDate, 1);
  const { interestPaise, rests } = section16Interest({ principalPaise: standing.balancePaise, from, to: today });
  return { from, to: today, principalPaise: standing.balancePaise, interestPaise, rests };
}
