import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { adminClient, appwriteFiles, appwriteWorlds, probeAppwrite, userFromJwt } from "./appwrite.ts";
import { requireEnv } from "./env.ts";
import { payTokens } from "./pay-token.ts";
import { geminiGloss } from "./gloss.ts";
import { geminiProof } from "./proof-read.ts";
import { elevenLabsAgent, elevenLabsVoice } from "./voice.ts";
import { resendMailer } from "./email.ts";
import { renderRunner } from "./workflows.ts";

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
  ladder: {
    mailer: resendMailer(process.env.RESEND_API_KEY, process.env.EMAIL_FROM_DOMAIN),
    demoInbox: process.env.DEMO_INBOX_EMAIL || null,
    webOrigin: process.env.WEB_ORIGIN ?? "",
    // On Render the stepper runs the same dailyLadder workflow as the cron; locally, the same code in this process.
    runner: process.env.RENDER ? renderRunner() : undefined,
  },
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`server listening on :${port}`));
