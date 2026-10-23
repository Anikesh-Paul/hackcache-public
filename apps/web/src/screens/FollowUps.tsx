// Today's follow-ups (build plan §6.3, Today): what the Ladder wants on the
// Demo date, each with its ready message and a WhatsApp or email button; what
// the 10:00 run already sent; failed sends and their retry.
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { AlertTriangle, Check, Clock, FileText, Mail, MessageCircle, Phone, Send } from "lucide-react";
import { formatInr } from "@tagada/money";
import { followUps, type FollowUp, type FollowUpState } from "../lib/follow-ups.ts";
import { markReminderSent } from "../lib/appwrite.ts";
import { usePaymentHistory, useReminders, useWorld } from "../lib/world.tsx";
import { Head, Ln } from "../ui.tsx";

const STATE: Record<FollowUpState, { icon: typeof Check; tone: "ok" | "warn" | "short" | "plain"; word: (f: FollowUp) => string }> = {
  sent: { icon: Check, tone: "ok", word: (f) => (f.sentAt ? `Sent ${f.sentAt}` : "Sent") },
  failed: { icon: AlertTriangle, tone: "short", word: () => "Failed, retrying" },
  ready: { icon: Send, tone: "warn", word: () => "Ready to send" },
  capped: { icon: Clock, tone: "plain", word: () => "Tomorrow" },
  due: { icon: Clock, tone: "plain", word: () => "Goes at 10:00" },
};

function explain(f: FollowUp): string {
  switch (f.state) {
    case "sent":
      return f.channel === "email" ? "Emailed by the daily run." : "You sent it.";
    case "failed":
      return `Email to ${f.customerName} failed, retrying${f.error ? `: ${f.error}` : ""}.`;
    case "ready":
      return f.stage <= 3 ? "Switched off in Settings, so it waits for you." : "This step is always yours to take.";
    case "capped":
      return `${f.customerName} already had a message today; one a day at most.`;
    case "due":
      return "The daily run emails it at 10:00.";
  }
}

export function FollowUps() {
  const world = useWorld();
  const reminders = useReminders();
  const history = usePaymentHistory();
  const items = useMemo(
    () =>
      Array.isArray(reminders)
        ? followUps({
            workspace: world.workspace,
            invoices: world.invoices,
            customers: world.customers,
            promisesByInvoice: world.promisesByInvoice,
            reminders,
            events: Array.isArray(history) ? history : [],
            payUrl: (token) => `${window.location.origin}/pay/${token ?? ""}`,
          })
        : [],
    [world, reminders, history],
  );

  return (
    <div className="sect">
      <Head title="Today's follow-ups" a={reminders === "loading" ? undefined : String(items.length)} />
      <div className="entries" aria-live="polite">
        {reminders === "loading" ? (
          <Ln>
            <span className="text-ink-2">Reading the Ladder…</span>
          </Ln>
        ) : reminders === "failed" ? (
          <Ln>
            <span className="word short">The follow-ups could not be read. Reload the page to try again.</span>
          </Ln>
        ) : items.length === 0 ? (
          <Ln>
            <span className="text-ink-2">Nothing for the Ladder today.</span>
          </Ln>
        ) : (
          items.map((f) => <FollowUpLine key={`${f.invoiceId}:${f.stage}:${f.state}`} f={f} />)
        )}
      </div>
    </div>
  );
}

function FollowUpLine({ f }: { f: FollowUp }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const state = STATE[f.state];
  // Stage 6 has no message, only the ODR case file, so its line shows just that link.
  const canSend = f.state !== "sent" && f.state !== "capped";

  // The link opens on its own; the Ladder only moves on once the server has it.
  const sent = async (channel: "whatsapp_link" | "email") => {
    setBusy(true);
    setProblem(null);
    try {
      await markReminderSent({ invoiceId: f.invoiceId, stage: f.stage, channel });
    } catch (e) {
      console.error("could not record the send", e);
      setProblem("Sent, but it could not be noted here. Tap again to note it.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Ln a={formatInr(f.amountPaise)} className="ruler">
      <span className={`word ${state.tone}`}>
        <state.icon aria-hidden /> {state.word(f)}
      </span>
      <span className="mt-1 block">
        {f.stageName} for <Link to={`/app/invoices/${f.invoiceId}`}>{f.customerName}</Link>,{" "}
        <span className="mono">{f.number}</span>
      </span>
      <small>{explain(f)}</small>
      {canSend && (
        <>
          {f.text && (
            <details className="mt-1 text-sm">
              <summary className="cursor-pointer text-ink-2">The message</summary>
              <p className="mt-1 whitespace-pre-line">{f.text}</p>
            </details>
          )}
          <span className="mt-2 flex flex-wrap gap-2">
            {f.text && (
              <>
                <a className="btn secondary" href={f.whatsapp} target="_blank" rel="noreferrer" onClick={() => void sent("whatsapp_link")} aria-disabled={busy}>
                  <MessageCircle aria-hidden /> WhatsApp
                </a>
                <a className="btn secondary" href={f.mailto} onClick={() => void sent("email")} aria-disabled={busy}>
                  <Mail aria-hidden /> Email
                </a>
              </>
            )}
            {f.canCall && (
              <Link className="btn secondary" to={`/call/${f.invoiceId}`}>
                <Phone aria-hidden /> Call with AI
              </Link>
            )}
            {f.document && (
              <Link className="btn secondary" to={f.document === "letter" ? `/print/letter/${f.invoiceId}` : `/print/case/${f.invoiceId}`}>
                <FileText aria-hidden /> {f.document === "letter" ? "Payment Demand Letter" : "ODR case file"}
              </Link>
            )}
          </span>
          {problem && (
            <small role="alert" className="text-sindoor">
              {problem}
            </small>
          )}
        </>
      )}
    </Ln>
  );
}
