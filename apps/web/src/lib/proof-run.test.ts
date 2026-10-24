import { describe, expect, it } from "vitest";
import { runShownProof } from "./proof-run.ts";

describe("/proof", () => {
  it("runs every money and domain case from the packages, and they all pass", () => {
    const results = runShownProof();
    const areas = new Set(results.map((result) => result.area));
    for (const area of ["GST", "Interest", "Ladder", "Match", "Plan rule", "Grade", "Ageing", "Chase", "Letter", "Forecast", "Tax"]) {
      expect(areas.has(area), area).toBe(true);
    }
    expect(results.every((result) => result.pass && result.actual === result.expected)).toBe(true);
    expect(new Set(results.map((result) => result.id)).size).toBe(results.length);
    expect(results.find((result) => result.id === "forecast-short")?.actual).toBe("Salary day in 8 days, ₹48,000 short");
    expect(results.find((result) => result.id === "interest-2")?.actual).toBe("₹3,416.88");
  });
});
