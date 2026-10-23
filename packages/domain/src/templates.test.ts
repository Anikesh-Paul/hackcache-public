import { describe, expect, it } from "vitest";
import { CUSTOMER_LANGS, REMINDER_TEMPLATES, reminderMessage, type ReminderFacts } from "./index.ts";

const gupta: Omit<ReminderFacts, "stage" | "lang"> = {
  businessName: "Tripura Bamboo Works",
  customerName: "Gupta Traders",
  number: "TBW/26-27/0019",
  amountPaise: 11_800_000,
  dueDate: "2026-09-25",
  today: "2026-11-02",
  payUrl: "https://tagada.example/pay/abc",
  contact: "owner@tripurabamboo.example",
};

describe("reminderMessage", () => {
  it("has five templates, one for each message stage, the call's firm reminder and the last before the letter", () => {
    expect(REMINDER_TEMPLATES).toEqual(["heads_up", "due_today", "overdue", "firm", "final"]);
  });

  for (const lang of CUSTOMER_LANGS) {
    for (const stage of [1, 2, 3, 4, 5]) {
      it(`stage ${stage} in ${lang} names the Invoice, the amount, the https pay link and who to contact`, () => {
        const m = reminderMessage({ ...gupta, stage, lang });
        expect(m.text).toContain("TBW/26-27/0019");
        expect(m.text).toContain("₹1,18,000");
        expect(m.text).toContain("https://tagada.example/pay/abc");
        expect(m.text).toContain("owner@tripurabamboo.example");
        expect(m.subject).toContain("TBW/26-27/0019");
        for (const word of [/debtor/i, /legal notice/i, /fake/i, /90 days/i]) {
          expect(m.text).not.toMatch(word);
          expect(m.subject).not.toMatch(word);
        }
      });
    }
  }

  it("counts the days late in the overdue reminder", () => {
    expect(reminderMessage({ ...gupta, stage: 3, lang: "en" }).text).toContain("38 days");
  });

  it("says the Payment Demand Letter comes next only in the last reminder", () => {
    expect(reminderMessage({ ...gupta, stage: 5, lang: "en" }).text).toContain("Payment Demand Letter");
    expect(reminderMessage({ ...gupta, stage: 4, lang: "en" }).text).not.toContain("Payment Demand Letter");
  });

  it("writes in the Customer's own script", () => {
    expect(reminderMessage({ ...gupta, stage: 2, lang: "hi" }).text).toMatch(/[ऀ-ॿ]/);
    expect(reminderMessage({ ...gupta, stage: 2, lang: "bn" }).text).toMatch(/[ঀ-৿]/);
  });

  it("says a due-date reminder sent late was due on its date, not today", () => {
    const late = { ...gupta, dueDate: "2026-11-08", today: "2026-11-09" };
    const en = reminderMessage({ ...late, stage: 2, lang: "en" });
    expect(en.subject).not.toMatch(/today/i);
    expect(en.text).not.toMatch(/today/i);
    expect(en.text).toContain("was due on 8 Nov");
    const hi = reminderMessage({ ...late, stage: 2, lang: "hi" });
    expect(`${hi.subject} ${hi.text}`).not.toContain("आज देय");
    expect(hi.text).toContain("देय थे");
    const bn = reminderMessage({ ...late, stage: 2, lang: "bn" });
    expect(`${bn.subject} ${bn.text}`).not.toContain("আজ দেয়");
    expect(bn.text).toContain("দেয় ছিল");
  });

  it("still says today on the due date itself", () => {
    const onTime = { ...gupta, dueDate: "2026-11-08", today: "2026-11-08" };
    expect(reminderMessage({ ...onTime, stage: 2, lang: "en" }).text).toContain("is due today");
  });

  it("has no message for the ODR case file", () => {
    expect(() => reminderMessage({ ...gupta, stage: 6, lang: "en" })).toThrow();
  });
});
