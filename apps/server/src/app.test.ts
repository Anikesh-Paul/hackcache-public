import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { memoryFiles } from "./memory-store.ts";
import { payTokens } from "./pay-token.ts";

const ok = async () => {};
const demo = {
  userFromJwt: async () => null,
  worlds: {
    exists: async () => false,
    remove: ok,
    write: ok,
    create: async () => "created" as const,
    get: async () => null,
    update: ok,
    list: async () => [],
  },
  later: () => {},
  tokens: payTokens("test-secret"),
};
const { files } = memoryFiles();
const voice = { speak: async () => new Uint8Array() };

describe("GET /healthz", () => {
  it("is OK when Appwrite can be read with the server key", async () => {
    const res = await createApp({ probeAppwrite: ok, demo, files, voice }).request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, appwrite: "ok" });
  });

  it("is 503 when the Appwrite read fails, without leaking the error", async () => {
    const app = createApp({
      demo,
      files,
      voice,
      probeAppwrite: async () => {
        throw new Error("401 key sk_live_abc is invalid");
      },
    });
    const res = await app.request("/healthz");
    expect(res.status).toBe(503);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ ok: false, appwrite: "unreachable" });
    expect(body).not.toContain("sk_live");
  });
});

describe("unknown routes", () => {
  it("return 404 JSON", async () => {
    const res = await createApp({ probeAppwrite: ok, demo, files, voice }).request("/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});
