import { afterEach, describe, expect, it, vi } from "vitest";
import { resendMailer } from "./email.ts";

const mail = {
  fromName: "Tripura Bamboo Works via Tagada",
  to: "demo-inbox@example.com",
  replyTo: "owner@example.com",
  subject: "Coming up: Invoice TBW/26-27/0029",
  text: "Hello",
  idempotencyKey: "wabc/rem_i29_wabc_s1",
};

afterEach(() => vi.unstubAllGlobals());

describe("resendMailer", () => {
  it("is null without an API key", () => {
    expect(resendMailer(undefined, "resend.dev")).toBeNull();
  });

  it("sends from the shared address under the business's name, with the Reminder's key as the idempotency key", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const result = await resendMailer("re_test", "resend.dev")!.send(mail);
    expect(result).toEqual({ ok: true, id: "em_1" });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(new Headers(init.headers).get("idempotency-key")).toBe("wabc/rem_i29_wabc_s1");
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: "Tripura Bamboo Works via Tagada <onboarding@resend.dev>",
      to: ["demo-inbox@example.com"],
      reply_to: "owner@example.com",
    });
  });

  it("passes Resend's refusal on as the error for the log; one still in flight may be tried again", async () => {
    const body = { name: "concurrent_idempotent_requests", message: "Another request with this key is in progress." };
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), { status: 409 }));
    expect(await resendMailer("re_test", "resend.dev")!.send(mail)).toEqual({
      ok: false,
      error: "Resend 409: Another request with this key is in progress.",
    });
  });

  it("marks a key used for another body as a repeat, which is not tried again", async () => {
    const body = { name: "invalid_idempotent_request", message: "This idempotency key has already been used on a request that had a different payload." };
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), { status: 409 }));
    expect(await resendMailer("re_test", "resend.dev")!.send(mail)).toEqual({
      ok: false,
      error: "Resend 409: This idempotency key has already been used on a request that had a different payload.",
      repeat: true,
    });
  });
});
