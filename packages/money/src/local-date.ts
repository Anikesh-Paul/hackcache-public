// Dates in the Owner's or the Customer's language. Digits stay ASCII, like the amounts on the same page.
import { formatDate, parseCivilDate, weekday } from "./date.ts";

export type DateLang = "en" | "hi" | "bn";

const MONTHS: Record<Exclude<DateLang, "en">, string[]> = {
  hi: "जनवरी फ़रवरी मार्च अप्रैल मई जून जुलाई अगस्त सितंबर अक्टूबर नवंबर दिसंबर".split(" "),
  bn: "জানুয়ারি ফেব্রুয়ারি মার্চ এপ্রিল মে জুন জুলাই আগস্ট সেপ্টেম্বর অক্টোবর নভেম্বর ডিসেম্বর".split(" "),
};

const WEEKDAYS: Record<Exclude<DateLang, "en">, string[]> = {
  hi: "रवि सोम मंगल बुध गुरु शुक्र शनि".split(" "),
  bn: "রবি সোম মঙ্গল বুধ বৃহস্পতি শুক্র শনি".split(" "),
};

/** "6 নভেম্বর", or with the year "6 নভেম্বর 2026". */
export function bengaliDate(iso: string, options: { year?: boolean } = {}): string {
  return formatDateIn(iso, "bn", { weekday: false, year: options.year });
}

/** formatDate in another language: "शुक्र 6 नवंबर", "শুক্র 6 নভেম্বর". English is formatDate itself. */
export function formatDateIn(iso: string, lang: DateLang, options?: { weekday?: boolean; year?: boolean }): string {
  if (lang === "en") return formatDate(iso, options);
  const date = parseCivilDate(iso);
  const month = date ? MONTHS[lang][date.month - 1] : undefined;
  if (!date || month === undefined) return iso;
  const parts = [`${date.day} ${month}`];
  if (options?.weekday ?? true) parts.unshift(WEEKDAYS[lang][weekday(iso) ?? 0] ?? "");
  if (options?.year) parts.push(String(date.year));
  return parts.join(" ");
}
