import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import {
  Ban,
  Bot,
  CalendarClock,
  Copy,
  ExternalLink,
  FileText,
  Flag,
  IndianRupee,
  Landmark,
  Pause,
  Pencil,
  Phone,
  Printer,
  Scale,
  Store,
  UserRound,
} from "lucide-react";
import type { CustomerRow, EventActor, EventRow, InvoiceLineRow, InvoiceRow, WorkspaceRow } from "@tagada/appwrite";
import {
  formatAmountInput,
  formatInr,
  formatRateBps,
  parseAmountPaise,
  SECTION16_RATE_BEFORE_BPS,
  SECTION16_RATE_CHANGE,
  SECTION16_RATE_FROM_BPS,
  stateName,
} from "@tagada/money";
import {
  ladderRungs,
  msmedInterest,
  section43bh,
  type DeductionClock,
  type InvoiceState,
  type MsmedMeter,
  type ProofResultKind,
} from "@tagada/domain";
import { isSeededEvent } from "@tagada/seed";
import { proofAmount, proofTone } from "../lib/proof.ts";
import { useT } from "../i18n/index.ts";
import { eventText } from "../lib/history.ts";
import { CallTranscript, transcriptCallId } from "./CallTranscript.tsx";
import { SaveError, cancelInvoice, markDisputed, recordPayment } from "../lib/appwrite.ts";
import { useInvoiceRows, usePaymentHistory, useWorkspaceRows, useWorld, viewOf } from "../lib/world.tsx";
import { istDay, priceLines, storedTotalsMatch } from "../lib/pricing.ts";
import { Badge, Field, Head, Ln, StatusWord, control } from "../ui.tsx";
import { NotFound } from "./NotFound.tsx";

const ACTORS: Record<EventActor, typeof Bot> = {
  owner: UserRound,
  customer: Store,
  workflow: CalendarClock,
  ai: Bot,
};

