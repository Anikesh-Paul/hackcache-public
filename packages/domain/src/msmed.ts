import { addDays, section16Interest, type Section16Rest } from "@tagada/money";
import type { InvoiceFacts, InvoiceStanding } from "./invoice.ts";

export type SellerFacts = {
  udyamType: "micro" | "small" | "medium" | "none" | null;
  isTrader: boolean;
};

export type MsmedMeter = {
  /** First day interest runs: the day after the appointed day. */
  from: string;
  /** The Demo date it is worked out to. */
  to: string;
  principalPaise: number;
  interestPaise: number;
  rests: Section16Rest[];
};

/** §15 caps agreed credit at 45 days, so longer terms do not put the interest off. */
export const MSMED_MAX_CREDIT_DAYS = 45;

/** The due date, or 45 days after the Invoice date when the agreed terms run longer. */
export function appointedDay(invoice: { dueDate: string; issueDate: string }): string {
  const latest = addDays(invoice.issueDate, MSMED_MAX_CREDIT_DAYS);
  return invoice.dueDate < latest ? invoice.dueDate : latest;
}

/**
 * MSMED Act §16 interest on what is still owed, compounded monthly at three
 * times the Bank Rate in force each day. Only a micro or small Udyam seller
 * that is not a trader can claim it, and only once the appointed day has passed.
 */
export function msmedInterest(
  seller: SellerFacts,
  invoice: InvoiceFacts & { issueDate: string },
  standing: InvoiceStanding,
  today: string,
): MsmedMeter | null {
  if (seller.isTrader || (seller.udyamType !== "micro" && seller.udyamType !== "small")) return null;
  if (standing.state === "paid" || standing.balancePaise <= 0) return null;
  const appointed = appointedDay(invoice);
  if (today <= appointed) return null;
  const from = addDays(appointed, 1);
  const { interestPaise, rests } = section16Interest({ principalPaise: standing.balancePaise, from, to: today });
  return { from, to: today, principalPaise: standing.balancePaise, interestPaise, rests };
}
