// Creates or updates Munim, the ElevenLabs call agent, from the repo:
//   pnpm agent:sync        (reads .env if present)
// Needs ELEVENLABS_API_KEY. With ELEVENLABS_AGENT_ID set it updates that agent;
// without, it creates one and prints the ID to put in Render's `tagada-env`.
// The prompt is apps/server/src/agent/prompt.md; the rest is agent/config.ts.
import { syncAgent } from "../apps/server/src/agent/sync.ts";

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set (see .env.example)");

const result = await syncAgent({ apiKey, agentId: process.env.ELEVENLABS_AGENT_ID || null, log: (line) => console.log(line) });
console.log("");
console.log(`ELEVENLABS_AGENT_ID=${result.agentId}`);
if (result.created) {
  console.log("Put this in the `tagada-env` group on Render and in .env, then redeploy the server.");
  console.log(
    "In the ElevenLabs dashboard, point the post-call webhook at https://<server>/webhooks/elevenlabs " +
      "and put its secret in ELEVENLABS_WEBHOOK_SECRET.",
  );
}
