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
