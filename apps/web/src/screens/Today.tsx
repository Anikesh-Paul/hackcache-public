import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { AlertTriangle, Check, FolderOpen, Inbox, Phone } from "lucide-react";
import type { CallRow } from "@tagada/appwrite";
import { callReturn, formatDate, formatInr } from "@tagada/money";
import {
  CHASE_WHY,
  salaryDayIn,
  type AgeingBucket,
  type ExpectedReceipt,
  type Outflow,
  type TodayBook,
} from "@tagada/domain";
import { ForecastChart, ForecastTable, PayPackets, SalaryFigure } from "../books.tsx";
import { useTodayBook } from "../lib/today.ts";
import { useInbox, usePaymentHistory, useWorkspaceRows, useWorld } from "../lib/world.tsx";
import { Head, Ln, Paper } from "../ui.tsx";
import { InboxLine, inboxItems } from "./Inbox.tsx";
import { FollowUps } from "./FollowUps.tsx";

const day = (iso: string) => formatDate(iso, { weekday: false });

/** /app: the one number, and everything that explains it. */
export function Today() {
  const state = useTodayBook();
  const world = useWorld();
  if (state.status !== "ready") {
    return (
      <Paper label="Today">
        <Ln>
          <p className="text-ink-2" role="status">
            {state.status === "loading" ? "Adding up your books…" : "Your books could not be read. Reload to try again."}
          </p>
        </Ln>
      </Paper>
    );
  }
  const { book } = state;
  return (
    <div className="spread">
      <Paper label="Money" className="spread-main">
        <Headline book={book} today={world.workspace.today} />
        <TotalsRow book={book} />
        <Forecast book={book} />
        <ChaseFirst book={book} />
      </Paper>
      <Paper label="Today's work">
        <FollowUps />
        <DaysToGetPaid book={book} />
        <CallReturn />
        <LatestInbox />
      </Paper>
    </div>
  );
}

function WhyButton({ open, onClick, children = "Why?" }: { open: boolean; onClick: () => void; children?: ReactNode }) {
  return (
    <button type="button" className="linkbtn text-sm" aria-expanded={open} onClick={onClick}>
      {open ? "Hide" : children}
    </button>
  );
}

function Headline({ book, today }: { book: TodayBook; today: string }) {
  const [why, setWhy] = useState(false);
  const salary = book.salary;
  if (!salary) {
    return (
      <div className="sect">
        <Ln>
          <h1 className="text-[28px] leading-tight">No salary day in the next 13 weeks</h1>
          <p className="text-sm text-ink-2">Add salaries in Settings to see whether they are covered.</p>
        </Ln>
      </div>
    );
  }
  const short = salary.cashAfterPaise < 0;
  const lines = [
    ...salary.receipts.map((r) => ({ date: r.date, receipt: r })),
    ...salary.outflows.map((o) => ({ date: o.date, outflow: o })),
  ].sort((a, b) => a.date.localeCompare(b.date) || ("receipt" in a ? -1 : 1));
  return (
    <div className="sect" data-tour="headline">
      <div className="ln hl-row">
        <div className="m">
          <span className={`glyph ${short ? "short" : "ok"}`}>
            {short ? <AlertTriangle aria-hidden /> : <Check aria-hidden />}
          </span>
        </div>
        <div className="p">
          <h1 className="text-[28px] leading-tight">
            {short ? salaryDayIn(salary.daysAway) : "Salary covered"}
          </h1>
          <p className="text-sm text-ink-2">
            {formatDate(salary.date)}: salaries of {formatInr(salary.salaryPaise)}.
          </p>
        </div>
        <div className="a">
          <SalaryFigure cashAfterPaise={salary.cashAfterPaise} />
        </div>
      </div>
      <Ln>
        <PayPackets salary={salary} />
        <p className="mt-3">
          {short
            ? `Bring in ${formatInr(-salary.cashAfterPaise)} before ${formatDate(salary.date)} and salaries are covered.`
            : `Salaries on ${formatDate(salary.date)} are covered by what is in the bank and what is due before then.`}{" "}
          <WhyButton open={why} onClick={() => setWhy((o) => !o)}>
            Why?
          </WhyButton>
        </p>
      </Ln>
      {why && (
        <div className="entries working mt-2">
          <Ln m={day(today)} a={formatInr(book.cashTodayPaise)}>
            In the bank today
          </Ln>
          {lines.map((line) =>
            "receipt" in line ? (
              <ReceiptLine key={`r${line.receipt.invoiceId}${line.date}`} r={line.receipt} />
            ) : (
              <OutflowLine key={`o${line.outflow.label}${line.date}`} o={line.outflow} />
            ),
          )}
          <Ln a={<span className="dbl">{formatInr(salary.cashAfterPaise)}</span>} className="tot">
            {short ? "Short on salary day" : "Spare on salary day"}
          </Ln>
          <Ln>
            <small>
              Expected from Customers means each open Invoice on its due date plus that Customer's usual delay, or
              on the date they promised. Invoices later than usual, disputed, or already in the bank are not
              counted.
            </small>
          </Ln>
        </div>
      )}
    </div>
  );
}

