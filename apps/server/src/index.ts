import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { adminClient, appwriteFiles, appwriteWorlds, probeAppwrite, userFromJwt } from "./appwrite.ts";
import { requireEnv } from "./env.ts";
import { payTokens } from "./pay-token.ts";
import { geminiGloss } from "./gloss.ts";
import { geminiProof } from "./proof-read.ts";
import { elevenLabsAgent, elevenLabsVoice } from "./voice.ts";

const admin = adminClient();
const app = createApp({
  probeAppwrite: () => probeAppwrite(admin),
  // Seeding the rest of a world after answering: the task logs its own failure.
  demo: {
    userFromJwt,
    worlds: appwriteWorlds(admin),
    later: () => {},
    tokens: payTokens(requireEnv("PAY_TOKEN_SECRET")),
  },
  files: appwriteFiles(admin),
  voice: elevenLabsVoice(process.env.ELEVENLABS_API_KEY),
  proof: geminiProof(process.env.GEMINI_API_KEY),
  call: {
    agent: elevenLabsAgent(process.env.ELEVENLABS_API_KEY, process.env.ELEVENLABS_AGENT_ID),
    webhookSecret: process.env.ELEVENLABS_WEBHOOK_SECRET || null,
    gloss: geminiGloss(process.env.GEMINI_API_KEY),
  },
  webOrigin: process.env.WEB_ORIGIN,
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`server listening on :${port}`));
