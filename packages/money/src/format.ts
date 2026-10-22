import { requireInt } from "./integer.ts";

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

/** 1650 → "16.5%", 1725 → "17.25%", 1800 → "18%". */
export function formatRateBps(bps: number): string {
  const value = requireInt(bps, "bps");
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const whole = (abs / 100n).toString();
  const frac = (abs % 100n).toString().padStart(2, "0").replace(/0+$/, "");
  return `${neg ? "−" : ""}${frac ? `${whole}.${frac}` : whole}%`;
}
