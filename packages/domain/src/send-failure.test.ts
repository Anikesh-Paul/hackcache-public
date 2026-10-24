import { describe, expect, it } from "vitest";
import { REPEAT_REFUSED, isRepeatRefused, sendFailureWords } from "./index.ts";

describe("a failed send, in plain words", () => {
  it("never shows the provider's error", () => {
    const raw = 'Resend 422: {"name":"validation_error","message":"Invalid `to` field"}';
    expect(sendFailureWords(raw)).toBe("The email could not be sent; the next run tries again.");
    expect(sendFailureWords(null)).toBe("The email could not be sent; the next run tries again.");
  });

  it("says a refused repeat is not tried again", () => {
    const stored = `${REPEAT_REFUSED}Resend 409: This idempotency key has already been used`;
    expect(isRepeatRefused(stored)).toBe(true);
    expect(sendFailureWords(stored)).toBe("The email service had already taken this email once, so it is not sent again.");
    expect(sendFailureWords(stored)).not.toContain("409");
  });
});
