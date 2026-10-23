import { divRound, requireInt } from "./integer.ts";

/** Indian grouping. Paise show only when the amount is not a whole rupee, or when asked. */
export function formatInr(paise: number, options?: { signed?: boolean }): string {
  const value = requireInt(paise, "paise");
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const rupees = abs / 100n;
  const rem = abs % 100n;
  const grouped = new Intl.NumberFormat("en-IN").format(Number(rupees));
  const body = rem === 0n ? grouped : `${grouped}.${rem.toString().padStart(2, "0")}`;
  const sign = neg ? "−" : options?.signed && value > 0n ? "+" : "";
  return `${sign}₹${body}`;
}

/** The amount as a form field shows it: 18000 → "180", 18050 → "180.50". No ₹ sign or grouping. */
export function formatAmountInput(paise: number): string {
  const value = requireInt(paise, "paise");
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const rem = abs % 100n;
  const body = rem === 0n ? (abs / 100n).toString() : `${abs / 100n}.${rem.toString().padStart(2, "0")}`;
  return `${neg ? "-" : ""}${body}`;
}

/** A chart label: "₹48k" under a lakh, "₹3.9L" from a lakh, whole rupees below ₹1,000. */
export function formatInrShort(paise: number): string {
  const value = requireInt(paise, "paise");
  const sign = value < 0n ? "−" : "";
  const abs = value < 0n ? -value : value;
  if (abs >= 10_000_000n) {
    const tenths = divRound(abs, 1_000_000n);
    const frac = tenths % 10n;
    return `${sign}₹${tenths / 10n}${frac === 0n ? "" : `.${frac}`}L`;
  }
  if (abs >= 100_000n) return `${sign}₹${divRound(abs, 100_000n)}k`;
  return `${sign}₹${divRound(abs, 100n)}`;
}

/** 1650 → "16.5%", 1725 → "17.25%", 1800 → "18%". */
export function formatRateBps(bps: number): string {
  const value = requireInt(bps, "bps");
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const whole = (abs / 100n).toString();
  const frac = (abs % 100n).toString().padStart(2, "0").replace(/0+$/, "");
  return `${neg ? "−" : ""}${frac ? `${whole}.${frac}` : whole}%`;
}
