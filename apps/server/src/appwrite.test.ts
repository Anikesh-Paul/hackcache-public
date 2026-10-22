import { describe, expect, it } from "vitest";
import { AppwriteException } from "node-appwrite";
import { withRetry } from "./appwrite.ts";

const failing = (codes: number[]) => {
  let calls = 0;
  const call = async () => {
    const code = codes[calls++];
    if (code !== undefined) throw new AppwriteException("refused", code, "database_unavailable", "");
    return "written";
  };
  return { call, calls: () => calls };
};

describe("withRetry", () => {
  it("tries again when Appwrite says the database was briefly unavailable", async () => {
    const f = failing([503, 429]);
    expect(await withRetry(f.call, 0)).toBe("written");
    expect(f.calls()).toBe(3);
  });

  it("gives up after three attempts", async () => {
    const f = failing([503, 503, 503, 503]);
    await expect(withRetry(f.call, 0)).rejects.toThrow("refused");
    expect(f.calls()).toBe(3);
  });

  it("does not retry an error that will not go away", async () => {
    const f = failing([401]);
    await expect(withRetry(f.call, 0)).rejects.toThrow("refused");
    expect(f.calls()).toBe(1);
  });
});
