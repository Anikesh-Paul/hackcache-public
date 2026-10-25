import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { adminClient, appwriteFiles, appwriteWorlds, probeAppwrite, userFromJwt } from "./appwrite.ts";
import { requireEnv } from "./env.ts";
import { payTokens } from "./pay-token.ts";
import { geminiGloss } from "./gloss.ts";
import { geminiProof } from "./proof-read.ts";
import { elevenLabsAgent, elevenLabsVoice } from "./voice.ts";
import { mailsCustomers, resendMailer } from "./email.ts";
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
    mailCustomers: mailsCustomers(process.env.RESEND_API_KEY, process.env.EMAIL_FROM_DOMAIN),
    webOrigin: process.env.WEB_ORIGIN ?? "",
    // On Render the stepper runs the same dailyLadder workflow as the cron; locally, the same code in this process.
    runner: process.env.RENDER ? renderRunner() : undefined,
  },
});

// Said once at start, so a missing key shows in the logs and not only as a dead button.
if (!process.env.ELEVENLABS_API_KEY) console.warn("voice: ELEVENLABS_API_KEY is not set, so calls and read-aloud are off");
else if (!process.env.ELEVENLABS_AGENT_ID) console.warn("voice: ELEVENLABS_AGENT_ID is not set, so calls are off (run pnpm agent:sync)");
if (!process.env.ELEVENLABS_WEBHOOK_SECRET) console.warn("voice: ELEVENLABS_WEBHOOK_SECRET is not set, so call transcripts are not kept");

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`server listening on :${port}`));
