// /app/automation: every daily Ladder run, each Reminder under its key, the
// one seeded retry, and a copy of every email that really went out (Sent
// mail). The only Owner screen that shows Reminder keys, and the provider's own
// error, folded away under a plain sentence.
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Mail, RotateCcw } from "lucide-react";
import type { EventRow, ReminderRow, WorkflowRunRow } from "@tagada/appwrite";
import { isRepeatRefused } from "@tagada/domain";
import { istDay, istTime } from "../lib/pricing.ts";
import { usePaymentHistory, useReminders, useWorkspaceRows, useWorld, type World } from "../lib/world.tsx";
import { Head, Ln, Paper } from "../ui.tsx";
import { reminderName, useT, type Copy } from "../i18n/index.ts";

const SHOWN_RUNS = 8;

/** "failed → retried → sent" when a send needed more than one try. */
function story(t: Copy, r: ReminderRow): string {
  const tries = r.attempts ?? 0;
  if (r.status === "sent" && tries > 1) return t.automation.story.retriedSent(tries);
  if (r.status === "failed" && isRepeatRefused(r.error)) return t.automation.story.repeat;
  if (r.status === "failed" && tries > 1) return t.automation.story.failedTimes(tries);
  return t.automation.status[r.status];
}

function ReminderLine({ r, world }: { r: ReminderRow; world: World }) {
  const invoice = world.invoices.find((i) => i.$id === r.invoiceId);
  const t = useT();
  return (
    <Ln m={r.sentDate ? t.date(r.sentDate, { weekday: false }) : ""} className="ruler">
      <span className="block">
        {t.automation.reminderFor(reminderName(t, r.stage), world.customers.get(r.customerId)?.name ?? t.common.aCustomer)}
        {invoice && (
          <>
            , <Link to={`/app/invoices/${invoice.$id}`} className="mono">{invoice.number}</Link>
          </>
        )}
        : <span className={r.status === "failed" ? "text-sindoor" : ""}>{story(t, r)}</span>
      </span>
      <small>
        {t.automation.key} <span className="mono">{r.$id}</span>
      </small>
      {r.error && r.status === "failed" && (
        <small>{isRepeatRefused(r.error) ? t.automation.repeatRefused : t.automation.sendFailed}</small>
      )}
      {r.error && (
        <details className="text-sm text-ink-2">
          <summary className="cursor-pointer">{t.automation.serviceSaid}</summary>
          <p className="mono mt-1 break-words">{r.error}</p>
        </details>
      )}
    </Ln>
  );
}

function RunCard({ run, reminders, world }: { run: WorkflowRunRow; reminders: ReminderRow[]; world: World }) {
  const mine = reminders.filter((r) => r.runId === run.runId);
  const time = istTime(run.startedAt);
  const t = useT();
  return (
    <Ln className="ruler">
      <details>
        <summary className="cursor-pointer list-none">
          <span className="font-semibold">{t.date(run.demoDate)}</span> <span className="text-ink-2">{t.automation.at(time)}</span>
          <span className="block text-sm text-ink-2">
            {t.automation.runLine({
              scanned: run.invoicesScanned,
              sent: run.sent,
              duplicate: run.skippedDuplicate,
              retried: run.retried,
              failed: run.failed,
            })}
            {(run.skippedInBank ?? 0) > 0 && t.automation.inBank(run.skippedInBank ?? 0)}
          </span>
        </summary>
        <div className="entries mt-2">
          {mine.length === 0 ? (
            <Ln>
              <small>{t.automation.nothingOnRun}</small>
            </Ln>
          ) : (
            mine.map((r) => <ReminderLine key={r.$id} r={r} world={world} />)
          )}
        </div>
      </details>
    </Ln>
  );
}

type SentMail = { event: EventRow; to: string; fromName: string; subject: string; text: string; customer: string; number: string };

