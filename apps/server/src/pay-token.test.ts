import { describe, expect, it } from "vitest";
import { payTokens } from "./pay-token.ts";

const ref = { workspaceId: "w64f0c2a91be7d3e85f10", invoiceId: "i19_w64f0c2a91be7d3e85f10" };
const DAY = 24 * 60 * 60 * 1000;

describe("pay tokens", () => {
  it("name the Invoice they were signed for", () => {
    const tokens = payTokens("secret-a", () => 0);
    const token = tokens.sign(ref);
    expect(tokens.verify(token)).toEqual({ ok: true, ref: { ...ref, token } });
  });

  it("fit the payToken column and a URL path", () => {
    const token = payTokens("secret-a").sign(ref);
    expect(token.length).toBeLessThanOrEqual(255);
    expect(token).toMatch(/^[A-Za-z0-9_.-]+$/);
  });

  it("refuse a guess, a changed character and another server's signature", () => {
    const tokens = payTokens("secret-a", () => 0);
    const token = tokens.sign(ref);
    const flipped = token.slice(0, 5) + (token[5] === "A" ? "B" : "A") + token.slice(6);
    for (const guess of ["", "abc", "a.b", "0123456789abcdef0123456789abcdef", flipped, `${token}x`]) {
      expect(tokens.verify(guess)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(payTokens("secret-b", () => 0).verify(token)).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuse a changed Invoice even when the signature is moved across", () => {
    const tokens = payTokens("secret-a", () => 0);
    const [, mac] = tokens.sign(ref).split(".");
    const other = Buffer.from(`${ref.workspaceId}~i20_${ref.workspaceId}~${60 * 86_400}`).toString("base64url");
    expect(tokens.verify(`${other}.${mac}`)).toEqual({ ok: false, reason: "invalid" });
  });

  it("expire after 60 days", () => {
    let now = 0;
    const tokens = payTokens("secret-a", () => now);
    const token = tokens.sign(ref);
    now = 60 * DAY - 1000;
    expect(tokens.verify(token).ok).toBe(true);
    now = 60 * DAY + 1000;
    expect(tokens.verify(token)).toEqual({ ok: false, reason: "expired" });
  });
});
