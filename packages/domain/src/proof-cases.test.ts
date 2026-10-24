import { describe, expect, it } from "vitest";
import { runDomainCases } from "./index.ts";

describe("domain cases on /proof", () => {
  const results = runDomainCases();

  it("computes every case to the spec literal", () => {
    expect(Object.fromEntries(results.map((result) => [result.id, result.actual]))).toEqual({
      "ladder-pause": "paused",
      "ladder-resume": "Reminder call, for you to send",
      "ladder-dispute": "disputed",
      "ladder-letter": "Payment Demand Letter, for you to send",
      "ladder-one-a-day": "i1 sends; i2 waits until tomorrow",
      "match-number": "i12, i12, i12",
      "match-name": "Barua Stores",
      "match-tds": "Possible TDS",
      "match-oldest-first": "0008 ₹1,000, then 0009 ₹2,000",
      "match-part": "part: ₹2,000 applied, ₹3,000 still owed",
      "plan-accept": "accept",
      "plan-counter": "counter, first instalment ₹59,000",
      "plan-owner": "Needs your decision",
      "plan-reject":
        "Not recorded: every instalment needs a date (YYYY-MM-DD). Ask for the missing date and check the Plan again.",
      "grade-a": "A: usually pays 7 days late",
      "grade-b": "B: usually pays 12 days late; this one is 38 days late",
      "grade-c": "C: usually pays 31 days late",
      "grade-c-promise": "C: usually pays 3 days late; a Promise was broken on 20 Oct",
      "interest-45-days": "interest from 17 Oct 2026",
      "ageing-sum": "0–30 ₹10,000, 31–60 ₹20,000, 61–90 ₹30,000, 90+ ₹40,000, total ₹1,00,000",
      "chase-lateness": "₹8,400 (112 days late), then ₹10,000 (5 days late)",
      "letter-past-due": "Demands ₹60,000 for TBW/26-27/0019",
      "letter-nothing-due": "Nothing is past due for Gupta Traders.",
    });
    expect(results.every((result) => result.pass && result.actual === result.expected)).toBe(true);
  });

  it("covers the Ladder, the matcher, the Plan rule, Grade, the §15 appointed day, Ageing, the chase order and the letter", () => {
    expect(new Set(results.map((result) => result.area))).toEqual(
      new Set(["Ladder", "Match", "Plan rule", "Grade", "Interest", "Ageing", "Chase", "Letter"]),
    );
  });
});
