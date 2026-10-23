import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { adminClient, appwriteWorlds, probeAppwrite, userFromJwt } from "./appwrite.ts";

const admin = adminClient();
const app = createApp({
  probeAppwrite: () => probeAppwrite(admin),
  // Seeding the rest of a world after answering: the task logs its own failure.
  demo: { userFromJwt, worlds: appwriteWorlds(admin), later: () => {} },
  webOrigin: process.env.WEB_ORIGIN,
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`server listening on :${port}`));
