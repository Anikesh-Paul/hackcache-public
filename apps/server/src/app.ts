import { randomBytes } from "node:crypto";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { claimedUserId, resetDemo, startDemo, workspaceIdFor, type DemoDeps } from "./demo.ts";
import { issueInvoice } from "./invoices.ts";
import {
  CALL_LIMITS,
  dailyCounter,
  decide,
  glossLines,
  receiveTranscript,
  recordOutcome,
  startCall,
  type Agent,
  type CallLimits,
  type Gloss,
} from "./call.ts";
import {
  MAX_SCREENSHOT_BYTES,
  choosePlan,
  claimPaid,
  paySlip,
  raiseDispute,
  readAloud,
  uploadScreenshot,
  type FileStore,
  type PayResult,
  type Voice,
} from "./pay.ts";
import type { PayLink } from "./pay-token.ts";

export type CallDeps = {
  /** The private ElevenLabs agent; null when it is not set up. */
  agent: Agent | null;
  /** Signs the post-call webhook; null when it is not set up. */
  webhookSecret: string | null;
  gloss: Gloss | null;
  limits?: CallLimits;
  now?: () => number;
};

export type AppDeps = {
  /** Resolves when Appwrite answers a read made with the server's API key. */
  probeAppwrite: () => Promise<void>;
  demo: DemoDeps;
  /** Storage buckets: UPI screenshots and read-aloud clips. */
  files: FileStore;
  voice: Voice;
  call?: CallDeps;
  /** Browser origin allowed to call /api (the static site). */
  webOrigin?: string;
};

