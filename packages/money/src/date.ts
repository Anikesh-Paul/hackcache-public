// Civil dates (YYYY-MM-DD) with no time zone. Calendar arithmetic, not money.

export type CivilDate = { year: number; month: number; day: number };

function div(n: number, by: number): number {
  return Number(BigInt(n) / BigInt(by));
}

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

export function parseCivilDate(iso: string): CivilDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function formatCivilDate({ year, month, day }: CivilDate): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** The same calendar day, `months` later. A day that does not exist is clamped. */
export function addMonths(iso: string, months: number): string {
  const date = parseCivilDate(iso);
  if (!date || !Number.isSafeInteger(months)) throw new Error(`not a date: ${iso}`);
  const index = date.year * 12 + (date.month - 1) + months;
  const year = div(index, 12);
  const month = (index % 12) + 1;
  const day = Math.min(date.day, daysInMonth(year, month));
  return formatCivilDate({ year, month, day });
}

/** Days since 1970-01-01 (Hinnant's days_from_civil). Valid for the positive years an invoice date uses. */
function dayNumber(iso: string): number {
  const date = parseCivilDate(iso);
  if (!date) throw new Error(`not a date: ${iso}`);
  const year = date.month <= 2 ? date.year - 1 : date.year;
  const era = div(year, 400);
  const yearOfEra = year - era * 400;
  const dayOfYear = div(153 * (date.month + (date.month > 2 ? -3 : 9)) + 2, 5) + date.day - 1;
  const dayOfEra = yearOfEra * 365 + div(yearOfEra, 4) - div(yearOfEra, 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** The date `days` after `iso` (before it when negative). */
export function addDays(iso: string, days: number): string {
  if (!Number.isSafeInteger(days)) throw new Error("days must be an integer");
  let n = dayNumber(iso) + days;
  // Inverse of dayNumber (Hinnant's civil_from_days).
  n += 719_468;
  const era = div(n >= 0 ? n : n - 146_096, 146_097);
  const dayOfEra = n - era * 146_097;
  const yearOfEra = div(dayOfEra - div(dayOfEra, 1460) + div(dayOfEra, 36_524) - div(dayOfEra, 146_096), 365);
  const dayOfYear = dayOfEra - (365 * yearOfEra + div(yearOfEra, 4) - div(yearOfEra, 100));
  const mp = div(5 * dayOfYear + 2, 153);
  const day = dayOfYear - div(153 * mp + 2, 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return formatCivilDate({ year, month, day });
}

/** 0 = Sunday … 6 = Saturday. Null when `iso` is not a real date. */
export function weekday(iso: string): number | null {
  const date = parseCivilDate(iso);
  if (!date) return null;
  // Sakamoto. Valid for the positive years an invoice date uses.
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  let year = date.year;
  if (date.month < 3) year -= 1;
  const offset = offsets[date.month - 1];
  if (offset === undefined) return null;
  return (year + div(year, 4) - div(year, 100) + div(year, 400) + offset + date.day) % 7;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-25" → "Fri 25 Sep"; with `year`, "Fri 25 Sep 2026". Fixed English, never the locale's. */
export function formatDate(iso: string, options?: { weekday?: boolean; year?: boolean }): string {
  const date = parseCivilDate(iso);
  if (!date) throw new Error(`not a date: ${iso}`);
  const parts = [`${date.day} ${MONTHS[date.month - 1]}`];
  if (options?.weekday ?? true) parts.unshift(WEEKDAYS[weekday(iso) ?? 0] ?? "");
  if (options?.year) parts.push(String(date.year));
  return parts.join(" ");
}
