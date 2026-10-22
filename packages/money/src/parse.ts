import { toInt } from "./integer.ts";

/**
 * A printed amount, as on a UPI screenshot, into paise.
 * Accepts "₹60,000.00", "60000" and "Rs. 60,000/-". Returns null when the
 * text is not an amount. More than two decimal places round half up.
 */
export function parseAmountPaise(printed: string): number | null {
  let text = printed.trim().replace(/₹/g, "").replace(/,/g, "").replace(/\s+/g, "");
  text = text.replace(/\/-$/, "").replace(/^(?:rs\.?|inr)/i, "");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;

  const [rupeeText, frac = ""] = text.split(".");
  if (rupeeText === undefined || rupeeText.length > 15) return null;

  let rupees = BigInt(rupeeText);
  let paise: bigint;
  if (frac.length <= 2) {
    paise = BigInt(frac.padEnd(2, "0") || "0");
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
