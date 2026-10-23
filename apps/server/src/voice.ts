// Read-aloud for the pay link: ElevenLabs text to speech, in the call agent's
// voice (Monika Sogam) and model, so the slip sounds like Munim.
import type { Agent } from "./call.ts";
import type { Voice } from "./pay.ts";

const VOICE_ID = "2zRM7PkgwBPiau2jvVXc";
const MODEL_ID = "eleven_v4_turbo";

export function elevenLabsVoice(apiKey: string | undefined): Voice {
  return {
    async speak(text) {
      if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set (see .env.example)");
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_64`, {
        method: "POST",
        headers: { "xi-api-key": apiKey, "content-type": "application/json", accept: "audio/mpeg" },
        body: JSON.stringify({ text, model_id: MODEL_ID, language_code: "hi" }),
      });
      if (!res.ok) throw new Error(`ElevenLabs text to speech: ${res.status} ${await res.text()}`);
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}

/**
 * The private call agent (`enable_auth` on): a WebRTC conversation token per
 * call, so the agent ID alone cannot start a call. Null when not configured.
 */
export function elevenLabsAgent(apiKey: string | undefined, agentId: string | undefined): Agent | null {
  if (!apiKey || !agentId) return null;
  return {
    async token() {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
        { headers: { "xi-api-key": apiKey } },
      );
      if (!res.ok) throw new Error(`ElevenLabs conversation token: ${res.status} ${await res.text()}`);
      const body = (await res.json()) as { token?: unknown; conversation_id?: unknown };
      if (typeof body.token !== "string") throw new Error("ElevenLabs conversation token: no token");
      return { token: body.token, conversationId: typeof body.conversation_id === "string" ? body.conversation_id : null };
    },
  };
}
