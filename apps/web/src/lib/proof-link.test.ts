import { describe, expect, it } from "vitest";
import { runShownProof } from "./proof-run.ts";
import { proofHref } from "./proof-link.ts";

describe("proof links", () => {
  it("points every case at its test file in the public repo", () => {
    const results = runShownProof();
    expect(results.length).toBeGreaterThan(20);
    for (const result of results) {
      expect(result.source, result.id).toMatch(/\.test\.ts$/);
      expect(proofHref("6627a47", result.source)).toBe(
        `https://github.com/Anikesh-Paul/hackcache-public/blob/6627a47/${result.source}`,
      );
    }
  });
});
