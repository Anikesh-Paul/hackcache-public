// The call transcript's English gloss for the Owner: Gemini, one line for one
// line. Words only; nothing here touches money.
import type { Gloss } from "./call.ts";

const MODEL = "gemini-3.8-flash";

export function geminiGloss(apiKey: string | undefined): Gloss | null {
  if (!apiKey) return null;
  return {
    async english(lines) {
      const prompt =
        "Translate each line of this Hindi phone call into short, plain English. Keep amounts and dates as said. " +
        "Answer with one English line per input line, in the same order.\n\n" +
        lines.map((l, i) => `${i + 1}. ${l}`).join("\n");
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: { type: "ARRAY", items: { type: "STRING" } },
            thinkingConfig: { thinkingLevel: "low" },
          },
        }),
      });
      if (!res.ok) throw new Error(`Gemini gloss: ${res.status} ${await res.text()}`);
      const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const out = JSON.parse(body.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]") as unknown;
      if (!Array.isArray(out) || out.length !== lines.length || !out.every((l) => typeof l === "string")) {
        throw new Error("Gemini gloss: not one line per line");
      }
      return out as string[];
    },
  };
}
