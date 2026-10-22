import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { adminClient, appwriteWorlds, probeAppwrite, userFromJwt } from "./appwrite.ts";

const admin = adminClient();
const app = createApp({
  probeAppwrite: () => probeAppwrite(admin),
  demo: { userFromJwt, worlds: appwriteWorlds(admin) },
  webOrigin: process.env.WEB_ORIGIN,
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`server listening on :${port}`));
