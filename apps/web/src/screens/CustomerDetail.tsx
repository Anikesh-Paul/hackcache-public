import { useState } from "react";
import { Link, useParams } from "react-router";
import { Pencil } from "lucide-react";
import type { CallRow, ReminderRow } from "@tagada/appwrite";
import { formatInr } from "@tagada/money";
import { amountOwed, gradeFor } from "../lib/customer-grade.ts";
import { LANGUAGES } from "../lib/languages.ts";
import { reminderName, useT } from "../i18n/index.ts";
import { eventText } from "../lib/history.ts";
import { istDay } from "../lib/pricing.ts";
import { usePaymentHistory, useWorkspaceRows, useWorld, viewOf } from "../lib/world.tsx";
import { Head, Ln, Paper, StatusWord } from "../ui.tsx";
import { NotFound } from "./NotFound.tsx";

function stageOf(payload: string | null): number | null {
  if (!payload) return null;
  const data = JSON.parse(payload) as { stage?: number };
  return typeof data.stage === "number" ? data.stage : null;
}

function amountOf(payload: string | null): number | null {
  if (!payload) return null;
  const data = JSON.parse(payload) as { amountPaise?: number };
  return typeof data.amountPaise === "number" ? data.amountPaise : null;
}

/** /app/customers/:id: this Customer's Invoices, payments, Reminders and calls. */
export function CustomerDetail() {
  const { id } = useParams();
  const world = useWorld();
  const customer = id ? world.customers.get(id) : undefined;
  const events = usePaymentHistory();
  const calls = useWorkspaceRows<CallRow>("calls");
  const reminders = useWorkspaceRows<ReminderRow>("reminders");
  const [why, setWhy] = useState(false);
  const t = useT();
  if (!customer) return <NotFound what="Customer" />;

  const today = world.workspace.today;
  const invoices = world.invoices
    .filter((invoice) => invoice.customerId === customer.$id)
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  const ids = new Set(invoices.map((invoice) => invoice.$id));
  const owed = amountOwed(invoices, world.promisesByInvoice, today);
  const ready = events === "loading" || events === "failed" ? null : events;
  const grade = ready ? gradeFor(today, invoices, ready, world.promisesByInvoice) : null;
  const history = (ready ?? []).filter((event) => ids.has(event.invoiceId));
  const payments = history.filter((event) => event.type === "payment").sort((a, b) => b.at.localeCompare(a.at));
  const advances = history.filter((event) => event.type === "advance").sort((a, b) => b.at.localeCompare(a.at));
  // A sent Reminder has both an event and a `reminders` row; list it once, by its event.
  const reminderEvents = history.filter((event) => event.type === "reminder");
  const logged = new Set(reminderEvents.map((event) => `${event.invoiceId}|${stageOf(event.payload)}`));
  const reminderLines = [
    ...reminderEvents.map((event) => ({ key: event.$id, day: istDay(event.at), text: eventText(t, event, world.promises) })),
    ...(reminders && reminders !== "failed" ? reminders : [])
      .filter((row) => row.customerId === customer.$id && !logged.has(`${row.invoiceId}|${row.stage}`))
      .map((row) => ({
        key: row.$id,
        day: row.sentDate ?? "",
        text: t.customer.reminderBy(reminderName(t, row.stage), t.customer.channels[row.channel]),
      })),
  ].sort((a, b) => b.day.localeCompare(a.day));
  const callEvents = history.filter((event) => event.type === "call");
  const callRows = (calls && calls !== "failed" ? calls : []).filter((row) => ids.has(row.invoiceId));

  return (
    <div className="grid gap-4">
      <Paper label={customer.name}>
        <div className="ln items-end [grid-template-columns:var(--margin)_minmax(0,1fr)_auto]">
          <div className="m" />
          <div className="p">
            <p className="text-[13px] text-ink-2">
              <Link to="/app/customers">{t.customers.title}</Link> / {customer.place}
            </p>
            <div className="mt-1 flex flex-wrap items-end gap-x-4 gap-y-2">
              <h1 className="text-[30px] leading-tight sm:text-[34px]">{customer.name}</h1>
              <Link to={`/app/customers/${customer.$id}/edit`} className="btn secondary">
                <Pencil aria-hidden /> {t.customerForm.edit}
              </Link>
            </div>
            <p className="mt-2 max-w-[62ch] text-sm">
              {grade
                ? t.customers.grade(grade.grade, grade.facts)
                : events === "loading"
                  ? t.customers.reading
                  : `${t.customers.unavailable}.`}{" "}
              <button type="button" className="linkbtn" aria-expanded={why} onClick={() => setWhy((open) => !open)}>
                {t.common.why}
              </button>
            </p>
            {why && <p className="mt-2 max-w-[68ch] text-sm">{t.customers.gradeWhy}</p>}
            <p className="mt-3 text-sm text-ink-2">
              {t.customers.credit(customer.creditDays ?? 0)}
              <br />
              {t.customer.language(LANGUAGES.find((language) => language.id === customer.lang)?.name ?? t.customer.notSet)}
              {customer.email && (
                <>
                  <br />
                  {t.customer.email(customer.email)}
                </>
              )}
              {customer.phone && (
                <>
                  <br />
                  {t.customer.phone(customer.phone.replace(/^\+91(\d{5})(\d{5})$/, "+91 $1 $2"))}
                </>
              )}
              <br />
              {customer.consentCalls ? t.customer.callsAllowed : t.customer.callsNotAllowed}
              {grade?.avgDelayDays != null && (
                <>
                  <br />
                  {t.customers.delay(grade.avgDelayDays)}
                  {t.customer.onPaid}
                </>
              )}
            </p>
          </div>
          <div className="a border-l-0 max-sm:col-span-full max-sm:mt-3 max-sm:pl-[calc(var(--margin)+14px)] max-sm:text-left">
            <span className="figure dbl">{formatInr(owed)}</span>
            <p className="mt-2 text-[13px] text-ink-2">{t.customer.stillOwed}</p>
          </div>
        </div>
      </Paper>

      <Paper label={t.invoices.title}>
        <Head title={t.invoices.title} m={t.customer.issued} a={t.invoices.owed} />
        {invoices.length === 0 ? (
          <Ln>
            <p className="text-ink-2">{t.customer.noInvoices}</p>
          </Ln>
        ) : (
          <ul className="entries">
            {invoices.map((invoice) => {
              const view = viewOf(world, invoice);
              return (
                <li key={invoice.$id} className="ln ruler relative">
                  <div className="m">{t.date(invoice.issueDate, { weekday: false })}</div>
                  <div className="p">
                    <Link to={`/app/invoices/${invoice.$id}`} className="font-medium no-underline after:absolute after:inset-0">
                      <span className="mono">{invoice.number}</span>
                    </Link>
                    <small>
                      <StatusWord standing={view.standing} dueDate={invoice.dueDate} />
                    </small>
                  </div>
                  <div className="a">
                    {formatInr(view.standing.state === "paid" ? invoice.totalPaise : view.standing.balancePaise)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Paper>

      <Paper label={t.customer.payments}>
        <Head title={t.customer.payments} />
        {events === "loading" ? (
          <Ln>
            <p className="text-ink-2">{t.customer.readingPayments}</p>
          </Ln>
        ) : payments.length === 0 ? (
          <Ln>
            <p className="text-ink-2">{t.customer.noPayments}</p>
          </Ln>
        ) : (
          <ul className="entries">
            {payments.map((event) => {
              const amount = amountOf(event.payload);
              return (
                <li key={event.$id} className={`ln ${amount === null ? "wide" : ""}`}>
                  <div className="m">{t.date(istDay(event.at), { weekday: false })}</div>
                  <div className="p">{eventText(t, event, world.promises)}</div>
                  {amount !== null && <div className="a">{formatInr(amount)}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </Paper>

      <Paper label={t.customer.advance}>
        <Head title={t.customer.advance} />
        {events === "loading" ? (
          <Ln>
            <p className="text-ink-2">{t.customer.readingAdvance}</p>
          </Ln>
        ) : advances.length === 0 ? (
          <Ln>
            <p className="text-ink-2">{t.customer.noAdvance}</p>
          </Ln>
        ) : (
          <ul className="entries">
            {advances.map((event) => {
              const amount = amountOf(event.payload);
              return (
                <li key={event.$id} className={`ln ${amount === null ? "wide" : ""}`}>
                  <div className="m">{t.date(istDay(event.at), { weekday: false })}</div>
                  <div className="p">{eventText(t, event, world.promises)}</div>
                  {amount !== null && <div className="a">{formatInr(amount)}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </Paper>

      <Paper label={t.customer.reminders}>
        <Head title={t.customer.reminders} />
        {events === "loading" ? (
          <Ln>
            <p className="text-ink-2">{t.customer.readingReminders}</p>
          </Ln>
        ) : reminderLines.length === 0 ? (
          <Ln>
            <p className="text-ink-2">{t.customer.noReminders}</p>
          </Ln>
        ) : (
          <ul className="entries">
            {reminderLines.map((line) => (
              <li key={line.key} className="ln wide">
                <div className="m">{line.day ? t.date(line.day, { weekday: false }) : ""}</div>
                <div className="p">{line.text}</div>
              </li>
            ))}
          </ul>
        )}
      </Paper>

      <Paper label={t.customer.calls}>
        <Head title={t.customer.calls} />
        {callEvents.length === 0 && callRows.length === 0 ? (
          <Ln>
            <p className="text-ink-2">{t.customer.noCalls}</p>
          </Ln>
        ) : (
          <ul className="entries">
            {callEvents.map((event) => (
              <li key={event.$id} className="ln wide">
                <div className="m">{t.date(istDay(event.at), { weekday: false })}</div>
                <div className="p">{eventText(t, event, world.promises)}</div>
              </li>
            ))}
            {callRows.map((row) => (
              <li key={row.$id} className="ln wide">
                <div className="m">{row.startedAt ? t.date(istDay(row.startedAt), { weekday: false }) : ""}</div>
                <div className="p">
                  {t.customer.call}
                  {row.durationS ? t.customer.seconds(row.durationS) : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Paper>
    </div>
  );
}
