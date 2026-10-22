import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { adminClient, probeAppwrite } from "./appwrite.ts";

const admin = adminClient();
const app = createApp({
  probeAppwrite: () => probeAppwrite(admin),
  webOrigin: process.env.WEB_ORIGIN,
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`server listening on :${port}`));
