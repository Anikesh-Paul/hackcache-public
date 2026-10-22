import { parseCivilDate } from "./date.ts";
import { requireInt } from "./integer.ts";

/** Financial year label for an invoice date. 31 Mar 2026 → "25-26"; 1 Apr 2026 → "26-27". */
export function financialYear(isoDate: string): string {
  const date = parseCivilDate(isoDate);
  if (!date) throw new Error(`not a date: ${isoDate}`);
  const start = date.month >= 4 ? date.year : date.year - 1;
  const yy = (year: number) => String(year % 100).padStart(2, "0");
  return `${yy(start)}-${yy(start + 1)}`;
}

/**
 * FY invoice number, at most 16 characters (Rule 46). The serial is padded to
 * 4 digits when that still fits, which is the `INV/26-27/0012` shape.
 */
export function invoiceNumber(prefix: string, isoDate: string, serial: number): string {
  if (!/^[A-Z0-9]{1,6}$/.test(prefix)) throw new Error("prefix must be 1–6 letters or digits");
  const n = requireInt(serial, "serial");
  if (n < 1n) throw new Error("serial must be a positive integer");
  const stem = `${prefix}/${financialYear(isoDate)}/`;
  const raw = n.toString();
  const padded = raw.padStart(4, "0");
  const number = stem.length + padded.length <= 16 ? stem + padded : stem + raw;
  if (number.length > 16) throw new Error("invoice number exceeds 16 characters");
  return number;
}
