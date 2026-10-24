// The product words, one translation each. Every table uses these and no
// synonym; i18n.test.ts fails on a known wrong one.
import type { Lang } from "../lib/prefs.ts";

export type Term =
  | "Customer"
  | "Invoice"
  | "Promise"
  | "Plan"
  | "Reminder"
  | "Ladder"
  | "Payment Demand Letter"
  | "Dispute"
  | "Owner"
  | "Bank"
  | "tour"
  | "salary day"
  | "pay link";

export const GLOSSARY: Record<Term, Record<Lang, string>> = {
  Customer: { en: "Customer", hi: "ग्राहक", bn: "গ্রাহক" },
  Invoice: { en: "Invoice", hi: "बिल", bn: "বিল" },
  Promise: { en: "Promise", hi: "वादा", bn: "প্রতিশ্রুতি" },
  Plan: { en: "Plan", hi: "किश्त योजना", bn: "কিস্তির পরিকল্পনা" },
  Reminder: { en: "Reminder", hi: "अनुस्मारक", bn: "অনুস্মারক" },
  Ladder: { en: "Ladder", hi: "अनुस्मारक सीढ़ी", bn: "অনুস্মারকের সিঁড়ি" },
  "Payment Demand Letter": { en: "Payment Demand Letter", hi: "बकाया भुगतान के लिए पत्र", bn: "বকেয়া পরিশোধের চিঠি" },
  Dispute: { en: "Dispute", hi: "आपत्ति", bn: "আপত্তি" },
  Owner: { en: "Owner", hi: "मालिक", bn: "মালিক" },
  Bank: { en: "Bank", hi: "बैंक", bn: "ব্যাংক" },
  tour: { en: "tour", hi: "टूर", bn: "ট্যুর" },
  "salary day": { en: "salary day", hi: "वेतन का दिन", bn: "বেতনের দিন" },
  "pay link": { en: "pay link", hi: "भुगतान लिंक", bn: "পেমেন্ট লিঙ্ক" },
};

/** Words a reviewer found standing in for a glossary term. None may appear in any table. */
export const WRONG: Record<Exclude<Lang, "en">, readonly string[]> = {
  hi: ["यात्रा", "भुगतान मांग पत्र", "हल्की याद", "की याद", "याद के लिए", "विश्राम", "विरुद्ध", "समय से आगे", "किस्त", "कोई याद"],
  bn: ["ভ্রমণ", "মনে করানো", "বিরতি", "বিরুদ্ধে", " মই "],
};

/** Copy-rule words, in every language: never debtor, fake, or 90 days; legal notice only inside the disclaimer's negation. */
export const BANNED: readonly RegExp[] = [
  /\bdebtor\b/i,
  /\bfake\b/i,
  /90 days/i,
  /legal notice/i,
  /नकली|जाली|ऋणी|देनदार|90 दिन|कानूनी नोटिस/,
  /জাল|ভুয়া|দেনাদার|90 দিন|৯০ দিন|আইনি নোটিশ/,
];
