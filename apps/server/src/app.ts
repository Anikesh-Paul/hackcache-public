import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

export type AppDeps = {
  /** Resolves when Appwrite answers a read made with the server's API key. */
  probeAppwrite: () => Promise<void>;
  /** Browser origin allowed to call /api (the static site). */
  webOrigin?: string;
};

export function createApp({ probeAppwrite, webOrigin }: AppDeps) {
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

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  return app;
}
