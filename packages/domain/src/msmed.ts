import { addDays, financialYear, isCivilDate, section16Interest, type Section16Rest } from "@tagada/money";
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

export type DeductionClock = {
  /** The MSMED §15 appointed day: paid by then, Section 43B(h) does not apply. */
  appointed: string;
  /** Paid by this day, the buyer may claim the bill as an expense in `claimYear`. */
  claimBy: string;
  /** The financial year, as "26-27". */
  claimYear: string;
  /** True while the Invoice's own year can still be kept; false once the claim has moved to the year it is paid. */
  sameYear: boolean;
};

/** 31 March closing the financial year that `iso` falls in. */
function yearEnd(iso: string): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  return `${month >= 4 ? year + 1 : year}-03-31`;
}

/**
 * Income Tax Act §43B(h): a buyer may deduct what they owe a micro or small
 * enterprise in the year of the Invoice only when they pay by the MSMED §15
 * appointed day; paid later, only in the year they pay. Paid by 31 March of
 * the Invoice's year, the year is the same either way. The test for who is
 * covered is the same as for §16 interest. The agreed due date is taken as
 * written; with no written agreement §15 allows only 15 days.
 */
export function section43bh(
  seller: SellerFacts,
  invoice: { dueDate: string; issueDate: string },
  today: string,
): DeductionClock | null {
  if (seller.isTrader || (seller.udyamType !== "micro" && seller.udyamType !== "small")) return null;
  if (!isCivilDate(invoice.issueDate) || !isCivilDate(invoice.dueDate)) return null;
  const appointed = appointedDay(invoice);
  const ownYearEnd = yearEnd(invoice.issueDate);
  const keepBy = appointed > ownYearEnd ? appointed : ownYearEnd;
  if (today <= keepBy) return { appointed, claimBy: keepBy, claimYear: financialYear(invoice.issueDate), sameYear: true };
  return { appointed, claimBy: yearEnd(today), claimYear: financialYear(today), sameYear: false };
}
