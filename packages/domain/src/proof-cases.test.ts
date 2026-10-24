import { describe, expect, it } from "vitest";
import { runDomainCases } from "./index.ts";

describe("domain cases on /proof", () => {
  const results = runDomainCases();

  it("computes every case to the spec literal", () => {
    expect(Object.fromEntries(results.map((result) => [result.id, result.actual]))).toEqual({
      "ladder-pause": "paused",
      "ladder-resume": "Reminder call, for you to send",
      "ladder-letter": "Payment Demand Letter, for you to send",
      "ladder-one-a-day": "i1 sends; i2 waits until tomorrow",
      "match-number": "i12, i12, i12",
      "match-name": "Barua Stores",
      "match-tds": "Possible TDS",
      "plan-accept": "accept",
      "plan-counter": "counter, first instalment ₹59,000",
      "plan-owner": "Needs your decision",
      "plan-reject":
        "Not recorded: every instalment needs a date (YYYY-MM-DD). Ask for the missing date and check the Plan again.",
      "grade-a": "A: usually pays 7 days late",
      "grade-b": "B: usually pays 12 days late; this one is 38 days late",
      "grade-c": "C: usually pays 31 days late",
      "ageing-sum": "0–30 ₹10,000, 31–60 ₹20,000, 61–90 ₹30,000, 90+ ₹40,000, total ₹1,00,000",
    });
    expect(results.every((result) => result.pass && result.actual === result.expected)).toBe(true);
  });

  it("covers the Ladder, the matcher, the Plan rule, Grade and Ageing", () => {
    expect(new Set(results.map((result) => result.area))).toEqual(
      new Set(["Ladder", "Match", "Plan rule", "Grade", "Ageing"]),
    );
  });
});