export function createApp({ probeAppwrite, demo, files, voice, call, webOrigin }: AppDeps) {
  const app = new Hono();
  app.use(secureHeaders());
  if (webOrigin) app.use("/api/*", cors({ origin: webOrigin }));

  app.get("/healthz", async (c) => {
    try {
      await probeAppwrite();
      return c.json({ ok: true, appwrite: "ok" });
    } catch (e) {
      console.error("healthz: Appwrite read failed", e);
      return c.json({ ok: false, appwrite: "unreachable" }, 503);
    }
  });

  const bearer = (c: Context) => /^Bearer (\S+)$/.exec(c.req.header("authorization") ?? "")?.[1] ?? null;
  const failed = (c: Context, path: string, e: unknown) => {
    console.error(`${path} failed`, e);
    return c.json({ error: "demo_unavailable" }, 500);
  };

  app.post("/api/demo/start", async (c) => {
    const jwt = bearer(c);
    if (!jwt) return c.json({ error: "unauthorized" }, 401);
    try {
      // Look the world up while Appwrite checks the JWT. The answer is used
      // only when the check confirms the same user the token claimed.
      const claimed = claimedUserId(jwt);
      const early = claimed ? demo.worlds.exists(workspaceIdFor(claimed)).catch(() => undefined) : undefined;
      const userId = await demo.userFromJwt(jwt);
      if (!userId) return c.json({ error: "unauthorized" }, 401);
      return c.json(await startDemo(demo, userId, userId === claimed ? await early : undefined));
    } catch (e) {
      return failed(c, "/api/demo/start", e);
    }
  });

  app.post("/api/invoices", async (c) => {
    const jwt = bearer(c);
    if (!jwt) return c.json({ error: "unauthorized" }, 401);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_body" }, 400);
    }
    try {
      const userId = await demo.userFromJwt(jwt);
      if (!userId) return c.json({ error: "unauthorized" }, 401);
      const result = await issueInvoice(demo.worlds, userId, body, {
        row: () => `n${randomBytes(12).toString("hex")}`,
        payToken: (invoiceId) => demo.tokens.sign({ workspaceId: workspaceIdFor(userId), invoiceId }),
      });
      if (!result.ok) return c.json({ error: result.error }, result.status);
      return c.json({ invoice: result.invoice, customer: result.customer });
    } catch (e) {
      return failed(c, "/api/invoices", e);
    }
  });

  app.post("/api/invoices/:id/dispute", async (c) => {
    const jwt = bearer(c);
    if (!jwt) return c.json({ error: "unauthorized" }, 401);
    const body = await c.req.json().catch(() => null);
    try {
      const userId = await demo.userFromJwt(jwt);
      if (!userId) return c.json({ error: "unauthorized" }, 401);
      const ref = { workspaceId: workspaceIdFor(userId), invoiceId: c.req.param("id") };
      return answer(c, await raiseDispute(demo.worlds, ref, body, "owner"));
    } catch (e) {
      return failed(c, "/api/invoices/:id/dispute", e);
    }
  });

  // The Customer side: the pay token is the only credential. It is checked
  // with the secret before anything is read, so a guess costs no lookup.
  const answer = (c: Context, result: PayResult) =>
    result.ok
      ? c.json(result.slip)
      : c.json({ error: result.error, ...(result.reason ? { reason: result.reason } : {}) }, result.status);
  const pay = (path: string, run: (ref: PayLink, c: Context) => Promise<Response>) => async (c: Context) => {
    const check = demo.tokens.verify(c.req.param("token") ?? "");
    if (!check.ok) {
      return check.reason === "expired"
        ? c.json({ error: "link_expired" }, 410)
        : c.json({ error: "invalid_link" }, 404);
    }
    try {
      return await run(check.ref, c);
    } catch (e) {
      console.error(`${path} failed`, e);
      return c.json({ error: "pay_unavailable" }, 500);
    }
  };
  const json = (c: Context) => c.req.json().catch(() => null);

  app.get("/api/pay/:token", pay("/api/pay", async (ref, c) => answer(c, await paySlip(demo.worlds, ref))));
  app.post("/api/pay/:token/paid", pay("/api/pay/paid", async (ref, c) => answer(c, await claimPaid(demo.worlds, ref))));
  app.post(
    "/api/pay/:token/accept-plan",
    pay("/api/pay/accept-plan", async (ref, c) => answer(c, await choosePlan(demo.worlds, ref, await json(c)))),
  );
  app.post(
    "/api/pay/:token/dispute",
    pay("/api/pay/dispute", async (ref, c) =>
      answer(c, await raiseDispute(demo.worlds, ref, await json(c), "customer")),
    ),
  );
  app.post(
    "/api/pay/:token/screenshot",
    bodyLimit({ maxSize: MAX_SCREENSHOT_BYTES + 64 * 1024, onError: (c) => c.json({ error: "invalid_file" }, 400) }),
    pay("/api/pay/screenshot", async (ref, c) => {
      const form = await c.req.parseBody().catch(() => null);
      const file = form?.file;
      return answer(c, await uploadScreenshot({ worlds: demo.worlds, files, voice }, ref, file));
    }),
  );
  app.get(
    "/api/pay/:token/audio",
    pay("/api/pay/audio", async (ref, c) => {
      const clip = await readAloud({ worlds: demo.worlds, files, voice }, ref);
      if (!clip) return c.json({ error: "invalid_link" }, 404);
      return c.body(new Uint8Array(clip), 200, { "content-type": "audio/mpeg", "cache-control": "private, max-age=3600" });
    }),
  );

  // Call with AI. The Owner's session names the workspace; the browser's word is never taken for it.
  const now = call?.now ?? Date.now;
  const daily = dailyCounter(now);
  const owned = (path: string, run: (workspaceId: string, c: Context) => Promise<Response>) => async (c: Context) => {
    const jwt = bearer(c);
    if (!jwt) return c.json({ error: "unauthorized" }, 401);
    try {
      const userId = await demo.userFromJwt(jwt);
      if (!userId) return c.json({ error: "unauthorized" }, 401);
      return await run(workspaceIdFor(userId), c);
    } catch (e) {
      console.error(`${path} failed`, e);
      return c.json({ error: "call_unavailable" }, 500);
    }
  };

  app.get(
    "/api/call/signed-url",
    owned("/api/call/signed-url", async (workspaceId, c) => {
      const deps = { worlds: demo.worlds, agent: call?.agent ?? null, limits: call?.limits ?? CALL_LIMITS, daily };
      const result = await startCall(deps, workspaceId, c.req.query("invoiceId") ?? "");
      return result.ok ? c.json(result.session) : c.json({ error: result.error, message: result.message }, result.status);
    }),
  );
  app.post(
    "/api/call/outcome",
    owned("/api/call/outcome", async (workspaceId, c) => {
      const result = await recordOutcome(demo.worlds, workspaceId, await json(c));
      return result.ok
        ? c.json({ say: "recorded", outcome: result.outcome, promiseId: result.promiseId })
        : c.json({ error: result.error, say: result.say }, result.status);
    }),
  );
  app.post(
    "/api/promises/:id/decide",
    owned("/api/promises/:id/decide", async (workspaceId, c) => {
      const result = await decide(demo.worlds, workspaceId, c.req.param("id") ?? "", await json(c));
      return result.ok
        ? c.json({ status: result.status, counter: result.counter })
        : c.json({ error: result.error }, result.status);
    }),
  );
  app.post(
    "/api/call/gloss",
    owned("/api/call/gloss", async (_workspaceId, c) => {
      const lines = glossLines(await json(c));
      if (!lines) return c.json({ error: "invalid_lines" }, 400);
      if (!call?.gloss) return c.json({ error: "gloss_unavailable" }, 503);
      return c.json({ gloss: await call.gloss.english(lines) });
    }),
  );
  app.post("/webhooks/elevenlabs", async (c) => {
    if (!call?.webhookSecret) return c.json({ error: "webhook_unavailable" }, 503);
    const raw = await c.req.text();
    try {
      const result = await receiveTranscript(demo.worlds, call.webhookSecret, c.req.header("elevenlabs-signature") ?? "", raw, now());
      return c.json(result.body, result.status);
    } catch (e) {
      console.error("/webhooks/elevenlabs failed", e);
      return c.json({ error: "webhook_failed" }, 500);
    }
  });

  app.post("/api/demo/reset", async (c) => {
    const jwt = bearer(c);
    if (!jwt) return c.json({ error: "unauthorized" }, 401);
    try {
      const userId = await demo.userFromJwt(jwt);
      if (!userId) return c.json({ error: "unauthorized" }, 401);
      return c.json(await resetDemo(demo, userId));
    } catch (e) {
      return failed(c, "/api/demo/reset", e);
    }
  });

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  return app;
}