function sentMail(world: World, events: readonly EventRow[]): SentMail[] {
  const out: SentMail[] = [];
  for (const event of events) {
    if (event.type !== "reminder" || !event.payload) continue;
    let email: Partial<Omit<SentMail, "event" | "customer" | "number">> | undefined;
    try {
      email = (JSON.parse(event.payload) as { email?: typeof email }).email;
    } catch {
      continue;
    }
    if (!email || typeof email.subject !== "string") continue;
    const invoice = world.invoices.find((i) => i.$id === event.invoiceId);
    out.push({
      event,
      to: email.to ?? "",
      fromName: email.fromName ?? "",
      subject: email.subject,
      text: email.text ?? "",
      customer: (invoice && world.customers.get(invoice.customerId)?.name) ?? "",
      number: invoice?.number ?? "",
    });
  }
  return out.sort((a, b) => b.event.at.localeCompare(a.event.at));
}

export function Automation() {
  const world = useWorld();
  const reminders = useReminders();
  const history = usePaymentHistory();
  const runs = useWorkspaceRows<WorkflowRunRow>("workflow_runs", true);
  const [all, setAll] = useState(false);
  const t = useT();

  const sorted = useMemo(
    () => (Array.isArray(runs) ? [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)) : []),
    [runs],
  );
  const list = Array.isArray(reminders) ? reminders : [];
  const retried = list.filter((r) => (r.attempts ?? 0) > 1);
  const mail = useMemo(() => sentMail(world, Array.isArray(history) ? history : []), [world, history]);

  return (
    <div className="spread">
      <Paper label={t.automation.label} className="spread-main">
        <div className="ln wide">
          <div className="m" />
          <div className="p">
            <h1 className="text-[28px] leading-tight">{t.automation.title}</h1>
            <p className="mt-1 max-w-[62ch] text-ink-2">{t.automation.intro}</p>
          </div>
        </div>

        <div className="sect mt-6">
          <Head title={t.automation.retried} m={<RotateCcw size={16} aria-hidden className="ml-auto" />} />
          <div className="entries">
            {retried.length === 0 ? (
              <Ln>
                <small>{t.automation.noRetry}</small>
              </Ln>
            ) : (
              retried.map((r) => <ReminderLine key={r.$id} r={r} world={world} />)
            )}
          </div>
        </div>

        <div className="sect">
          <Head title={t.automation.runs} a={Array.isArray(runs) ? String(runs.length) : undefined} />
          <div className="entries">
            {runs === null ? (
              <Ln>
                <span className="text-ink-2">{t.automation.loadingRuns}</span>
              </Ln>
            ) : runs === "failed" ? (
              <Ln>
                <span className="word short">{t.automation.runsFailed}</span>
              </Ln>
            ) : (
              (all ? sorted : sorted.slice(0, SHOWN_RUNS)).map((run) => (
                <RunCard key={run.$id} run={run} reminders={list} world={world} />
              ))
            )}
          </div>
          {sorted.length > SHOWN_RUNS && !all && (
            <Ln>
              <button type="button" className="linkbtn" onClick={() => setAll(true)}>
                {t.automation.showAll(sorted.length)}
              </button>
            </Ln>
          )}
        </div>
      </Paper>

      <Paper label={t.automation.sentMail}>
        <div className="sect" id="sent-mail">
          <Head title={t.automation.sentMail} m={<Mail size={16} aria-hidden className="ml-auto" />} />
          <Ln>
            <small>{t.automation.sentMailNote}</small>
          </Ln>
          <div className="entries">
            {history === "loading" ? (
              <Ln>
                <span className="text-ink-2">{t.common.loading}</span>
              </Ln>
            ) : mail.length === 0 ? (
              <Ln>
                <small>{t.automation.noMail}</small>
              </Ln>
            ) : (
              mail.map((m) => (
                <Ln key={m.event.$id} className="ruler">
                  <details>
                    <summary className="cursor-pointer list-none">
                      <span className="text-sm text-ink-2">{t.automation.to(t.date(istDay(m.event.at), { weekday: false }), m.to)}</span>
                      <span className="block font-semibold">{m.subject}</span>
                      <span className="block text-sm text-ink-2">
                        {t.automation.from(m.fromName, m.number, m.customer || t.common.aCustomer)}
                      </span>
                    </summary>
                    <p className="mt-2 text-sm whitespace-pre-line">{m.text}</p>
                  </details>
                </Ln>
              ))
            )}
          </div>
        </div>
      </Paper>
    </div>
  );
}