function ReceiptLine({ r }: { r: ExpectedReceipt }) {
  return (
    <Ln m={day(r.date)} a={formatInr(r.amountPaise, { signed: true })}>
      {r.customerName}
      <small>{r.basis === "promise" ? "the date they promised" : "due date plus their usual delay"}</small>
    </Ln>
  );
}

function OutflowLine({ o }: { o: Outflow }) {
  return (
    <Ln m={day(o.date)} a={formatInr(-o.amountPaise)}>
      {o.label}
    </Ln>
  );
}

type TotalKey = "receivables" | "overdue" | "expected" | "upcoming";

function TotalsRow({ book }: { book: TodayBook }) {
  const [open, setOpen] = useState<TotalKey | null>(null);
  const t = book.totals;
  const until = formatDate(t.expectedUntil);
  const tiles: { key: TotalKey; label: string; paise: number; sub: string; why: ReactNode }[] = [
    {
      key: "receivables",
      label: "Total receivables",
      paise: t.receivablesPaise,
      sub: `${t.receivablesCount} Invoices not yet paid`,
      why: (
        <>
          Everything still owed on Invoices that are not marked paid. {formatInr(t.inBankPaise)} of it is already in the
          bank, waiting for you to confirm it on the <Link to="/app/bank">Bank</Link> page
          {t.disputedPaise > 0 && <>, and {formatInr(t.disputedPaise)} is held up by a Dispute</>}.
        </>
      ),
    },
    {
      key: "overdue",
      label: "Overdue",
      paise: t.overduePaise,
      sub: `${t.overdueCount} Invoices past their due date`,
      why: "The part of total receivables on Invoices whose due date has passed, including any with a Promise or a Dispute.",
    },
    {
      key: "expected",
      label: "Expected collections",
      paise: t.expectedPaise,
      sub: `by ${until}`,
      why: (
        <>
          What the next 30 days should bring in: each open Invoice on its due date plus that Customer's usual delay, or
          on the date they promised.
          <span className="mt-2 block">
            {book.receipts
              .filter((r) => r.date <= t.expectedUntil)
              .map((r) => `${r.customerName} ${formatInr(r.amountPaise)} on ${day(r.date)}`)
              .join(". ")}
            .
          </span>
        </>
      ),
    },
    {
      key: "upcoming",
      label: "Upcoming expenses",
      paise: t.upcomingPaise,
      sub: `by ${until}`,
      why: (
        <>
          Salaries, rent and suppliers due in the next 30 days.
          <span className="mt-2 block">
            {book.outflows
              .filter((o) => o.date <= t.expectedUntil)
              .map((o) => `${o.label} ${formatInr(o.amountPaise)} on ${day(o.date)}`)
              .join(". ")}
            .
          </span>
        </>
      ),
    },
  ];
  const shown = tiles.find((tile) => tile.key === open);
  return (
    <div className="sect">
      <Head title="Your position" />
      <div className="tiles">
        {tiles.map((tile) => (
          <div key={tile.key} className="tile">
            <div className="text-[13px] text-ink-2">{tile.label}</div>
            <div className="text-[22px] font-semibold tracking-tight">{formatInr(tile.paise)}</div>
            <div className="text-[13px] text-ink-2">{tile.sub}</div>
            <WhyButton open={open === tile.key} onClick={() => setOpen(open === tile.key ? null : tile.key)} />
          </div>
        ))}
      </div>
      {shown && (
        <Ln>
          <p className="mt-3 max-w-[68ch] text-sm">
            <b>{shown.label}.</b> {shown.why}
          </p>
        </Ln>
      )}
      <Ageing buckets={book.ageing} total={t.receivablesPaise} />
    </div>
  );
}

