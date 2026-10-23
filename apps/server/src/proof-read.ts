// Gemini reads a UPI screenshot. It returns the amount as printed text; the
// server parses that text with `money` and never asks the model for a number.

const MODEL = "gemini-3.8-flash";

export type ProofImage = { bytes: Uint8Array; mime: string };

/** Turns a screenshot into the model's JSON object. The caller parses it. */
export type ProofReader = {
  read(image: ProofImage): Promise<unknown>;
};

const PROMPT =
  "Read this UPI or bank payment screenshot. " +
  "Return the UTR or RRN as printed, the amount exactly as printed (keep the rupee sign and commas; do not calculate or convert it), " +
  "the date as printed, the payee UPI id (or an empty string), and your confidence from 0 to 1. " +
  "The amount must be text, not a number.";

/** Gemini `gemini-3.8-flash` with the proof response schema, or null when no key is set. */
export function geminiProof(apiKey: string | undefined): ProofReader | null {
  if (!apiKey) return null;
  return {
    async read({ bytes, mime }) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: PROMPT },
                { inline_data: { mime_type: mime, data: Buffer.from(bytes).toString("base64") } },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                utr: { type: "STRING" },
                amountText: { type: "STRING" },
                dateText: { type: "STRING" },
                payeeVpa: { type: "STRING" },
                confidence: { type: "NUMBER" },
              },
              required: ["utr", "amountText", "dateText", "payeeVpa", "confidence"],
            },
            thinkingConfig: { thinkingLevel: "low" },
          },
        }),
      });
      if (!res.ok) throw new Error(`Gemini proof: ${res.status} ${await res.text()}`);
      const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      return JSON.parse(body.candidates?.[0]?.content?.parts?.[0]?.text ?? "null") as unknown;
    },
  };
}
