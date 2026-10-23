// One Call with AI in the browser: the private session from the server, the
// two client tools, and the transcript as ledger lines. The agent never
// decides money: `propose_plan` asks the Plan rule here, and `record_outcome`
// is checked again by the server before anything is written.
import { useCallback, useEffect, useRef, useState } from "react";
import { VoiceConversation } from "@elevenlabs/client";
import type { CallSession } from "@tagada/appwrite";
import { checkOutcome, proposePlan, stripTags, type CallOutcome, type Instalment } from "@tagada/domain";
import { hindiRupees } from "@tagada/money";
import { amountSaid } from "./call-script.ts";
import { ownerApi } from "./appwrite.ts";

export type Line = {
  id: string;
  kind: "agent" | "user" | "check";
  text: string;
  /** Seconds into the call. */
  at: number;
  amountPaise: number | null;
  /** For a rule check: inside the rule. */
  ok?: boolean;
};

export type Phase =
  | { name: "ready" }
  | { name: "connecting" }
  | { name: "live"; mode: "listening" | "speaking" }
  | { name: "ended"; seconds: number }
  | { name: "failed"; why: "mic_denied" | "no_answer" | "blocked" | "unavailable"; message: string };

/** What the call recorded, as the Owner sees it. `promiseId` is set once the server has saved it. */
export type Recorded = { outcome: CallOutcome; promiseId: string | null; saved: boolean };

export type Decision = "approve" | "decline" | "counter" | "undo";

const NO_ANSWER_MS = 20_000;

let lineIds = 0;
const nextId = () => `l${++lineIds}`;

export function useCall(invoiceId: string) {
  const [phase, setPhase] = useState<Phase>({ name: "ready" });
  const [lines, setLines] = useState<Line[]>([]);
  const [recorded, setRecorded] = useState<Recorded | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const convo = useRef<VoiceConversation | null>(null);
  const startedAt = useRef<number | null>(null);
  const heard = useRef(false);
  const known = useRef(new Map<string, number>());

  const add = useCallback((line: Omit<Line, "id" | "at">) => {
    const at = startedAt.current === null ? 0 : (performance.now() - startedAt.current) / 1000;
    setLines((now) => [...now, { ...line, id: nextId(), at }]);
  }, []);

  useEffect(
    () => () => {
      void convo.current?.endSession();
    },
    [],
  );

  const start = useCallback(async () => {
    setPhase({ name: "connecting" });
    setLines([]);
    setRecorded(null);
    heard.current = false;
    startedAt.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) track.stop();
    } catch {
      setPhase({
        name: "failed",
        why: "mic_denied",
        message: "The microphone is blocked, so the call cannot start. Allow it in the browser's address bar and try again.",
      });
      return;
    }

    let session: CallSession;
    try {
      const { status, data } = await ownerApi<CallSession & { error?: string; message?: string }>(
        `/api/call/signed-url?invoiceId=${encodeURIComponent(invoiceId)}`,
      );
      if (status !== 200 || !data?.conversationToken) {
        setPhase({
          name: "failed",
          why: status === 403 || status === 429 ? "blocked" : "unavailable",
          message: data?.message ?? "The call could not be set up. Try again in a minute.",
        });
        return;
      }
      session = data;
      setCallId(data.callId);
    } catch {
      setPhase({ name: "failed", why: "unavailable", message: "The server could not be reached. Try again in a minute." });
      return;
    }

    const ctx = session.context;
    known.current = new Map([[hindiRupees(ctx.owedPaise), ctx.owedPaise]]);

    const clientTools = {
      propose_plan: (args: unknown) => {
        const { reply, check, said } = proposePlan(ctx, args);
        for (const s of said) known.current.set(s.words, s.paise);
        if (check) add({ kind: "check", text: check.note, amountPaise: check.offeredPaise, ok: check.accepted });
        return JSON.stringify(reply);
      },
      record_outcome: async (args: unknown) => {
        const local = checkOutcome(ctx, args);
        if (!local.ok) return local.say;
        // The books move at once; the server's answer confirms or takes it back.
        setRecorded({ outcome: local.outcome, promiseId: null, saved: false });
        try {
          const { status, data } = await ownerApi<{ say: string; promiseId?: string | null }>("/api/call/outcome", {
            method: "POST",
            body: JSON.stringify({ callId: session.callId, invoiceId, args }),
          });
          if (status !== 200) {
            setRecorded(null);
            return data?.say ?? "error: not recorded. Say the owner will call back, then call end_call.";
          }
          setRecorded({ outcome: local.outcome, promiseId: data?.promiseId ?? null, saved: true });
          return "recorded";
        } catch {
          setRecorded(null);
          return "error: not recorded. Say the owner will call back, then call end_call.";
        }
      },
    };

    let noAnswer: ReturnType<typeof setTimeout> | undefined;
    try {
      convo.current = await VoiceConversation.startSession({
        conversationToken: session.conversationToken,
        connectionType: "webrtc",
        dynamicVariables: session.dynamicVariables,
        clientTools,
        onConnect: () => {
          startedAt.current = performance.now();
          setPhase({ name: "live", mode: "listening" });
          noAnswer = setTimeout(() => {
            if (!heard.current) void convo.current?.endSession();
          }, NO_ANSWER_MS);
        },
        onModeChange: ({ mode }) => setPhase((now) => (now.name === "live" ? { name: "live", mode } : now)),
        onMessage: ({ message, role }) => {
          const text = stripTags(message);
          if (!text) return;
          heard.current = true;
          add({ kind: role === "agent" ? "agent" : "user", text, amountPaise: amountSaid(text, known.current) });
        },
        onDisconnect: () => {
          clearTimeout(noAnswer);
          const seconds = startedAt.current === null ? 0 : Math.round((performance.now() - startedAt.current) / 1000);
          convo.current = null;
          setPhase(
            heard.current
              ? { name: "ended", seconds }
              : { name: "failed", why: "no_answer", message: "No answer. The call connected, but nothing was said." },
          );
        },
        onError: (message) => console.error("call error", message),
      });
    } catch (e) {
      console.error("call did not start", e);
      setPhase({ name: "failed", why: "unavailable", message: "The call could not connect. Try again in a minute." });
    }
  }, [add, invoiceId]);

  const end = useCallback(() => void convo.current?.endSession(), []);

  return { phase, lines, recorded, callId, start, end };
}

/** The Owner's Approve, Decline, Counter or Undo. */
export async function decidePromise(
  promiseId: string,
  action: Decision,
): Promise<{ status: string; counter: Instalment[] | null }> {
  const { status, data } = await ownerApi<{ status: string; counter: Instalment[] | null; error?: string }>(
    `/api/promises/${encodeURIComponent(promiseId)}/decide`,
    { method: "POST", body: JSON.stringify({ action }) },
  );
  if (status !== 200 || !data) throw new Error(data?.error ?? "decide_failed");
  return data;
}

/** English for Hindi transcript lines; null when the gloss is not available. */
export async function glossOf(lines: readonly string[]): Promise<string[] | null> {
  const { status, data } = await ownerApi<{ gloss: string[] }>("/api/call/gloss", {
    method: "POST",
    body: JSON.stringify({ lines }),
  });
  return status === 200 && data ? data.gloss : null;
}
