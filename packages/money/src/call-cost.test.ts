import { describe, expect, it } from "vitest";
import { CALL_CREDITS_PER_MINUTE, callCostPaise, callCredits, formatInr, paiseFromRupees, rupeesFromPaise } from "./index.ts";

describe("paiseFromRupees", () => {
  it("turns the agent's whole rupees into paise", () => {
    expect(paiseFromRupees(60_000)).toBe(6_000_000);
    expect(paiseFromRupees(0)).toBe(0);
  });

  it("goes back to whole rupees, half up", () => {
    expect(rupeesFromPaise(5_900_000)).toBe(59_000);
    expect(rupeesFromPaise(5_900_050)).toBe(59_001);
  });

  it("refuses a fraction or anything that is not a number", () => {
    expect(() => paiseFromRupees(59_999.5)).toThrow();
    expect(() => paiseFromRupees(Number.NaN)).toThrow();
  });
});

describe("call cost", () => {
  it("counts credits from the real duration, by the second", () => {
    expect(CALL_CREDITS_PER_MINUTE).toBe(450);
    expect(callCredits(60)).toBe(450);
    expect(callCredits(134)).toBe(1005);
    expect(callCredits(0)).toBe(0);
  });

  it("prices the credits in paise, half up", () => {
    // 1,005 credits at ₹19.36 per 1,000 credits.
    expect(callCostPaise(1005)).toBe(1946);
    expect(formatInr(callCostPaise(callCredits(134)))).toBe("₹19.46");
    expect(callCostPaise(0)).toBe(0);
  });

  it("refuses a negative or fractional count", () => {
    expect(() => callCredits(-1)).toThrow();
    expect(() => callCostPaise(1.5)).toThrow();
  });
});
