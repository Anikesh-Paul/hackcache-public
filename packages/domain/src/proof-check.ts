// A UPI screenshot checked against Bank credits. The model returns the amount
// as printed text; only `money` turns that text into paise.
import { daysBetween, parseAmountPaise } from "@tagada/money";
import { printedDate } from "./printed-date.ts";

export type ProofExtract = {
  utr: string;
  /** As printed. Never a number the model computed. */
  amountText: string;
  dateText: string;
  payeeVpa: string;
  confidence: number;
};

export type ProofResultKind = "found" | "not_found_yet" | "amount_mismatch";

export const PROOF_LABEL: Record<ProofResultKind, string> = {
  found: "Matched ✓",
  not_found_yet: "Not found yet",
  amount_mismatch: "Amount differs",
};

export type ProofView = {
  result: ProofResultKind;
  label: string;
  /** Paise from `amountText`, or null when the text is not an amount. */
  amountPaise: number | null;
  note: string;
};

export type ProofCredit = {
  utr: string | null;
  amountPaise: number;
  /** Already confirmed against this Invoice, so its amount is no longer in the open balance. */
  confirmedHere?: boolean;
};

const UTR_OK = /^(?:\d{12}|[A-Z]{4}[A-Z0-9][A-Z0-9]{5,18})$/;

function view(result: ProofResultKind, amountPaise: number | null, note: string): ProofView {
  return { result, label: PROOF_LABEL[result], amountPaise, note };
}

/** The model's JSON object, or null when the amount is not text. A numeric amount is ignored. */
export function proofFromModel(value: unknown): ProofExtract | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.utr !== "string" || typeof row.amountText !== "string" || !row.amountText.trim()) return null;
  return {
    utr: row.utr.trim(),
    amountText: row.amountText.trim(),
    dateText: typeof row.dateText === "string" ? row.dateText.trim() : "",
    payeeVpa: typeof row.payeeVpa === "string" ? row.payeeVpa.trim() : "",
    confidence: typeof row.confidence === "number" && Number.isFinite(row.confidence) ? row.confidence : 0,
  };
}

/**
 * The bank line a screenshot was checked against: the credit with the same UTR,
 * whether or not the amount agrees. Null when that UTR is not in the statement.
 */
export function proofBankLine<T extends ProofCredit>(extracted: Pick<ProofExtract, "utr">, credits: readonly T[]): T | null {
  if (!utrOk(extracted.utr)) return null;
  const utr = normalUtr(extracted.utr);
  return credits.find((credit) => normalUtr(credit.utr ?? "") === utr) ?? null;
}

/** Spaces and hyphens are not part of a UTR. "6098 1234 5678" is the same as "609812345678". */
export function normalUtr(utr: string): string {
  return utr.trim().toUpperCase().replace(/[\s-]/g, "");
}

function utrOk(utr: string): boolean {
  return UTR_OK.test(normalUtr(utr));
}

/**
 * Found, not found yet, or amount differs.
 * The amount must equal the open balance or be part of it, the date must not
 * be after the Demo date, and the UTR must be on a Bank credit of that amount.
 */
export function checkProof(input: {
  extracted: ProofExtract;
  /** The Demo date. */
  today: string;
  balancePaise: number;
  credits: readonly ProofCredit[];
}): ProofView {
  const amountPaise = parseAmountPaise(input.extracted.amountText);
  if (amountPaise === null) {
    return view("amount_mismatch", null, "The amount on the screenshot could not be read as money.");
  }
  if (amountPaise <= 0) {
    return view("amount_mismatch", amountPaise, "The amount on the screenshot is not a payment.");
  }
  // A screenshot sent after its credit was confirmed is not "more than owed": that credit is why less is owed.
  const alreadyIn = input.credits.some(
    (credit) =>
      credit.confirmedHere === true &&
      credit.amountPaise === amountPaise &&
      normalUtr(credit.utr ?? "") === normalUtr(input.extracted.utr),
  );
  if (amountPaise > input.balancePaise && !alreadyIn) {
    return view("amount_mismatch", amountPaise, "The amount on the screenshot is more than what is still owed on this Invoice.");
  }
  const date = printedDate(input.extracted.dateText);
  if (!date) {
    return view("not_found_yet", amountPaise, "The date on the screenshot could not be read, so it is not confirmed yet.");
  }
  if (daysBetween(input.today, date) > 0) {
    return view("not_found_yet", amountPaise, "The date on the screenshot is after today, so it is not in the statement yet.");
  }
  const utr = normalUtr(input.extracted.utr);
  if (!utrOk(input.extracted.utr)) {
    return view("not_found_yet", amountPaise, "No UTR on the screenshot to look up in the bank statement yet.");
  }
  const same = input.credits.filter((credit) => normalUtr(credit.utr ?? "") === utr);
  if (same.length === 0) {
    return view("not_found_yet", amountPaise, "This UTR is not in the bank statement yet.");
  }
  if (!same.some((credit) => credit.amountPaise === amountPaise)) {
    return view("amount_mismatch", amountPaise, "The amount on the screenshot is not the amount of that UTR in the bank statement.");
  }
  return view("found", amountPaise, "This UTR is in the bank statement for the same amount.");
}
