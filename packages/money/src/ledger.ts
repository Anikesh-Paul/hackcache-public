import { divRound, requireInt, toInt } from "./integer.ts";

/** Sum of amounts in paise. */
export function sumPaise(values: readonly number[]): number {
  let total = 0n;
  for (const value of values) total += requireInt(value, "paise");
  return toInt(total, "sum");
}

/** `owed − paid` in paise. Negative when more was paid than owed. */
export function differencePaise(owedPaise: number, paidPaise: number): number {
  return toInt(requireInt(owedPaise, "owedPaise") - requireInt(paidPaise, "paidPaise"), "difference");
}

/** A share of an amount in basis points (200 is 2%), rounded half up to the paisa. */
export function percentOfPaise(paise: number, bps: number): number {
  const amount = requireInt(paise, "paise");
  const rate = requireInt(bps, "bps");
  if (rate < 0n) throw new Error("bps must be ≥ 0");
  return toInt(divRound(amount * rate, 10_000n), "percentage");
}

/** One of `parts` equal shares of an amount, rounded half up to the paisa. */
export function sharePaise(paise: number, parts: number): number {
  const count = requireInt(parts, "parts");
  if (count <= 0n) throw new Error("parts must be at least 1");
  return toInt(divRound(requireInt(paise, "paise"), count), "share");
}

/** The amount to the nearest `stepPaise` (50_000 is ₹500), half away from zero: for an "about" figure. */
export function nearestPaise(paise: number, stepPaise: number): number {
  const step = requireInt(stepPaise, "stepPaise");
  if (step <= 0n) throw new Error("step must be more than ₹0");
  return toInt(divRound(requireInt(paise, "paise"), step) * step, "rounded");
}

/** Paise as the rupee string UPI expects: 11800000 → "118000.00". */
function upiAmount(paise: number): string {
  const value = requireInt(paise, "amountPaise");
  if (value <= 0n) throw new Error("UPI amount must be more than ₹0");
  return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}

/** A `upi://pay` intent (NPCI linking spec) with a fixed amount, for a QR or a button. */
export function upiPayUri(input: { vpa: string; payeeName: string; amountPaise: number; note: string }): string {
  const params = [
    ["pa", input.vpa],
    ["pn", input.payeeName],
    ["am", upiAmount(input.amountPaise)],
    ["cu", "INR"],
    ["tn", input.note],
  ];
  return `upi://pay?${params.map(([k, v]) => `${k}=${encodeURIComponent(v ?? "")}`).join("&")}`;
}