export function InvoiceDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const world = useWorld();
  const t = useT();
  const invoice = world.invoices.find((i) => i.$id === id);
  const lines = useInvoiceRows<InvoiceLineRow>("invoice_lines", invoice?.$id);
  // The whole workspace's events, kept live, so what a Customer does on the pay link appears here at once.
  const history = usePaymentHistory();
  const events: EventRow[] | "failed" | null =
    history === "loading" ? null : history === "failed" ? "failed" : history.filter((e) => e.invoiceId === invoice?.$id);
  if (!invoice) return <NotFound what="Invoice" />;

  const { customer, standing } = viewOf(world, invoice);
  const { workspace } = world;
  const meter = msmedInterest(workspace, invoice, standing, workspace.today);
  const owing = standing.state !== "paid" && standing.state !== "cancelled" && standing.balancePaise > 0;
  const deduction = owing ? section43bh(workspace, invoice, workspace.today) : null;
  const rungs = ladderRungs(invoice, standing);
  const intra = customer?.stateCode === workspace.stateCode;
  const owedLine =
    standing.state === "paid"
      ? t.invoice.paidInFull(formatInr(invoice.totalPaise))
      : standing.state === "cancelled"
        ? t.invoice.cancelledLine
        : invoice.paidPaise > 0
        ? t.invoice.owedAfter(formatInr(invoice.paidPaise))
        : t.invoice.owedNothingPaid;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.42fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-0 lg:shadow-[var(--sheet-shadow)]">
      <section
        aria-label={t.invoice.label}
        className="leaf max-lg:shadow-[var(--sheet-shadow)] lg:col-start-1 lg:row-start-1 lg:pb-0"
      >
        <div className="ln items-end [grid-template-columns:var(--margin)_minmax(0,1fr)_auto]">
          <div className="m" />
          <div className="p">
            <p className="text-[13px] text-ink-2">
              <Link to="/app/invoices">{t.invoices.title}</Link> / <span className="mono">{invoice.number}</span>
            </p>
            <h1 className="mt-1 text-[30px] leading-tight sm:text-[34px]">
              {customer ? (
                <Link to={`/app/customers/${customer.$id}`} className="no-underline">
                  {customer.name}
                </Link>
              ) : (
                t.common.customer
              )}
            </h1>
            <p className="mt-1 text-sm text-ink-2">
              {customer?.place}, {stateName(customer?.stateCode ?? "")}.{" "}
              {intra ? t.invoice.sameState : t.invoice.otherState}
              <br />
              {t.invoice.issuedDue(t.date(invoice.issueDate, { weekday: false }), t.date(invoice.dueDate))}
            </p>
            <p className="mt-3">
              <StatusWord standing={standing} dueDate={invoice.dueDate} />
            </p>
            <ProofLine invoiceId={invoice.$id} />
          </div>
          <div className="a border-l-0 max-sm:col-span-full max-sm:mt-3 max-sm:pl-[calc(var(--margin)+14px)] max-sm:text-left">
            <span className={`figure dbl ${standing.state === "cancelled" ? "line-through" : ""}`}>
              {formatInr(standing.state === "paid" || standing.state === "cancelled" ? invoice.totalPaise : standing.balancePaise)}
            </span>
            <p className="mt-2 text-[13px] text-ink-2">{owedLine}</p>
          </div>
        </div>
      </section>

      <section
        aria-label={t.invoice.nextSteps}
        className="leaf flex flex-col gap-9 max-lg:shadow-[var(--sheet-shadow)] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-l lg:border-rule"
      >
        <Actions
          invoice={invoice}
          balancePaise={standing.balancePaise}
          today={workspace.today}
          customerName={customer?.name ?? t.invoice.theCustomer}
          payToken={invoice.payToken}
          open={standing.state !== "paid" && standing.state !== "cancelled"}
          overdue={standing.daysLate > 0}
          disputed={standing.state === "disputed"}
          justMade={params.has("try")}
        />
        <div className="lg:order-first">
          <Head title={t.ladder.title} a={t.ladder.neverRepeats} />
          <div className="ln wide">
            <div className="m" />
            <div className="p">
              <ol className="ladder" aria-label={t.ladder.stagesLabel}>
                {rungs.map((rung) => (
                  <li key={rung.stage} className={rung.state}>
                    <span className="rails" aria-hidden>
                      <span className="rung" />
                    </span>
                    <span className="lbl">
                      {t.ladder.stages[rung.stage - 1]?.name ?? rung.name}
                      {rung.state === "today" && <span className="word warn ml-1.5">{t.ladder.nextToday}</span>}
                      {rung.state === "climbed" && <span className="sr-only">{t.ladder.done}</span>}
                      <small>{t.ladder.stages[rung.stage - 1]?.how ?? rung.how}</small>
                    </span>
                  </li>
                ))}
              </ol>
              <LadderNote state={standing.state} pauseReason={invoice.pauseReason} />
            </div>
          </div>
        </div>
      </section>

      <section
        aria-label={t.invoice.details}
        className="leaf max-lg:shadow-[var(--sheet-shadow)] lg:col-start-1 lg:row-start-2 lg:pt-9"
      >
        {meter && <Meter meter={meter} />}
        {deduction && <Deduction clock={deduction} />}

        <div className="sect">
          <Head
            title={t.invoice.happened}
            a={Array.isArray(events) && events.some((e) => isSeededEvent(e.$id)) ? <Badge kind="sim">{t.invoice.seeded}</Badge> : undefined}
          />
          <ol className="entries">
            {events === "failed" ? (
              <Ln>
                <span className="word short">{t.invoice.timelineFailed}</span>
              </Ln>
            ) : events === null ? (
              <Ln>
                <span className="text-ink-2">{t.invoice.timelineLoading}</span>
              </Ln>
            ) : (
              [...events]
                .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
                .map((event) => {
                  const Actor = ACTORS[event.actor];
                  const amount = event.type === "payment" || event.type === "sent" ? amountOf(event.payload) : null;
                  const callId = event.type === "call" ? transcriptCallId(event.payload) : null;
                  return (
                    <li key={event.$id} className={`ln ${amount === null ? "wide" : ""}`}>
                      <div className="m">{t.date(istDay(event.at), { weekday: false })}</div>
                      <div className="p">
                        {eventText(t, event, world.promises)}
                        <small className="flex items-center gap-1">
                          <Actor size={13} aria-hidden /> {t.invoice.actors[event.actor]}
                        </small>
                        {callId && (
                          <CallTranscript callId={callId} invoiceId={invoice.$id} customerName={customer?.name ?? t.invoice.theCustomer} />
                        )}
                      </div>
                      {amount !== null && <div className="a">{formatInr(amount)}</div>}
                    </li>
                  );
                })
            )}
          </ol>
        </div>

        <div className="sect">
          <Head title={t.invoice.onInvoice} m={t.invoice.qty} a={t.invoice.taxable} />
          <InvoiceLines workspace={workspace} customer={customer} invoice={invoice} lines={lines} />
        </div>
      </section>
    </div>
  );
}

