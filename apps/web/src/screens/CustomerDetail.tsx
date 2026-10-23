import { useState } from "react";
import { Link, useParams } from "react-router";
import type { CallRow, EventRow, ReminderRow } from "@tagada/appwrite";
import { GRADE_WHY, LADDER_STAGES, invoiceStanding } from "@tagada/domain";
import { formatDate, formatInr, sumPaise } from "@tagada/money";
import { gradeFor } from "../lib/customer-grade.ts";
import { languageName } from "../lib/languages.ts";
import { istDay } from "../lib/pricing.ts";
import { useWorkspaceRows, useWorld, viewOf } from "../lib/world.tsx";
import { Head, Ln, Paper, StatusWord } from "../ui.tsx";
import { NotFound } from "./NotFound.tsx";

const CHANNEL: Record<ReminderRow["channel"], string> = {
  email: "Email",
  whatsapp_link: "WhatsApp",
  call: "Call",
};

function lead(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
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
  const events = useWorkspaceRows<EventRow>("events", true);
  const calls = useWorkspaceRows<CallRow>("calls");
  const reminders = useWorkspaceRows<ReminderRow>("reminders");
  const [why, setWhy] = useState(false);
  if (!customer) return <NotFound what="Customer" />;

  const today = world.workspace.today;
  const invoices = world.invoices
    .filter((invoice) => invoice.customerId === customer.$id)
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  const ids = new Set(invoices.map((invoice) => invoice.$id));
  const owed = sumPaise(
    invoices.map((invoice) => invoiceStanding(invoice, world.promisesByInvoice.get(invoice.$id) ?? [], today).balancePaise),
  );
  const grade = events && events !== "failed" ? gradeFor(today, invoices, events, world.promisesByInvoice) : null;
  const history = events && events !== "failed" ? events.filter((event) => ids.has(event.invoiceId)) : [];
  const payments = history.filter((event) => event.type === "payment").sort((a, b) => b.at.localeCompare(a.at));
  const reminderEvents = history.filter((event) => event.type === "reminder").sort((a, b) => b.at.localeCompare(a.at));
  const reminderRows = (reminders && reminders !== "failed" ? reminders : []).filter((row) => row.customerId === customer.$id);
  const callEvents = history.filter((event) => event.type === "call");
  const callRows = (calls && calls !== "failed" ? calls : []).filter((row) => ids.has(row.invoiceId));

  return (
    <div className="grid gap-4">
      <Paper label={customer.name}>
        <div className="ln items-end [grid-template-columns:var(--margin)_minmax(0,1fr)_auto]">
          <div className="m" />
          <div className="p">
            <p className="text-[13px] text-ink-2">
              <Link to="/app/customers">Customers</Link> / {customer.place}
            </p>
            <h1 className="mt-1 text-[30px] leading-tight sm:text-[34px]">{customer.name}</h1>
            <p className="mt-2 max-w-[62ch] text-sm">
              {grade ? `Grade ${grade.grade}. ${lead(grade.reason)}` : events === null ? "Reading payment history…" : "Grade unavailable."}{" "}
              <button type="button" className="linkbtn" aria-expanded={why} onClick={() => setWhy((open) => !open)}>
                Why?
              </button>
            </p>
            {why && <p className="mt-2 max-w-[68ch] text-sm">{GRADE_WHY}</p>}
            <p className="mt-3 text-sm text-ink-2">
              {customer.creditDays ?? 0} days' credit.
              <br />
              Reminders and the pay link use {languageName(customer.lang)}.
              {grade?.avgDelayDays != null && (
                <>
                  <br />
                  Average {grade.avgDelayDays} days late, on Invoices already paid.
                </>
              )}
            </p>
          </div>
          <div className="a border-l-0 max-sm:col-span-full max-sm:mt-3 max-sm:pl-[calc(var(--margin)+14px)] max-sm:text-left">
            <span className="figure dbl">{formatInr(owed)}</span>
            <p className="mt-2 text-[13px] text-ink-2">still owed</p>
          </div>
        </div>
      </Paper>

      <Paper label="Invoices">
        <Head title="Invoices" m="issued" a="owed" />
        {invoices.length === 0 ? (
          <Ln>
            <p className="text-ink-2">No Invoices yet.</p>
          </Ln>
        ) : (
          <ul className="entries">
            {invoices.map((invoice) => {
              const view = viewOf(world, invoice);
              return (
                <li key={invoice.$id} className="ln ruler relative">
                  <div className="m">{formatDate(invoice.issueDate, { weekday: false })}</div>
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

      <Paper label="Payments">
        <Head title="Payments" />
        {events === null ? (
          <Ln>
            <p className="text-ink-2">Reading payments…</p>
          </Ln>
        ) : payments.length === 0 ? (
          <Ln>
            <p className="text-ink-2">No payments confirmed yet.</p>
          </Ln>
        ) : (
          <ul className="entries">
            {payments.map((event) => {
              const amount = amountOf(event.payload);
              return (
                <li key={event.$id} className={`ln ${amount === null ? "wide" : ""}`}>
                  <div className="m">{formatDate(istDay(event.at), { weekday: false })}</div>
                  <div className="p">{event.summary}</div>
                  {amount !== null && <div className="a">{formatInr(amount)}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </Paper>

      <Paper label="Reminders">
        <Head title="Reminders" />
        {events === null ? (
          <Ln>
            <p className="text-ink-2">Reading reminders…</p>
          </Ln>
        ) : reminderEvents.length === 0 && reminderRows.length === 0 ? (
          <Ln>
            <p className="text-ink-2">No reminders yet.</p>
          </Ln>
        ) : (
          <ul className="entries">
            {reminderEvents.map((event) => (
              <li key={event.$id} className="ln wide">
                <div className="m">{formatDate(istDay(event.at), { weekday: false })}</div>
                <div className="p">{event.summary}</div>
              </li>
            ))}
            {reminderRows.map((row) => (
              <li key={row.$id} className="ln wide">
                <div className="m">{row.sentDate ? formatDate(row.sentDate, { weekday: false }) : ""}</div>
                <div className="p">
                  {LADDER_STAGES[row.stage - 1]?.name ?? "Reminder"} by {CHANNEL[row.channel]}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Paper>

      <Paper label="Calls">
        <Head title="Calls" />
        {callEvents.length === 0 && callRows.length === 0 ? (
          <Ln>
            <p className="text-ink-2">No calls yet.</p>
          </Ln>
        ) : (
          <ul className="entries">
            {callEvents.map((event) => (
              <li key={event.$id} className="ln wide">
                <div className="m">{formatDate(istDay(event.at), { weekday: false })}</div>
                <div className="p">{event.summary}</div>
              </li>
            ))}
            {callRows.map((row) => (
              <li key={row.$id} className="ln wide">
                <div className="m">{row.startedAt ? formatDate(istDay(row.startedAt), { weekday: false }) : ""}</div>
                <div className="p">
                  {(row.outcome ?? "Call").replaceAll("_", " ")}
                  {row.durationS ? `, ${row.durationS} seconds` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Paper>
    </div>
  );
}
