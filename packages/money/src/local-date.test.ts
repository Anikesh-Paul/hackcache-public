import { describe, expect, it } from "vitest";
import { bengaliDate, formatDateIn } from "./index.ts";

describe("Bengali dates", () => {
  it("names the month in Bengali and keeps the page's ASCII digits", () => {
    expect(bengaliDate("2026-11-06")).toBe("6 নভেম্বর");
    expect(bengaliDate("2026-11-06", { year: true })).toBe("6 নভেম্বর 2026");
    expect(bengaliDate("2027-01-31", { year: true })).toBe("31 জানুয়ারি 2027");
  });

  it("has a short Hindi date with digits for lists", () => {
    expect(formatDateIn("2026-11-06", "hi", { weekday: false })).toBe("6 नवंबर");
    expect(formatDateIn("nope", "hi", { weekday: false })).toBe("nope");
  });

  it("formats a date in the Owner's language, like formatDate", () => {
    expect(formatDateIn("2026-11-06", "en")).toBe("Fri 6 Nov");
    expect(formatDateIn("2026-11-06", "hi")).toBe("शुक्र 6 नवंबर");
    expect(formatDateIn("2026-11-06", "bn", { weekday: false, year: true })).toBe("6 নভেম্বর 2026");
  });

  it("returns what it cannot read", () => {
    expect(bengaliDate("not-a-date")).toBe("not-a-date");
    expect(bengaliDate("2026-02-31")).toBe("2026-02-31");
  });
});
