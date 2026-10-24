import { describe, expect, it } from "vitest";
import { DOC_PHRASES } from "@tagada/domain";
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
    "Tagada UPI UTR GST GSTIN CGST SGST IGST ODR MSMED MSME PDF WhatsApp ElevenLabs HSN SAC CSV TDS HUF QR ID AI " +
    "RESEND_API_KEY DEMO_INBOX_EMAIL date narration utr amount via odr msme gov Gupta Traders Roy"
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
      const left = texts(COPY[lang]).flatMap(englishLeft);
      expect(left, lang).toEqual([]);
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
      for (const wrong of WRONG[lang]) {
        expect(all, `${lang} owner: ${wrong}`).not.toContain(wrong);
        expect(docs, `${lang} documents: ${wrong}`).not.toContain(wrong);
      }
    }
  });

  it("keeps the copy rules in all three languages", () => {
    const tables = [COPY, PAY_WORDS, { ...DOC_PHRASES }];
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