function InvoiceLines({
  workspace,
  customer,
  invoice,
  lines,
}: {
  workspace: WorkspaceRow;
  customer: CustomerRow | undefined;
  invoice: InvoiceRow;
  lines: InvoiceLineRow[] | "failed" | null;
}) {
  const t = useT();
  if (lines === "failed") {
    return (
      <div className="entries">
        <Ln>
          <span className="word short">{t.invoice.linesFailed}</span>
        </Ln>
      </div>
    );
  }
  if (!lines || !customer) {
    return (
      <div className="entries">
        <Ln>
          <span className="text-ink-2">{t.invoice.linesLoading}</span>
        </Ln>
      </div>
    );
  }
  const priced = priceLines(workspace, customer, lines);
  return (
    <div className="entries">
      {lines.map((line, n) => {
        const p = priced.lines[n];
        return (
          <Ln key={line.$id} m={line.unit ? `${line.qtyMilli / 1000} ${line.unit}` : line.qtyMilli / 1000} a={formatInr(p?.taxablePaise ?? 0)} className="ruler">
            {line.description}
            <small>
              {line.hsn && (
                <>
                  {line.hsn.startsWith("99") ? "SAC" : "HSN"} <span className="mono">{line.hsn}</span>.{" "}
                </>
              )}
              {t.invoice.each(formatInr(line.ratePaise))}
              {line.discountBp > 0 && t.invoice.discount(line.discountBp / 100)}
              {t.invoice.gst(line.gstRateBp / 100)}
            </small>
          </Ln>
        );
      })}
      <Ln className="sub" a={formatInr(priced.taxablePaise)}>
        {t.invoice.taxableValue}
      </Ln>
      {priced.igstPaise > 0 && (
        <Ln className="sub" a={formatInr(priced.igstPaise)}>
          IGST
        </Ln>
      )}
      {priced.cgstPaise > 0 && (
        <>
          <Ln className="sub" a={formatInr(priced.cgstPaise)}>
            CGST
          </Ln>
          <Ln className="sub" a={formatInr(priced.sgstPaise)}>
            SGST
          </Ln>
        </>
      )}
      {priced.roundOffPaise !== 0 && (
        <Ln className="sub" a={formatInr(priced.roundOffPaise, { signed: true })}>
          {t.invoice.roundOff}
        </Ln>
      )}
      <Ln className="tot" a={<span className="dbl">{formatInr(priced.totalPaise)}</span>}>
        {t.invoice.total}
        <small className="font-normal">{t.amountWords(priced.totalPaise, priced.amountInWords)}</small>
      </Ln>
      {!storedTotalsMatch(invoice, priced) && (
        <Ln>
          <span className="word short">{t.invoice.totalsDiffer}</span>
        </Ln>
      )}
    </div>
  );
}

function amountOf(payload: string | null): number | null {
  if (!payload) return null;
  const data = JSON.parse(payload) as { amountPaise?: number; totalPaise?: number };
  return data.amountPaise ?? data.totalPaise ?? null;
}

