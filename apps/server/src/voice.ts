// Read-aloud for the pay link: ElevenLabs text to speech, in the call agent's
// voice (Monika Sogam) and model, so the slip sounds like Munim.
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
