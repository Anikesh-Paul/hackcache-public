// One strings table per language for the Owner's screens. Every screen reads
// the header's choice through useT, so a switch re-renders them all at once.
import { useLang, type Lang } from "../lib/prefs.ts";
import { bn } from "./bn.tsx";
import { en, type Copy } from "./en.tsx";
import { hi } from "./hi.tsx";

export type { Copy };

export const COPY: Record<Lang, Copy> = { en, hi, bn };

export function copyFor(lang: Lang): Copy {
  return COPY[lang];
}

/** The Owner's words in the header's language. */
export function useT(): Copy {
  return COPY[useLang().lang];
}

/** The salary headline: "Salary day in 8 days", or "Salary covered". */
export function salaryHeadline(daysAway: number | null, covered: boolean, t: Copy): string {
  if (covered || daysAway === null) return t.salary.covered;
  if (daysAway <= 0) return t.salary.today;
  if (daysAway === 1) return t.salary.tomorrow;
  return t.salary.in(daysAway);
}
