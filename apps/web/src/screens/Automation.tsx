// /app/automation: every daily Ladder run, each Reminder under its key, the
// one seeded retry, and a copy of every email that really went out (Sent
// mail). The only Owner screen that shows Reminder keys.
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Mail, RotateCcw } from "lucide-react";
import type { EventRow, ReminderRow, WorkflowRunRow } from "@tagada/appwrite";
import { LADDER_STAGES, REMINDER_NAMES } from "@tagada/domain";
import { formatDate } from "@tagada/money";
import { istDay, istTime } from "../lib/pricing.ts";
import { usePaymentHistory, useReminders, useWorkspaceRows, useWorld, type World } from "../lib/world.tsx";
import { Head, Ln, Paper } from "../ui.tsx";

const SHOWN_RUNS = 8;

const STATUS: Record<ReminderRow["status"], string> = {
  queued: "sending",
  sent: "sent",
  failed: "failed",
  retried: "retried",
  skipped_cap: "rolled to tomorrow (one a day)",
  skipped_stage_off: "ready for the Owner",
};

/** "failed → retried → sent" when a send needed more than one try. */
function story(r: ReminderRow): string {
  const tries = r.attempts ?? 0;
  if (r.status === "sent" && tries > 1) return `failed → retried → sent (${tries} tries)`;
  if (r.status === "failed" && tries > 1) return `failed ${tries} times`;
  return STATUS[r.status];
}

const stageName = (stage: number) => REMINDER_NAMES[stage - 1] ?? LADDER_STAGES[stage - 1]?.name ?? "";

function ReminderLine({ r, world }: { r: ReminderRow; world: World }) {
  const invoice = world.invoices.find((i) => i.$id === r.invoiceId);
  return (
    <Ln m={r.sentDate ? formatDate(r.sentDate, { weekday: false }) : ""} className="ruler">
      <span className="block">
        {world.customers.get(r.customerId)?.name ?? "A Customer"}
        {invoice && (
          <>
            , <Link to={`/app/invoices/${invoice.$id}`} className="mono">{invoice.number}</Link>
          </>
        )}{" "}
        · {stageName(r.stage)} · <span className={r.status === "failed" ? "text-sindoor" : ""}>{story(r)}</span>
      </span>
      <small>
        Key <span className="mono">{r.$id}</span>
        {r.error && <> · last error: {r.error}</>}
      </small>
    </Ln>
  );
}

function RunCard({ run, reminders, world }: { run: WorkflowRunRow; reminders: ReminderRow[]; world: World }) {
  const mine = reminders.filter((r) => r.runId === run.runId);
  const time = istTime(run.startedAt);
  return (
    <Ln className="ruler">
      <details>
        <summary className="cursor-pointer list-none">
          <span className="font-semibold">{formatDate(run.demoDate)}</span> <span className="text-ink-2">at {time}</span>
          <span className="block text-sm text-ink-2">
            {run.invoicesScanned} Invoices scanned · {run.sent} sent · {run.skippedDuplicate} skipped as duplicate ·{" "}
            {run.retried} retried · {run.failed} failed
          </span>
        </summary>
        <div className="entries mt-2">
          {mine.length === 0 ? (
            <Ln>
              <small>Nothing to send on this run.</small>
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
      customer: (invoice && world.customers.get(invoice.customerId)?.name) ?? "A Customer",
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

  const sorted = useMemo(
    () => (Array.isArray(runs) ? [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)) : []),
    [runs],
  );
  const list = Array.isArray(reminders) ? reminders : [];
  const retried = list.filter((r) => (r.attempts ?? 0) > 1);
  const mail = useMemo(() => sentMail(world, Array.isArray(history) ? history : []), [world, history]);

  return (
    <div className="spread">
      <Paper label="Automation log" className="spread-main">
        <div className="ln wide">
          <div className="m" />
          <div className="p">
            <h1 className="text-[28px] leading-tight">Automation</h1>
            <p className="mt-1 max-w-[62ch] text-ink-2">
              Every day at 10:00 the Ladder runs for your Demo date. Each Reminder has one key, made from its Invoice and
              its step, and the run creates that key before it sends. A second run, or a retry, finds the key already
              there, so nothing is ever sent twice.
            </p>
          </div>
        </div>

        <div className="sect mt-6">
          <Head title="Retried sends" m={<RotateCcw size={16} aria-hidden className="ml-auto" />} />
          <div className="entries">
            {retried.length === 0 ? (
              <Ln>
                <small>No send has needed a retry.</small>
              </Ln>
            ) : (
              retried.map((r) => <ReminderLine key={r.$id} r={r} world={world} />)
            )}
          </div>
        </div>

        <div className="sect">
          <Head title="Daily runs" a={Array.isArray(runs) ? String(runs.length) : undefined} />
          <div className="entries">
            {runs === null ? (
              <Ln>
                <span className="text-ink-2">Loading the runs…</span>
              </Ln>
            ) : runs === "failed" ? (
              <Ln>
                <span className="word short">The runs could not be read. Reload the page to try again.</span>
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
                Show all {sorted.length} runs
              </button>
            </Ln>
          )}
        </div>
      </Paper>

      <Paper label="Sent mail">
        <div className="sect" id="sent-mail">
          <Head title="Sent mail" m={<Mail size={16} aria-hidden className="ml-auto" />} />
          <Ln>
            <small>
              A copy of every reminder email the daily run really sent. In this demo they all go to the one Demo inbox,
              so no real Customer is emailed.
            </small>
          </Ln>
          <div className="entries">
            {history === "loading" ? (
              <Ln>
                <span className="text-ink-2">Loading…</span>
              </Ln>
            ) : mail.length === 0 ? (
              <Ln>
                <small>No email yet. Step the Demo date forward (› in the header) and the daily run sends what is due.</small>
              </Ln>
            ) : (
              mail.map((m) => (
                <Ln key={m.event.$id} className="ruler">
                  <details>
                    <summary className="cursor-pointer list-none">
                      <span className="text-sm text-ink-2">{formatDate(istDay(m.event.at), { weekday: false })} · to {m.to}</span>
                      <span className="block font-semibold">{m.subject}</span>
                      <span className="block text-sm text-ink-2">
                        From {m.fromName} · {m.customer}, <span className="mono">{m.number}</span>
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
