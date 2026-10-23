// What the Owner reads off a stored proof check. The amount is parsed again from the printed text.
import { PROOF_LABEL, type ProofResultKind } from "@tagada/domain";
import { formatInr, parseAmountPaise } from "@tagada/money";

export function proofAmount(extracted: string | null): string {
  if (!extracted) return "";
  try {
    const parsed = JSON.parse(extracted) as { amountText?: unknown } | null;
    if (!parsed || typeof parsed.amountText !== "string") return "";
    const paise = parseAmountPaise(parsed.amountText);
    return paise === null ? "" : formatInr(paise);
  } catch {
    return "";
  }
}

export function proofTone(result: ProofResultKind | null): "ok" | "warn" | "plain" {
  if (result === "found") return "ok";
  if (result === "amount_mismatch") return "warn";
  return "plain";
}

export function proofLabel(result: ProofResultKind | null): string {
  return result ? PROOF_LABEL[result] : "Not found yet";
}
