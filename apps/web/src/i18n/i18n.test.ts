import { describe, expect, it } from "vitest";
import { DOC_PHRASES, planIssueReason, type PlanIssue } from "@tagada/domain";
import { PAY_WORDS } from "../screens/PayLink.tsx";
import { BANNED, GLOSSARY, WRONG } from "./glossary.ts";
import { COPY, salaryHeadline } from "./index.ts";

function paths(value: unknown, prefix = ""): string[] {
  // A list (month names, Ladder stages) is one key: English may spell dates another way.
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    paths(child, prefix ? `${prefix}.${key}` : key),
  );
}

/** Every string a table can show: plain strings, and what each function returns for sample arguments. */
function texts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") {
    for (const args of [[3, 3, 3, 3], ["Roy", "₹500", "6 Nov", "₹1,000"], [3, "₹500"]]) {
      try {
        const out = (value as (...a: unknown[]) => unknown)(...args);
        if (typeof out === "string") return [out];
      } catch {
        // JSX or object arguments: the static strings around it are checked instead.
      }
    }
    return [];
  }
  if (value === null || typeof value !== "object") return [];
  return Object.values(value as Record<string, unknown>).flatMap(texts);
}

// Names, codes and products that stay in Latin script in every language.
const LATIN_OK = new Set(
  (
    "Tagada UPI UTR GST GSTIN CGST SGST IGST ODR MSMED MSME PDF WhatsApp ElevenLabs HSN SAC CSV TDS HUF QR ID AI JPG PNG WebP " +
    "RESEND_API_KEY DEMO_INBOX_EMAIL date narration utr amount via odr msme gov Gupta Traders Roy " +
    // A Udyam registration number's own prefix, shown as the example to copy.
    "UDYAM " +
    // The Economic Survey's own box number, cited on the landing page.
    "VIII"
  ).split(" "),
);

function englishLeft(text: string): string[] {
  // "undefined" comes from a sample argument of the wrong shape, not from the table.
  return (text.match(/[A-Za-z_]{3,}/g) ?? []).filter((word) => !LATIN_OK.has(word) && word !== "undefined");
}

describe("owner tables", () => {
  it("has every English key in Hindi and Bengali", () => {
    expect(paths(COPY.hi).sort()).toEqual(paths(COPY.en).sort());
    expect(paths(COPY.bn).sort()).toEqual(paths(COPY.en).sort());
  });

  it("has every key in the pay link and document tables too", () => {
    for (const table of [PAY_WORDS, DOC_PHRASES]) {
      expect(paths(table.hi).sort()).toEqual(paths(table.en).sort());
      expect(paths(table.bn).sort()).toEqual(paths(table.en).sort());
    }
  });

  it("leaves no English UI text in Hindi or Bengali", () => {
    for (const lang of ["hi", "bn"] as const) {
      expect(texts(COPY[lang]).flatMap(englishLeft), lang).toEqual([]);
      expect(texts(PAY_WORDS[lang]).flatMap(englishLeft), `${lang} pay link`).toEqual([]);
    }
  });

  it("uses each glossary word, and none of the synonyms a reviewer flagged", () => {
    for (const lang of ["hi", "bn"] as const) {
      const all = texts(COPY[lang]).join("\n");
      for (const [term, words] of Object.entries(GLOSSARY)) {
        if (term === "Owner") continue;
        expect(all, `${lang} ${term}`).toContain(words[lang]);
      }
      const docs = texts(DOC_PHRASES[lang]).join("\n");
      const pay = texts(PAY_WORDS[lang]).join("\n");
      for (const wrong of WRONG[lang]) {
        expect(all, `${lang} owner: ${wrong}`).not.toContain(wrong);
        expect(docs, `${lang} documents: ${wrong}`).not.toContain(wrong);
        expect(pay, `${lang} pay link: ${wrong}`).not.toContain(wrong);
      }
    }
  });

  it("keeps the copy rules in all three languages", () => {
    const tables = [COPY, PAY_WORDS, DOC_PHRASES];
    for (const table of tables) {
      for (const lang of ["en", "hi", "bn"] as const) {
        const entry = table[lang] as unknown as Record<string, unknown>;
        // The disclaimer is the one place a negated "legal notice" belongs.
        const { disclaimer: _disclaimer, ...rest } = entry;
        const all = texts(rest).join("\n");
        for (const banned of BANNED) expect(all, `${lang} ${banned}`).not.toMatch(banned);
      }
    }
  });

  it("words every Plan-rule issue in each language, English as the rule itself says it", () => {
    const issues: PlanIssue[] = [
      { kind: "first_short", amountPaise: 4_000_000, minPaise: 5_900_000, pct: 50 },
      { kind: "first_late", date: "2026-11-12", by: "2026-11-09", days: 7 },
      { kind: "last_late", date: "2026-12-20", by: "2026-12-02", days: 30 },
    ];
    for (const issue of issues) {
      expect(COPY.en.call.issue(issue)).toBe(planIssueReason(issue));
      for (const lang of ["hi", "bn"] as const) {
        expect(englishLeft(COPY[lang].call.issue(issue)), `${lang} ${issue.kind}`).toEqual([]);
      }
    }
  });

  it("puts one digit system on a Bengali page", () => {
    expect(texts(COPY.bn).join("")).not.toMatch(/[০-৯]/);
    expect(texts(PAY_WORDS.bn).join("")).not.toMatch(/[০-৯]/);
    expect(texts(DOC_PHRASES.bn).join("")).not.toMatch(/[০-৯]/);
  });

  it("keeps the English salary headline the screens already show", () => {
    expect(salaryHeadline(8, false, COPY.en)).toBe("Salary day in 8 days");
    expect(salaryHeadline(1, false, COPY.en)).toBe("Salary day tomorrow");
    expect(salaryHeadline(0, false, COPY.en)).toBe("Salary day today");
    expect(salaryHeadline(0, true, COPY.en)).toBe("Salary covered");
    expect(salaryHeadline(8, false, COPY.hi)).toBe("वेतन का दिन 8 दिन में");
  });
});
