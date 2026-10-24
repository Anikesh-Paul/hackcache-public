import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { AlertTriangle, Check, FolderOpen, Inbox, Phone } from "lucide-react";
import type { CallRow } from "@tagada/appwrite";
import { callReturn, formatInr } from "@tagada/money";
import { type AgeingBucket, type ExpectedReceipt, type Outflow, type TodayBook } from "@tagada/domain";
import { salaryHeadline, useT, type Copy } from "../i18n/index.ts";
import { ForecastChart, ForecastTable, PayPackets, SalaryFigure } from "../books.tsx";
import { useTodayBook } from "../lib/today.ts";
import { useInbox, usePaymentHistory, useWorkspaceRows, useWorld } from "../lib/world.tsx";
import { Head, Ln, Paper } from "../ui.tsx";
import { InboxLine, inboxItems } from "./Inbox.tsx";
import { FollowUps } from "./FollowUps.tsx";

const day = (t: Copy, iso: string) => t.date(iso, { weekday: false });

/** /app: the one number, and everything that explains it. */
export function Today() {
  const state = useTodayBook();
  const world = useWorld();
  const t = useT();
  if (state.status !== "ready") {
    return (
      <Paper label={t.shell.tabs.today}>
        <Ln>
          <p className="text-ink-2" role="status">
            {state.status === "loading" ? t.today.adding : t.today.unreadable}
          </p>
        </Ln>
      </Paper>
    );
  }
  const { book } = state;
  return (
    <div className="spread">
      <Paper label={t.today.money} className="spread-main">
        <Headline book={book} today={world.workspace.today} />
        <TotalsRow book={book} />
        <Forecast book={book} />
        <ChaseFirst book={book} />
      </Paper>
      <Paper label={t.today.work}>
        <FollowUps />
        <DaysToGetPaid book={book} />
        <CallReturn />
        <LatestInbox />
      </Paper>
    </div>
  );
}

function WhyButton({ open, onClick, children }: { open: boolean; onClick: () => void; children?: ReactNode }) {
  const t = useT();
  return (
    <button type="button" className="linkbtn text-sm" aria-expanded={open} onClick={onClick}>
      {open ? t.common.hide : (children ?? t.common.why)}
    </button>
  );
}