const AGE_TONE: Record<AgeingBucket["key"], string> = {
  "0-30": "age-0",
  "31-60": "age-1",
  "61-90": "age-2",
  "90+": "age-3",
};

function Ageing({ buckets, total }: { buckets: readonly AgeingBucket[]; total: number }) {
  return (
    <div className="mt-6">
      <Ln>
        <h3 className="text-[15px]">How old the money owed is</h3>
        <p className="text-[13px] text-ink-2">Days past the due date. Tap a group to see its Invoices.</p>
        <div className="ageing-bar mt-3" aria-hidden>
          {buckets.map((b) =>
            b.amountPaise > 0 ? (
              <span key={b.key} className={AGE_TONE[b.key]} style={{ flexGrow: b.amountPaise / total }} />
            ) : null,
          )}
        </div>
      </Ln>
      <ul className="entries mt-1">
        {buckets.map((b) => (
          <li key={b.key} className="ln ruler relative">
            <div className="m">
              <span className={`swatch ${AGE_TONE[b.key]}`} aria-hidden />
            </div>
            <div className="p">
              <Link to={`/app/invoices?age=${b.key}`} className="no-underline after:absolute after:inset-0">
                {b.label}
                <span className="sr-only"> days past due</span>
              </Link>
              <small>
                {b.count} {b.count === 1 ? "Invoice" : "Invoices"}
              </small>
            </div>
            <div className="a">{formatInr(b.amountPaise)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Forecast({ book }: { book: TodayBook }) {
  const [table, setTable] = useState(false);
  return (
    <div className="sect">
      <Head title="Next 13 weeks" a="cash at week end" />
      <Ln>
        {book.newSales.weeklyPaise > 0 && (
          <p className="mb-1 text-[13px] text-ink-2">
            From {formatDate(book.newSales.fromDate, { weekday: false })}, with{" "}
            {formatInr(book.newSales.weeklyPaise)} a week of expected new sales, from your last 3 months.
          </p>
        )}
        <ForecastChart weeks={book.weeks} />
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="swatch bar-ok-swatch" aria-hidden /> Enough cash
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="swatch bar-short-swatch" aria-hidden /> Short
          </span>
          <span className="flex-1" />
          <WhyButton open={table} onClick={() => setTable((o) => !o)}>
            Why? See every week
          </WhyButton>
        </div>
        {table && (
          <>
            <ForecastTable weeks={book.weeks} />
            <p className="mt-2 text-[13px] text-ink-2">
              Coming in: each open Invoice on its due date plus that Customer's usual delay, or on the date they
              promised. Expected new sales: a week's share of what you invoiced in the last 3 months, from the day an
              Invoice raised today would usually be paid. Going out: salaries, rent, power and raw bamboo. The
              salary-day headline counts only what is in your books now.
            </p>
          </>
        )}
      </Ln>
    </div>
  );
}

function ChaseFirst({ book }: { book: TodayBook }) {
  const [why, setWhy] = useState(false);
  return (
    <div className="sect" data-tour="chase">
      <Head title="Chase these first" a="owed" />
      {book.chase.length === 0 ? (
        <Ln>
          <p className="text-ink-2">Nothing to chase: every unpaid Invoice is promised, disputed or on its way.</p>
        </Ln>
      ) : (
        <ol className="entries">
          {book.chase.map((row, i) => (
            <li key={row.invoiceId} className="ln">
              <div className="m">
                <span className="rank">{i + 1}</span>
              </div>
              <div className="p">
                <div className="font-medium">{row.customerName}</div>
                <p className="text-sm">{row.reason}</p>
                <div className="mt-2">
                  {row.action === "call" ? (
                    <Link to={`/call/${row.invoiceId}`} className="btn primary">
                      <Phone aria-hidden /> Call with AI
                    </Link>
                  ) : (
                    <Link to={`/app/invoices/${row.invoiceId}`} className="btn secondary">
                      <FolderOpen aria-hidden /> Open
                    </Link>
                  )}
                </div>
              </div>
              <div className="a">
                <b>{formatInr(row.amountPaise)}</b>
                <small className="block text-[13px] text-ink-2">
                  {row.daysLate > 0 ? `${row.daysLate} ${row.daysLate === 1 ? "day" : "days"} late` : "not due yet"}
                </small>
              </div>
            </li>
          ))}
        </ol>
      )}
      <Ln>
        <p className="mt-3">
          <WhyButton open={why} onClick={() => setWhy((o) => !o)}>
            How is this order worked out?
          </WhyButton>
        </p>
        {why && <p className="mt-2 max-w-[68ch] text-sm">{CHASE_WHY}</p>}
      </Ln>
    </div>
  );
}

function DaysToGetPaid({ book }: { book: TodayBook }) {
  const [why, setWhy] = useState(false);
  const { days, count, ifKeptDays, promisedCount } = book.daysToGetPaid;
  return (
    <div className="sect">
      <Head title="Days to get paid" />
      <Ln>
        {days === null ? (
          <p>No Invoice was paid in the last 6 months.</p>
        ) : (
          <p className="text-[17px] leading-snug">
            You wait <b>{days} days</b> on average to get paid.
            {ifKeptDays !== null && (
              <>
                {" "}
                If today's promises are kept,{" "}
                {ifKeptDays === days ? (
                  <>that stays at {days}.</>
                ) : (
                  <>
                    that {ifKeptDays < days ? "drops" : "rises"} to <b>{ifKeptDays}</b>.
                  </>
                )}
              </>
            )}
          </p>
        )}
        <p className="mt-2">
          <WhyButton open={why} onClick={() => setWhy((o) => !o)} />
        </p>
        {why && (
          <p className="mt-2 text-sm">
            Days from the Invoice date to the day it was paid, averaged over the {count} Invoices paid in the last 6
            months.
            {ifKeptDays !== null &&
              ` The second figure adds the ${promisedCount} unpaid ${promisedCount === 1 ? "Invoice" : "Invoices"} with a Promise or Plan, as if each is paid on its last promised date.`}{" "}
          </p>
        )}
      </Ln>
    </div>
  );
}

/** What the AI calls cost against what the Plans and Promises agreed on them secured. */
function CallReturn() {
  const world = useWorld();
  const calls = useWorkspaceRows<CallRow>("calls");
  const [why, setWhy] = useState(false);
  if (!Array.isArray(calls)) return null;
  const roi = callReturn({
    calls: calls.map((call) => ({ credits: creditsOf(call.transcript), durationS: call.durationS })),
    securedPaise: world.promises
      .filter((p) => p.source === "call" && (p.status === "approved" || p.status === "kept"))
      .flatMap((p) => (JSON.parse(p.instalments) as { amountPaise: number }[]).map((i) => i.amountPaise)),
  });
  return (
    <div className="sect">
      <Head title="AI calls" />
      <Ln>
        <p className="text-[17px] leading-snug">
          Cost <b>{formatInr(roi.costPaise)}</b>, secured <b>{formatInr(roi.securedPaise)}</b>.
        </p>
        <p className="mt-2">
          <WhyButton open={why} onClick={() => setWhy((o) => !o)} />
        </p>
        {why && (
          <p className="mt-2 text-sm">
            {roi.calls} {roi.calls === 1 ? "call" : "calls"}, priced by how long each one ran. Secured is what the Plans
            and Promises agreed on a call add up to, while they stand.
          </p>
        )}
      </Ln>
    </div>
  );
}

/** The credits ElevenLabs reported for a call, kept with its transcript. */
function creditsOf(transcript: string | null): number | null {
  try {
    const credits = (JSON.parse(transcript ?? "null") as { credits?: unknown } | null)?.credits;
    return typeof credits === "number" && Number.isSafeInteger(credits) ? credits : null;
  } catch {
    return null;
  }
}

/** The latest 3 things Customers did on their pay links, live. */
function LatestInbox() {
  const world = useWorld();
  const inbox = useInbox();
  const history = usePaymentHistory();
  const items = Array.isArray(inbox) ? inboxItems(world, inbox, Array.isArray(history) ? history : null).slice(0, 3) : [];
  return (
    <div className="sect">
      <Head title="Inbox" a={<Link to="/app/inbox">Open</Link>} />
      <div className="entries" aria-live="polite">
        {items.length > 0 ? (
          items.map((item) => <InboxLine key={item.row.$id} item={item} fresh={!item.row.read} />)
        ) : (
          <Ln m={<Inbox size={16} aria-hidden className="ml-auto" />}>
            <p className="text-sm text-ink-2">
              {inbox === "loading"
                ? "Loading the Inbox…"
                : "Replies from the pay link land here: paid claims, Disputes, Plans and screenshots."}
            </p>
          </Ln>
        )}
      </div>
    </div>
  );
}
