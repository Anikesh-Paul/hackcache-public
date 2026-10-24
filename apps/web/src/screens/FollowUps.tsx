// Today's follow-ups (build plan §6.3, Today): what the Ladder wants on the
// Demo date, each with its ready message and a WhatsApp or email button; what
// the 10:00 run already sent; failed sends and their retry; money already in
// the bank, to confirm rather than chase.
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { AlertTriangle, Check, Clock, FileText, Landmark, Mail, MessageCircle, Phone, Send } from "lucide-react";
import type { BankTxnRow } from "@tagada/appwrite";
import { formatInr } from "@tagada/money";
import { REPEAT_REFUSED_WORDS } from "@tagada/domain";
import { followUps, type FollowUp, type FollowUpState } from "../lib/follow-ups.ts";
import { markReminderSent } from "../lib/appwrite.ts";
import { bankSuggestionsOf } from "../lib/today.ts";
import { usePaymentHistory, useReminders, useWorkspaceRows, useWorld } from "../lib/world.tsx";
import { Head, Ln } from "../ui.tsx";
import { reminderName, useT, type Copy } from "../i18n/index.ts";

const STATE: Record<FollowUpState, { icon: typeof Check; tone: "ok" | "warn" | "short" | "plain" }> = {
  sent: { icon: Check, tone: "ok" },
  failed: { icon: AlertTriangle, tone: "short" },
  in_bank: { icon: Landmark, tone: "ok" },
  ready: { icon: Send, tone: "warn" },
  capped: { icon: Clock, tone: "plain" },
  due: { icon: Clock, tone: "plain" },
};

function explain(t: Copy, f: FollowUp): string {
  const words = t.followUps.explain;
  switch (f.state) {
    case "sent":
      return f.channel === "email" ? words.sentEmail : words.sentByYou;
    case "failed":
      if (!f.error) return "";
      return f.error === REPEAT_REFUSED_WORDS ? t.automation.repeatRefused : t.automation.sendFailed;
    case "in_bank":
      return words.inBank;
    case "ready":
      return f.stage <= 3 ? words.off : words.yours;
    case "capped":
      return words.capped(f.customerName);
    case "due":
      return words.due;
  }
}

export function FollowUps() {
  const world = useWorld();
  const reminders = useReminders();
  const history = usePaymentHistory();
  const credits = useWorkspaceRows<BankTxnRow>("bank_txns", true);
  const t = useT();
  // Wait for the bank too, so a Customer whose money is there is never shown a reminder first.
  const status = reminders === "failed" || credits === "failed" ? "failed" : reminders === "loading" || credits === null ? "loading" : "ready";
  const items = useMemo(
    () =>
      Array.isArray(reminders) && Array.isArray(credits)
        ? followUps({
            workspace: world.workspace,
            invoices: world.invoices,
            customers: world.customers,
            promisesByInvoice: world.promisesByInvoice,
            reminders,
            events: Array.isArray(history) ? history : [],
            bankCredits: bankSuggestionsOf(credits),
            payUrl: (token) => `${window.location.origin}/pay/${token ?? ""}`,
          })
        : [],
    [world, reminders, history, credits],
  );

  return (
    <div className="sect">
      <Head title={t.followUps.title} a={status === "ready" ? String(items.length) : undefined} />
      <div className="entries" aria-live="polite">
        {status === "loading" ? (
          <Ln>
            <span className="text-ink-2">{t.followUps.reading}</span>
          </Ln>
        ) : status === "failed" ? (
          <Ln>
            <span className="word short">{t.followUps.unreadable}</span>
          </Ln>
        ) : items.length === 0 ? (
          <Ln>
            <span className="text-ink-2">{t.followUps.none}</span>
          </Ln>
        ) : (
          items.map((f) => <FollowUpLine key={`${f.invoiceId}:${f.stage}:${f.state}:${f.amountPaise}`} f={f} />)
        )}
      </div>
    </div>
  );
}

function FollowUpLine({ f }: { f: FollowUp }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const t = useT();
  const state = STATE[f.state];
  // Stage 6 has no message, only the ODR case file, so its line shows just that link.
  const canSend = f.state !== "sent" && f.state !== "capped" && f.state !== "in_bank";

  // The link opens on its own; the Ladder only moves on once the server has it.
  const sent = async (channel: "whatsapp_link" | "email") => {
    setBusy(true);
    setProblem(null);
    try {
      await markReminderSent({ invoiceId: f.invoiceId, stage: f.stage, channel });
    } catch (e) {
      console.error("could not record the send", e);
      setProblem(t.followUps.noted);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Ln a={formatInr(f.amountPaise)} className="ruler">
      <span className={`word ${state.tone}`}>
        <state.icon aria-hidden /> {t.followUps.word[f.state](f.sentAt)}
      </span>
      {f.inBankLine ? (
        <span className="mt-1 block">
          {t.followUps.inBankLine(formatInr(f.amountPaise), f.customerName)} <Link to="/app/bank">{t.followUps.confirmIt}</Link>
          <small>
            <Link to={`/app/invoices/${f.invoiceId}`} className="mono">
              {f.number}
            </Link>
          </small>
        </span>
      ) : (
        <span className="mt-1 block">
          {t.followUps.stageFor(reminderName(t, f.stage))}{" "}
          <Link to={`/app/invoices/${f.invoiceId}`}>{f.customerName}</Link>,{" "}
          <span className="mono">{f.number}</span>
        </span>
      )}
      <small>{explain(t, f)}</small>
      {canSend && (
        <>
          {f.text && (
            <details className="mt-1 text-sm">
              <summary className="cursor-pointer text-ink-2">{t.followUps.message}</summary>
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
                  <Mail aria-hidden /> {t.followUps.email}
                </a>
              </>
            )}
            {f.canCall && (
              <Link className="btn secondary" to={`/call/${f.invoiceId}`}>
                <Phone aria-hidden /> {t.common.callWithAi}
              </Link>
            )}
            {f.document && (
              <Link className="btn secondary" to={f.document === "letter" ? `/print/letter/${f.invoiceId}` : `/print/case/${f.invoiceId}`}>
                <FileText aria-hidden /> {f.document === "letter" ? t.common.demandLetter : t.common.caseFile}
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
