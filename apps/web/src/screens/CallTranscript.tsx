// A past call's transcript on its Invoice: the lines the post-call webhook
// stored on the call row, behind a toggle on the timeline's "Call with AI" line.
import { useState } from "react";
import { Languages } from "lucide-react";
import type { CallRow } from "@tagada/appwrite";
import { callTurns, spokenName, type CallTurn } from "@tagada/domain";
import { useT } from "../i18n/index.ts";
import { rowsOf } from "../lib/appwrite.ts";
import { glossOf } from "../lib/call.ts";
import { clockOf } from "../lib/call-script.ts";
import { useWorld } from "../lib/world.tsx";

type Loaded = { state: "loading" } | { state: "failed" } | { state: "none" } | { state: "ready"; turns: CallTurn[] };

/** The call this timeline event is about: set on the webhook's "Call with AI" line (and the seeded one), which carry a conversation. */
export function transcriptCallId(payload: string | null): string | null {
  try {
    const p = JSON.parse(payload ?? "null") as { callId?: unknown; conversationId?: unknown } | null;
    return typeof p?.callId === "string" && typeof p.conversationId === "string" ? p.callId : null;
  } catch {
    return null;
  }
}

export function CallTranscript({ callId, invoiceId, customerName }: { callId: string; invoiceId: string; customerName: string }) {
  const t = useT();
  const world = useWorld();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [gloss, setGloss] = useState<string[] | "loading" | "failed" | null>(null);

  // Read when first opened: the row is written a minute after the call, so a failed or empty read is asked again on the next open.
  const toggle = async () => {
    const opening = !open;
    setOpen(opening);
    if (!opening || loaded?.state === "ready" || loaded?.state === "loading") return;
    setLoaded({ state: "loading" });
    try {
      const rows = await rowsOf<CallRow>("calls", world.workspace.$id, { invoiceId });
      const turns = callTurns(rows.find((row) => row.$id === callId)?.transcript ?? null);
      setLoaded(turns ? { state: "ready", turns } : { state: "none" });
    } catch (e) {
      console.error("call transcript failed to load", e);
      setLoaded({ state: "failed" });
    }
  };

  const english = async (turns: CallTurn[]) => {
    if (Array.isArray(gloss)) return setGloss(null);
    setGloss("loading");
    try {
      // The gloss takes at most 20 lines a request.
      const chunks = Array.from({ length: Math.ceil(turns.length / 20) }, (_, i) => turns.slice(i * 20, i * 20 + 20));
      const out = await Promise.all(chunks.map((chunk) => glossOf(chunk.map((turn) => turn.message))));
      setGloss(out.every((lines) => lines !== null) ? out.flat() : "failed");
    } catch {
      setGloss("failed");
    }
  };

  const name = `${spokenName(customerName)} ji`;
  return (
    <div className="mt-1">
      <button type="button" className="linkbtn text-sm" aria-expanded={open} onClick={toggle}>
        {open ? t.invoice.hideTranscript : t.invoice.showTranscript}
      </button>
      {open && loaded && (
        <div className="transcript mt-2">
          {loaded.state === "loading" && <p className="text-sm text-ink-2">{t.invoice.transcriptLoading}</p>}
          {loaded.state === "failed" && (
            <p className="text-sm" role="alert">
              {t.invoice.transcriptFailed}
            </p>
          )}
          {loaded.state === "none" && <p className="text-sm text-ink-2">{t.invoice.transcriptNone}</p>}
          {loaded.state === "ready" && (
            <>
              <ol className="grid gap-2" aria-label={t.call.transcript}>
                {loaded.turns.map((turn, i) => (
                  <li key={`${turn.at}-${i}`}>
                    <small className="block text-ink-2">
                      <b>{turn.role === "agent" ? t.sample.who.munim : name}</b> {clockOf(turn.at)}
                    </small>
                    <span lang="hi">{turn.message}</span>
                    {/* A line already said in English needs no gloss. */}
                    {Array.isArray(gloss) && gloss[i] && gloss[i] !== turn.message && <span className="gloss">{gloss[i]}</span>}
                  </li>
                ))}
              </ol>
              <button
                type="button"
                className="btn bare mt-2"
                aria-pressed={Array.isArray(gloss)}
                disabled={gloss === "loading"}
                onClick={() => english(loaded.turns)}
              >
                <Languages aria-hidden /> {t.call.gloss}
              </button>
              {gloss === "failed" && <small className="block text-ink-2">{t.call.glossFailed}</small>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