function LadderNote({ state, pauseReason }: { state: InvoiceState; pauseReason: string | null }) {
  const t = useT();
  if (state === "paid") return <p className="mt-3 text-sm text-ink-2">{t.ladder.paidStopped}</p>;
  if (state === "cancelled") return <p className="mt-3 text-sm text-ink-2">{t.ladder.cancelledStopped}</p>;
  if (state === "disputed" || pauseReason === "dispute") {
    return (
      <p className="mt-3 text-sm">
        <span className="word plain">
          <Pause aria-hidden /> {t.ladder.pausedDispute}
        </span>{" "}
        <span className="text-ink-2">{t.ladder.untilResolved}</span>
      </p>
    );
  }
  if (state === "promised") {
    return (
      <p className="mt-3 text-sm">
        <span className="word ok">
          <Pause aria-hidden /> {t.ladder.paused(pauseReason === "plan")}
        </span>{" "}
        <span className="text-ink-2">{t.ladder.climbsAgain}</span>
      </p>
    );
  }
  if (state === "open") return <p className="mt-3 text-sm text-ink-2">{t.ladder.notDue}</p>;
  return null;
}

/** MSMED §16 interest so far, with the working one tap away. */
function Meter({ meter }: { meter: MsmedMeter }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const change = t.date(SECTION16_RATE_CHANGE, { weekday: false, year: true });
  const before = formatRateBps(SECTION16_RATE_BEFORE_BPS);
  const after = formatRateBps(SECTION16_RATE_FROM_BPS);
  return (
    <div className="sect">
      <div className="entries border-t border-ink">
        <Ln m={<IndianRupee size={16} aria-hidden className="ml-auto" />} a={<b>{formatInr(meter.interestPaise)}</b>}>
          <span className="font-medium">{t.invoice.meterTitle}</span> <Badge kind="real">{t.invoice.computed}</Badge>
          <small>
            {t.invoice.meterLine(after, before, change, t.date(meter.from))}{" "}
            <button type="button" className="linkbtn" aria-expanded={open} onClick={() => setOpen(!open)}>
              {t.common.why}
            </button>
          </small>
        </Ln>
        {open && (
          <Ln>
            <p className="text-sm">
              {t.invoice.meterWhy(
                formatRateBps(SECTION16_RATE_BEFORE_BPS / 3),
                formatRateBps(SECTION16_RATE_FROM_BPS / 3),
                change,
                formatInr(meter.principalPaise),
              )}
            </p>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-ink text-left text-xs text-ink-2">
                  <th className="pb-1 font-medium">{t.invoice.month}</th>
                  <th className="pb-1 font-medium">{t.invoice.rate}</th>
                  <th className="pb-1 text-right font-medium">{t.invoice.interest}</th>
                </tr>
              </thead>
              <tbody>
                {meter.rests.map((rest) => (
                  <tr key={rest.start} className="border-b border-rule align-top">
                    <td className="py-1.5 pr-2">
                      {t.invoice.span(t.date(rest.start ?? "", { weekday: false }), t.date(rest.end ?? "", { weekday: false }))}
                    </td>
                    <td className="py-1.5 pr-2">
                      {rest.rates.map((r) => t.invoice.daysAt(r.days ?? 0, formatRateBps(r.annualBps))).join(", ")}
                    </td>
                    <td className="py-1.5 text-right whitespace-nowrap">{formatInr(rest.interestPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-ink-2">{t.invoice.notAdvice}</p>
          </Ln>
        )}
      </div>
    </div>
  );
}

/** Section 43B(h): until when the buyer may claim this bill in its own year, with the rule one tap away. */
function Deduction({ clock }: { clock: DeductionClock }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  return (
    <div className="sect">
      <div className="entries border-t border-ink">
        <Ln m={<Landmark size={16} aria-hidden className="ml-auto" />}>
          <span className="font-medium">{t.invoice.deductionTitle}</span> <Badge kind="real">{t.invoice.computed}</Badge>
          <small>
            {t.invoice.deductionLine(t.date(clock.claimBy, { weekday: false, year: true }), clock.claimYear, clock.sameYear)}{" "}
            <button type="button" className="linkbtn" aria-expanded={open} onClick={() => setOpen(!open)}>
              {t.common.why}
            </button>
          </small>
        </Ln>
        {open && (
          <Ln>
            <p className="text-sm">{t.invoice.deductionWhy(t.date(clock.appointed, { weekday: false, year: true }))}</p>
            <p className="mt-2 text-xs text-ink-2">{t.invoice.notAdvice}</p>
          </Ln>
        )}
      </div>
    </div>
  );
}

function Actions({
  invoice,
  balancePaise,
  today,
  customerName,
  payToken,
  open,
  overdue,
  disputed,
  justMade,
}: {
  invoice: InvoiceRow;
  balancePaise: number;
  /** The Demo date: the latest a payment can be dated. */
  today: string;
  customerName: string;
  payToken: string | null;
  open: boolean;
  /** Past its due date: only then are the letter and the case file offered. A call is offered on any open Invoice. */
  overdue: boolean;
  disputed: boolean;
  /** Saved just now from "Make your own invoice": say what to try next. */
  justMade: boolean;
}) {
  const invoiceId = invoice.$id;
  const late = open && overdue;
  const t = useT();
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  const [disputing, setDisputing] = useState(false);
  const [form, setForm] = useState<"payment" | "cancel" | null>(null);
  // Nothing paid against it: it can still be corrected, or cancelled.
  const untouched = invoice.paidPaise === 0 && (invoice.status === "sent" || invoice.status === "disputed");
  const payLink = payToken ? `${location.origin}/pay/${payToken}` : null;
  const copy = async () => {
    if (!payLink) return;
    try {
      await navigator.clipboard.writeText(payLink);
      setCopied("yes");
    } catch {
      setCopied("failed");
    }
  };
  return (
    <div>
      <Head title={t.invoice.whatYouCanDo} />
      <div className="ln wide">
        <div className="m" />
        <div className="p mt-4 grid gap-2">
          {justMade && open && payLink && (
            <div role="status" className="rounded-md border border-bamboo bg-bamboo-soft p-3 text-sm">
              <p className="font-semibold">{t.invoice.madeTitle}</p>
              <ol className="mt-1 list-decimal pl-5">
                {t.invoice.madeSteps(customerName).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          )}
          {open && form !== "payment" && (
            <button type="button" className="btn secondary" onClick={() => setForm("payment")}>
              <IndianRupee aria-hidden /> {t.invoice.recordPayment}
            </button>
          )}
          {open && form === "payment" && (
            <PaymentForm invoice={invoice} balancePaise={balancePaise} today={today} onDone={() => setForm(null)} />
          )}
          {open && !disputed && (
            <Link to={`/call/${invoiceId}`} className="btn primary px-4 py-3 text-[15px]">
              <Phone aria-hidden /> {t.common.callWithAi}
            </Link>
          )}
          {open && (
            <button
              type="button"
              className="btn secondary"
              onClick={copy}
              disabled={!payLink}
              aria-describedby={payLink ? undefined : `paynote-${invoiceId}`}
            >
              <Copy aria-hidden /> {copied === "yes" ? t.invoice.copied : t.invoice.copy}
            </button>
          )}
          {open && copied === "failed" && payLink && (
            <small className="-mt-1 text-xs break-all text-ink-2" role="status">
              {t.invoice.copyBlocked} <span className="mono">{payLink}</span>
            </small>
          )}
          {open && payLink && (
            <a href={payLink} target="_blank" rel="noopener" className="btn bare -mt-1 justify-start">
              <ExternalLink aria-hidden /> {t.invoice.openAs(customerName)}
            </a>
          )}
          {open && !payLink && (
            <small id={`paynote-${invoiceId}`} className="-mt-1 text-xs text-ink-2">
              {t.invoice.noPayLink}
            </small>
          )}
          {late && (
            <Link to={`/print/letter/${invoiceId}`} className="btn secondary">
              <FileText aria-hidden /> {t.common.demandLetter}
            </Link>
          )}
          {late && (
            <Link to={`/print/case/${invoiceId}`} className="btn secondary">
              <Scale aria-hidden /> {t.common.caseFile}
            </Link>
          )}
          {late && (
            <small className="-mt-1 text-xs text-ink-2">{t.invoice.odrExplain}</small>
          )}
          <Link to={`/print/invoice/${invoiceId}`} className="btn secondary">
            <Printer aria-hidden /> {t.invoice.printTax}
          </Link>
          {untouched && (
            <Link to={`/app/invoices/${invoiceId}/edit`} className="btn secondary">
              <Pencil aria-hidden /> {t.invoice.edit}
            </Link>
          )}
          <Link to={`/app/invoices/${invoiceId}/duplicate`} className="btn secondary">
            <Copy aria-hidden /> {t.invoice.duplicate}
          </Link>
          {open && !disputed && !disputing && (
            <button type="button" className="btn bare justify-start" onClick={() => setDisputing(true)}>
              <Flag aria-hidden /> {t.invoice.markDisputed}
            </button>
          )}
          {open && !disputed && disputing && <DisputeForm invoiceId={invoiceId} onDone={() => setDisputing(false)} />}
          {untouched && form !== "cancel" && (
            <button type="button" className="btn bare justify-start" onClick={() => setForm("cancel")}>
              <Ban aria-hidden /> {t.invoice.cancelInvoice}
            </button>
          )}
          {untouched && form === "cancel" && <CancelForm invoiceId={invoiceId} number={invoice.number} onDone={() => setForm(null)} />}
          {open && invoice.paidPaise > 0 && <small className="text-xs text-ink-2">{t.invoice.cannotCancel}</small>}
        </div>
      </div>
    </div>
  );
}

type ProofRow = { invoiceId: string; result: ProofResultKind | null; extracted: string | null; checkedAt: string | null };

/** The latest screenshot check for this Invoice. Empty until a Customer sends one. */
function ProofLine({ invoiceId }: { invoiceId: string }) {
  const proofs = useWorkspaceRows<ProofRow>("proof_checks");
  const t = useT();
  if (!Array.isArray(proofs)) return null;
  const latest = proofs
    .filter((proof) => proof.invoiceId === invoiceId && proof.result)
    .sort((a, b) => (b.checkedAt ?? "").localeCompare(a.checkedAt ?? ""))[0];
  if (!latest?.result) return null;
  const amount = proofAmount(latest.extracted);
  return (
    <p className="mt-2">
      <span className={`word ${proofTone(latest.result)}`}>{t.proof.labels[latest.result]}</span>
      {amount && <span className="ml-2 text-sm text-ink-2">{amount}</span>}
    </p>
  );
}

/** The Owner records a Dispute. The Ladder pauses until it is resolved. */
function DisputeForm({ invoiceId, onDone }: { invoiceId: string; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");
  const t = useT();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setState("saving");
    try {
      await markDisputed(invoiceId, reason.trim());
      onDone();
    } catch {
      setState("failed");
    }
  };
  return (
    <form onSubmit={submit} className="mt-1 grid gap-2">
      <label htmlFor={`dispute-${invoiceId}`} className="text-sm font-medium">
        {t.invoice.disputeAsk}
      </label>
      <textarea
        id={`dispute-${invoiceId}`}
        rows={2}
        maxLength={500}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full rounded-md border border-rule-strong bg-paper p-2 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn secondary" disabled={state === "saving" || !reason.trim()}>
          <Flag aria-hidden /> {state === "saving" ? t.common.saving : t.invoice.markDisputed}
        </button>
        <button type="button" className="btn bare" onClick={onDone}>
          {t.common.cancel}
        </button>
      </div>
      {state === "failed" && (
        <small className="text-xs text-sindoor" role="alert">
          {t.invoice.disputeFailed}
        </small>
      )}
      <small className="text-xs text-ink-2">{t.invoice.disputeNote}</small>
    </form>
  );
}

const PAY_MODES = ["cash", "cheque", "upi", "bank_transfer"] as const;
type PayMode = (typeof PAY_MODES)[number];

/**
 * A payment received by hand. Up to what is still owed, dated from the issue
 * date to the Demo date. Today counts it as cash in hand from that day.
 */
function PaymentForm({
  invoice,
  balancePaise,
  today,
  onDone,
}: {
  invoice: InvoiceRow;
  balancePaise: number;
  today: string;
  onDone: () => void;
}) {
  const t = useT();
  const [amount, setAmount] = useState(formatAmountInput(balancePaise));
  const [date, setDate] = useState(today);
  const [mode, setMode] = useState<PayMode>("upi");
  const [reference, setReference] = useState("");
  const [state, setState] = useState<"idle" | "saving" | { failed: string }>("idle");
  const paise = parseAmountPaise(amount);
  const amountProblem =
    amount.trim() === "" ? null : paise === null || paise < 1 ? t.invoice.amountHint : paise > balancePaise ? t.invoice.amountOver(formatInr(balancePaise)) : null;
  const dateProblem = date < invoice.issueDate || date > today ? t.invoice.dateHint : null;
  const ready = paise !== null && paise >= 1 && !amountProblem && !dateProblem && state !== "saving";
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || paise === null) return;
    setState("saving");
    try {
      await recordPayment(invoice.$id, { amountPaise: paise, date, mode, ...(reference.trim() ? { reference: reference.trim() } : {}) });
      onDone();
    } catch (error) {
      const code = error instanceof SaveError ? error.code : "save_failed";
      setState({ failed: t.invoice.paymentErrors[code] ?? t.invoice.paymentFailed });
    }
  };
  return (
    <form onSubmit={submit} className="mt-1 grid gap-3 rounded-md border border-rule p-3">
      <p className="text-sm font-medium">{t.invoice.recordPayment}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.invoice.amountReceived} hint={amountProblem}>
          <input className={control} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t.invoice.receivedOn} hint={dateProblem}>
          <input className={control} type="date" min={invoice.issueDate} max={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t.invoice.payMode}>
          <select className={control} value={mode} onChange={(e) => setMode(e.target.value as PayMode)}>
            {PAY_MODES.map((id) => (
              <option key={id} value={id}>
                {t.invoice.payModeNames[id]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.invoice.payReference}>
          <input className={control} maxLength={64} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn primary" disabled={!ready}>
          <IndianRupee aria-hidden /> {state === "saving" ? t.common.saving : t.invoice.savePayment}
        </button>
        <button type="button" className="btn bare" onClick={onDone}>
          {t.common.cancel}
        </button>
      </div>
      {typeof state === "object" && (
        <small className="text-xs text-sindoor" role="alert">
          {state.failed}
        </small>
      )}
      <small className="text-xs text-ink-2">{t.invoice.paymentNote}</small>
    </form>
  );
}

/** Cancels the Invoice. Under GST it is not deleted: its number stays used, and the timeline says why. */
function CancelForm({ invoiceId, number, onDone }: { invoiceId: string; number: string; onDone: () => void }) {
  const t = useT();
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "saving" | { failed: string }>("idle");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setState("saving");
    try {
      await cancelInvoice(invoiceId, reason.trim());
      onDone();
    } catch (error) {
      const code = error instanceof SaveError ? error.code : "save_failed";
      setState({ failed: t.invoice.cancelErrors[code] ?? t.invoice.cancelFailed });
    }
  };
  return (
    <form onSubmit={submit} className="mt-1 grid gap-2">
      <label htmlFor={`cancel-${invoiceId}`} className="text-sm font-medium">
        {t.invoice.cancelAsk}
      </label>
      <textarea
        id={`cancel-${invoiceId}`}
        rows={2}
        maxLength={500}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full rounded-md border border-rule-strong bg-paper p-2 text-sm"
      />
      <small className="text-xs text-ink-2">{t.invoice.cancelNote(number)}</small>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn secondary" disabled={state === "saving" || !reason.trim()}>
          <Ban aria-hidden /> {state === "saving" ? t.common.saving : t.invoice.cancelInvoice}
        </button>
        <button type="button" className="btn bare" onClick={onDone}>
          {t.invoice.keepInvoice}
        </button>
      </div>
      {typeof state === "object" && (
        <small className="text-xs text-sindoor" role="alert">
          {state.failed}
        </small>
      )}
    </form>
  );
}
