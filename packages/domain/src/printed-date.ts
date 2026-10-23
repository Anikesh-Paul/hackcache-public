// A date as a bank CSV or a UPI screenshot prints it, as YYYY-MM-DD.
import { isCivilDate } from "@tagada/money";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function monthNumber(name: string): string | null {
  const index = MONTHS.findIndex((month) => name.toLowerCase().startsWith(month));
  return index < 0 ? null : String(index + 1);
}

function civil(year: string, month: string | null, day: string): string | null {
  if (!month) return null;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return isCivilDate(iso) ? iso : null;
}

/** ISO, day-first, or "1 Nov 2026" / "Nov 1, 2026". A trailing clock time is ignored. */
export function printedDate(raw: string): string | null {
  const text = raw
    .trim()
    .replace(/,?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?$/i, "")
    .trim();
  if (isCivilDate(text)) return text;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (dmy?.[1] && dmy[2] && dmy[3]) return civil(dmy[3], dmy[2], dmy[1]);
  const dayFirst = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})$/.exec(text);
  if (dayFirst?.[1] && dayFirst[2] && dayFirst[3]) return civil(dayFirst[3], monthNumber(dayFirst[2]), dayFirst[1]);
  const monthFirst = /^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(text);
  if (monthFirst?.[1] && monthFirst[2] && monthFirst[3]) return civil(monthFirst[3], monthNumber(monthFirst[1]), monthFirst[2]);
  return null;
}