function Headline({ book, today }: { book: TodayBook; today: string }) {
  const t = useT();
  const [why, setWhy] = useState(false);
  const salary = book.salary;
  if (!salary) {
    return (
      <div className="sect">
        <Ln>
          <h1 className="text-[28px] leading-tight">{t.today.noSalary}</h1>
          <p className="text-sm text-ink-2">{t.today.addSalaries}</p>
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
          <h1 className="text-[28px] leading-tight">{salaryHeadline(salary.daysAway, !short, t)}</h1>
          <p className="text-sm text-ink-2">{t.salary.of(t.date(salary.date), formatInr(salary.salaryPaise))}</p>
        </div>
        <div className="a">
          <SalaryFigure cashAfterPaise={salary.cashAfterPaise} />
        </div>
      </div>
      <Ln>
        <PayPackets salary={salary} />
        <p className="mt-3">
          {short
            ? t.today.bringIn(formatInr(-salary.cashAfterPaise), t.date(salary.date))
            : t.today.coveredBy(t.date(salary.date))}{" "}
          <WhyButton open={why} onClick={() => setWhy((o) => !o)} />
        </p>
      </Ln>
      {why && (
        <div className="entries working mt-2">
          <Ln m={day(t, today)} a={formatInr(book.cashTodayPaise)}>
            {t.today.inBankToday}
          </Ln>
          {lines.map((line) =>
            "receipt" in line ? (
              <ReceiptLine key={`r${line.receipt.invoiceId}${line.date}`} r={line.receipt} />
            ) : (
              <OutflowLine key={`o${line.outflow.label}${line.date}`} o={line.outflow} />
            ),
          )}
          <Ln a={<span className="dbl">{formatInr(salary.cashAfterPaise)}</span>} className="tot">
            {short ? t.today.shortOnDay : t.today.spareOnDay}
          </Ln>
          <Ln>
            <small>{t.today.expectedNote}</small>
          </Ln>
        </div>
      )}
    </div>
  );
}

function ReceiptLine({ r }: { r: ExpectedReceipt }) {
  const t = useT();
  return (
    <Ln m={day(t, r.date)} a={formatInr(r.amountPaise, { signed: true })}>
      {r.customerName}
      <small>{r.basis === "promise" ? t.today.promisedDate : t.today.usualDelay}</small>
    </Ln>
  );
}

function OutflowLine({ o }: { o: Outflow }) {
  const t = useT();
  return (
    <Ln m={day(t, o.date)} a={formatInr(-o.amountPaise)}>
      {o.label}
    </Ln>
  );
}

type TotalKey = "receivables" | "overdue" | "expected" | "upcoming";

function TotalsRow({ book }: { book: TodayBook }) {
  const [open, setOpen] = useState<TotalKey | null>(null);
  const t = useT();
  const totals = book.totals;
  const until = t.date(totals.expectedUntil);
  const tiles: { key: TotalKey; label: string; paise: number; sub: string; why: ReactNode }[] = [
    {
      key: "receivables",
      label: t.today.receivables,
      paise: totals.receivablesPaise,
      sub: t.today.receivablesSub(totals.receivablesCount),
      why: t.today.receivablesWhy(
        formatInr(totals.inBankPaise),
        totals.disputedPaise > 0 ? formatInr(totals.disputedPaise) : null,
        <Link to="/app/bank">{t.shell.tabs.bank}</Link>,
      ),
    },
    {
      key: "overdue",
      label: t.today.overdue,
      paise: totals.overduePaise,
      sub: t.today.overdueSub(totals.overdueCount),
      why: t.today.overdueWhy,
    },
    {
      key: "expected",
      label: t.today.expected,
      paise: totals.expectedPaise,
      sub: t.today.by(until),
      why: (
        <>
          {t.today.expectedWhy}
          <span className="mt-2 block">
            {book.receipts
              .filter((r) => r.date <= totals.expectedUntil)
              .map((r) => t.today.onDate(r.customerName, formatInr(r.amountPaise), day(t, r.date)))
              .join(". ")}
            .
          </span>
        </>
      ),
    },
    {
      key: "upcoming",
      label: t.today.upcoming,
      paise: totals.upcomingPaise,
      sub: t.today.by(until),
      why: (
        <>
          {t.today.upcomingWhy}
          <span className="mt-2 block">
            {book.outflows
              .filter((o) => o.date <= totals.expectedUntil)
              .map((o) => t.today.onDate(o.label, formatInr(o.amountPaise), day(t, o.date)))
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
      <Head title={t.today.position} />
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
      <Ageing buckets={book.ageing} total={totals.receivablesPaise} />
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
  const t = useT();
  return (
    <div className="mt-6">
      <Ln>
        <h3 className="text-[15px]">{t.today.ageingTitle}</h3>
        <p className="text-[13px] text-ink-2">{t.today.ageingNote}</p>
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
                <span className="sr-only">{t.today.daysPastDue}</span>
              </Link>
              <small>{t.common.invoices(b.count)}</small>
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
  const t = useT();
  return (
    <div className="sect">
      <Head title={t.forecast.title} a={t.forecast.cashAtWeekEnd} />
      <Ln>
        {book.newSales.weeklyPaise > 0 && (
          <p className="mb-1 text-[13px] text-ink-2">
            {t.forecast.expectedSales(t.date(book.newSales.fromDate, { weekday: false }), formatInr(book.newSales.weeklyPaise))}
          </p>
        )}
        <ForecastChart weeks={book.weeks} />
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="swatch bar-ok-swatch" aria-hidden /> {t.forecast.enough}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="swatch bar-short-swatch" aria-hidden /> {t.forecast.short}
          </span>
          <span className="flex-1" />
          <WhyButton open={table} onClick={() => setTable((o) => !o)}>
            {t.forecast.seeEveryWeek}
          </WhyButton>
        </div>
        {table && (
          <>
            <ForecastTable weeks={book.weeks} />
            <p className="mt-2 text-[13px] text-ink-2">{t.forecast.explain}</p>
          </>
        )}
      </Ln>
    </div>
  );
}

function ChaseFirst({ book }: { book: TodayBook }) {
  const [why, setWhy] = useState(false);
  const t = useT();
  return (
    <div className="sect" data-tour="chase">
      <Head title={t.today.chaseTitle} a={t.today.owed} />
      {book.chase.length === 0 ? (
        <Ln>
          <p className="text-ink-2">{t.today.nothingToChase}</p>
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
                <p className="text-sm">{t.today.chaseReason(row.why, row.amountPaise, row.gapClosedPaise)}</p>
                <div className="mt-2">
                  {row.action === "call" ? (
                    <Link to={`/call/${row.invoiceId}`} className="btn primary">
                      <Phone aria-hidden /> {t.common.callWithAi}
                    </Link>
                  ) : (
                    <Link to={`/app/invoices/${row.invoiceId}`} className="btn secondary">
                      <FolderOpen aria-hidden /> {t.common.open}
                    </Link>
                  )}
                </div>
              </div>
              <div className="a">
                <b>{formatInr(row.amountPaise)}</b>
                <small className="block text-[13px] text-ink-2">
                  {row.daysLate > 0 ? t.common.daysLate(row.daysLate) : t.common.notDueYet}
                </small>
              </div>
            </li>
          ))}
        </ol>
      )}
      <Ln>
        <p className="mt-3">
          <WhyButton open={why} onClick={() => setWhy((o) => !o)}>
            {t.today.orderWhy}
          </WhyButton>
        </p>
        {why && <p className="mt-2 max-w-[68ch] text-sm">{t.today.chaseWhy}</p>}
      </Ln>
    </div>
  );
}

function DaysToGetPaid({ book }: { book: TodayBook }) {
  const [why, setWhy] = useState(false);
  const t = useT();
  const { days, count, ifKeptDays, promisedCount } = book.daysToGetPaid;
  return (
    <div className="sect">
      <Head title={t.today.daysToGetPaid} />
      <Ln>
        {days === null ? (
          <p>{t.today.nonePaid}</p>
        ) : (
          <p className="text-[17px] leading-snug">
            {t.today.youWait(days)}
            {ifKeptDays !== null && t.today.ifKept(days, ifKeptDays)}
          </p>
        )}
        <p className="mt-2">
          <WhyButton open={why} onClick={() => setWhy((o) => !o)} />
        </p>
        {why && (
          <p className="mt-2 text-sm">
            {t.today.daysWhy(count)}
            {ifKeptDays !== null && t.today.daysWhyKept(promisedCount)}
          </p>
        )}
      </Ln>
    </div>
  );
}

/** What the AI calls cost against what the Plans and Promises agreed on them secured. */
function CallReturn() {
  const world = useWorld();
  const t = useT();
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
      <Head title={t.today.aiCalls} />
      <Ln>
        <p className="text-[17px] leading-snug">{t.today.costSecured(formatInr(roi.costPaise), formatInr(roi.securedPaise))}</p>
        <p className="mt-2">
          <WhyButton open={why} onClick={() => setWhy((o) => !o)} />
        </p>
        {why && <p className="mt-2 text-sm">{t.today.callsWhy(roi.calls)}</p>}
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
  const t = useT();
  const items = Array.isArray(inbox) ? inboxItems(world, inbox, Array.isArray(history) ? history : null).slice(0, 3) : [];
  return (
    <div className="sect">
      <Head title={t.inbox.title} a={<Link to="/app/inbox">{t.common.open}</Link>} />
      <div className="entries" aria-live="polite">
        {items.length > 0 ? (
          items.map((item) => <InboxLine key={item.row.$id} item={item} fresh={!item.row.read} />)
        ) : (
          <Ln m={<Inbox size={16} aria-hidden className="ml-auto" />}>
            <p className="text-sm text-ink-2">{inbox === "loading" ? t.inbox.loading : t.today.inboxEmpty}</p>
          </Ln>
        )}
      </div>
    </div>
  );
}
