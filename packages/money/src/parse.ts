import { toInt } from "./integer.ts";

/** Plain digits, or commas in the Indian (1,18,000) or international (118,000) places only. */
const AMOUNT_PATTERN = /^(\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.(\d+))?$/;

/**
 * A printed amount, as on a UPI screenshot, into paise.
 * Accepts "₹60,000.00", "60000", "Rs. 60,000/-", "60,000.00 INR" and
 * "₹60,000 only". Returns null when the text is not an amount, including
 * commas out of place ("6,0,000") and a comma after the point ("60.000,00").
 * More than two decimal places round half up on the third.
 */
export function parseAmountPaise(printed: string): number | null {
  let text = printed.trim().replace(/₹/g, "").replace(/\s+/g, "");
  text = text
    .replace(/only$/i, "")
    .replace(/\/-$/, "")
    .replace(/^(?:rs\.?|inr)/i, "")
    .replace(/(?:rs\.?|inr)$/i, "");
  const match = AMOUNT_PATTERN.exec(text);
  if (!match) return null;

  const rupeeText = (match[1] ?? "").replace(/,/g, "");
  const frac = match[2] ?? "";
  if (rupeeText.length > 15) return null;

  let rupees = BigInt(rupeeText);
  let paise: bigint;
  if (frac.length <= 2) {
    paise = BigInt(frac.padEnd(2, "0"));
  } else {
    paise = BigInt(frac.slice(0, 2));
    if ((frac[2] ?? "0") >= "5") paise += 1n;
  }
  if (paise >= 100n) {
    rupees += 1n;
    paise -= 100n;
  }
  try {
    return toInt(rupees * 100n + paise, "amount");
  } catch {
    return null;
  }
}
