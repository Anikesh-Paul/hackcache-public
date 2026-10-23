import { randomBytes } from "node:crypto";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { claimedUserId, resetDemo, startDemo, workspaceIdFor, type DemoDeps } from "./demo.ts";
import { issueInvoice } from "./invoices.ts";

export type AppDeps = {
  /** Resolves when Appwrite answers a read made with the server's API key. */
  probeAppwrite: () => Promise<void>;
  demo: DemoDeps;
  /** Browser origin allowed to call /api (the static site). */
  webOrigin?: string;
};

export function createApp({ probeAppwrite, demo, webOrigin }: AppDeps) {
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
        payToken: () => randomBytes(16).toString("hex"),
      });
      if (!result.ok) return c.json({ error: result.error }, result.status);
      return c.json({ invoice: result.invoice, customer: result.customer });
    } catch (e) {
      return failed(c, "/api/invoices", e);
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
