import { describe, expect, it } from "vitest";
import { OWNER, salaryHeadline } from "./owner.ts";

function paths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    paths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("owner copy", () => {
  it("has every English key in Hindi and Bengali", () => {
    expect(paths(OWNER.hi).sort()).toEqual(paths(OWNER.en).sort());
    expect(paths(OWNER.bn).sort()).toEqual(paths(OWNER.en).sort());
  });

  it("keeps the English salary headline the screens already show", () => {
    expect(salaryHeadline(8, false, "en")).toBe("Salary day in 8 days");
    expect(salaryHeadline(1, false, "en")).toBe("Salary day tomorrow");
    expect(salaryHeadline(0, false, "en")).toBe("Salary day today");
    expect(salaryHeadline(0, true, "en")).toBe("Salary covered");
  });

  it("does not use the banned words", () => {
    const text = JSON.stringify(OWNER);
    expect(text).not.toMatch(/\bdebtor\b/i);
    expect(text).not.toMatch(/\bfake\b/i);
    expect(text).not.toMatch(/legal notice/i);
    expect(text).not.toMatch(/90 days/i);
    expect(text).not.toMatch(/नकली|জাল|ভুয়া/);
  });
});
