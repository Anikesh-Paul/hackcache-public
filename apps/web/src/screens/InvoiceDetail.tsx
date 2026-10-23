import { useState } from "react";
import { Link, useParams } from "react-router";
import {
  Bot,
  CalendarClock,
  Copy,
  FileText,
  Flag,
  IndianRupee,
  Pause,
  Phone,
  Printer,
  Scale,
  Store,
  UserRound,
} from "lucide-react";
import type { CustomerRow, EventActor, EventRow, InvoiceLineRow, InvoiceRow, WorkspaceRow } from "@tagada/appwrite";
import {
  formatDate,
  formatInr,
  formatRateBps,
  SECTION16_RATE_BEFORE_BPS,
  SECTION16_RATE_CHANGE,
  SECTION16_RATE_FROM_BPS,
  stateName,
} from "@tagada/money";
import { ladderRungs, msmedInterest, type InvoiceState, type MsmedMeter } from "@tagada/domain";
import { useInvoiceRows, useWorld, viewOf } from "../lib/world.tsx";
import { istDay, priceLines, storedTotalsMatch } from "../lib/pricing.ts";
import { Badge, Head, Ln, StatusWord } from "../ui.tsx";
import { NotFound } from "./NotFound.tsx";

const ACTORS: Record<EventActor, { icon: typeof Bot; word: string }> = {
  owner: { icon: UserRound, word: "You" },
  customer: { icon: Store, word: "Customer" },
  workflow: { icon: CalendarClock, word: "Daily run" },
  ai: { icon: Bot, word: "AI" },
};

export function InvoiceDetail() {
  const { id } = useParams();
  const world = useWorld();
  const invoice = world.invoices.find((i) => i.$id === id);
  const lines = useInvoiceRows<InvoiceLineRow>("invoice_lines", invoice?.$id);
  const events = useInvoiceRows<EventRow>("events", invoice?.$id);
  if (!invoice) return <NotFound what="Invoice" />;

  const { customer, standing } = viewOf(world, invoice);
  const { workspace } = world;
  const meter = msmedInterest(workspace, invoice, standing, workspace.today);
  const rungs = ladderRungs(invoice, standing);
  const intra = customer?.stateCode === workspace.stateCode;
  const owedLine =
    standing.state === "paid"
      ? `paid in full, ${formatInr(invoice.totalPaise)}`
      : invoice.paidPaise > 0
        ? `owed, after ${formatInr(invoice.paidPaise)} paid`
        : "owed, nothing paid yet";

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.42fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-0 lg:shadow-[var(--sheet-shadow)]">
      <section
        aria-label="Invoice"
        className="leaf max-lg:shadow-[var(--sheet-shadow)] lg:col-start-1 lg:row-start-1 lg:pb-0"
      >
        <div className="ln items-end [grid-template-columns:var(--margin)_minmax(0,1fr)_auto]">
          <div className="m" />
          <div className="p">
            <p className="text-[13px] text-ink-2">
              <Link to="/app/invoices">Invoices</Link> / <span className="mono">{invoice.number}</span>
            </p>
            <h1 className="mt-1 text-[30px] leading-tight sm:text-[34px]">
              {customer ? (
                <Link to={`/app/customers/${customer.$id}`} className="no-underline">
                  {customer.name}
                </Link>
              ) : (
                "Customer"
              )}
            </h1>
            <p className="mt-1 text-sm text-ink-2">
              {customer?.place}, {stateName(customer?.stateCode ?? "")}.{" "}
              {intra ? "Same state, so CGST and SGST." : "Another state, so IGST."}
              <br />
              Issued {formatDate(invoice.issueDate, { weekday: false })}, due {formatDate(invoice.dueDate)}.
            </p>
            <p className="mt-3">
              <StatusWord standing={standing} dueDate={invoice.dueDate} />
            </p>
          </div>
          <div className="a border-l-0 max-sm:col-span-full max-sm:mt-3 max-sm:pl-[calc(var(--margin)+14px)] max-sm:text-left">
            <span className="figure dbl">
              {formatInr(standing.state === "paid" ? invoice.totalPaise : standing.balancePaise)}
            </span>
            <p className="mt-2 text-[13px] text-ink-2">{owedLine}</p>
          </div>
        </div>
      </section>

      <section
        aria-label="Next steps"
        className="leaf flex flex-col gap-9 max-lg:shadow-[var(--sheet-shadow)] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-l lg:border-rule"
      >
        <Actions
          invoiceId={invoice.$id}
          customerName={customer?.name ?? "the Customer"}
          payToken={invoice.payToken}
          open={standing.state !== "paid"}
        />
        <div className="lg:order-first">
          <Head title="The Ladder" a="never repeats a step" />
          <div className="ln wide">
            <div className="m" />
            <div className="p">
              <ol className="ladder" aria-label="Ladder stages, first at the bottom">
                {rungs.map((rung) => (
                  <li key={rung.stage} className={rung.state}>
                    <span className="rails" aria-hidden>
                      <span className="rung" />
                    </span>
                    <span className="lbl">
                      {rung.name}
                      {rung.state === "today" && <span className="word warn ml-1.5">next, today</span>}
                      {rung.state === "climbed" && <span className="sr-only"> (done)</span>}
                      <small>{rung.how}</small>
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
        aria-label="Details"
        className="leaf max-lg:shadow-[var(--sheet-shadow)] lg:col-start-1 lg:row-start-2 lg:pt-9"
      >
        {meter && <Meter meter={meter} />}

        <div className="sect">
          <Head title="What has happened" a={<Badge kind="sim">seeded history</Badge>} />
          <ol className="entries">
            {events === "failed" ? (
              <Ln>
                <span className="word short">The timeline could not be loaded. Reload the page to try again.</span>
              </Ln>
            ) : events === null ? (
              <Ln>
                <span className="text-ink-2">Loading the timeline…</span>
              </Ln>
            ) : (
              [...events]
                .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
                .map((event) => {
                  const actor = ACTORS[event.actor];
                  const amount = event.type === "payment" || event.type === "sent" ? amountOf(event.payload) : null;
                  return (
                    <li key={event.$id} className={`ln ${amount === null ? "wide" : ""}`}>
                      <div className="m">{formatDate(istDay(event.at), { weekday: false })}</div>
                      <div className="p">
                        {event.summary}
                        <small className="flex items-center gap-1">
                          <actor.icon size={13} aria-hidden /> {actor.word}
                        </small>
                      </div>
                      {amount !== null && <div className="a">{formatInr(amount)}</div>}
                    </li>
                  );
                })
            )}
          </ol>
        </div>

        <div className="sect">
          <Head title="On the invoice" m="qty" a="taxable" />
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
  if (lines === "failed") {
    return (
      <div className="entries">
        <Ln>
          <span className="word short">The lines could not be loaded. Reload the page to try again.</span>
        </Ln>
      </div>
    );
  }
  if (!lines || !customer) {
    return (
      <div className="entries">
        <Ln>
          <span className="text-ink-2">Loading the lines…</span>
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
          <Ln key={line.$id} m={line.qtyMilli / 1000} a={formatInr(p?.taxablePaise ?? 0)} className="ruler">
            {line.description}
            <small>
              {line.hsn && (
                <>
                  {line.hsn.startsWith("99") ? "SAC" : "HSN"} <span className="mono">{line.hsn}</span>.{" "}
                </>
              )}
              {formatInr(line.ratePaise)} each
              {line.discountBp > 0 && `, less ${line.discountBp / 100}% discount`}. GST {line.gstRateBp / 100}%.
            </small>
          </Ln>
        );
      })}
      <Ln className="sub" a={formatInr(priced.taxablePaise)}>
        Taxable value
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
          Round-off
        </Ln>
      )}
      <Ln className="tot" a={<span className="dbl">{formatInr(priced.totalPaise)}</span>}>
        Total
        <small className="font-normal">{priced.amountInWords}</small>
      </Ln>
      {!storedTotalsMatch(invoice, priced) && (
        <Ln>
          <span className="word short">The saved totals differ from the engine's; the engine's are shown.</span>
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
  if (state === "paid") return <p className="mt-3 text-sm text-ink-2">Paid, so the Ladder has stopped.</p>;
  if (state === "disputed" || pauseReason === "dispute") {
    return (
      <p className="mt-3 text-sm">
        <span className="word plain">
          <Pause aria-hidden /> Paused: Dispute
        </span>{" "}
        <span className="text-ink-2">Nothing is sent until you resolve it.</span>
      </p>
    );
  }
  if (state === "promised") {
    return (
      <p className="mt-3 text-sm">
        <span className="word ok">
          <Pause aria-hidden /> Paused: Promise
        </span>{" "}
        <span className="text-ink-2">If the money doesn't arrive by its date, the Ladder climbs again.</span>
      </p>
    );
  }
  if (state === "open") return <p className="mt-3 text-sm text-ink-2">Not due yet, so nothing has been sent.</p>;
  return null;
}

/** MSMED §16 interest so far, with the working one tap away. */
function Meter({ meter }: { meter: MsmedMeter }) {
  const [open, setOpen] = useState(false);
  const before = formatRateBps(SECTION16_RATE_BEFORE_BPS);
  const after = formatRateBps(SECTION16_RATE_FROM_BPS);
  return (
    <div className="sect">
      <div className="entries border-t border-ink">
        <Ln m={<IndianRupee size={16} aria-hidden className="ml-auto" />} a={<b>{formatInr(meter.interestPaise)}</b>}>
          <span className="font-medium">MSMED interest so far</span> <Badge kind="real">computed</Badge>
          <small>
            {after} a year ({before} before {formatDate(SECTION16_RATE_CHANGE, { weekday: false, year: true })}),
            compounded monthly, from {formatDate(meter.from)}.{" "}
            <button type="button" className="linkbtn" aria-expanded={open} onClick={() => setOpen(!open)}>
              Why?
            </button>
          </small>
        </Ln>
        {open && (
          <Ln>
            <p className="text-sm">
              The MSMED Act lets a micro or small manufacturer charge a late buyer compound interest, with monthly
              rests, at three times the RBI Bank Rate (§16). The Bank Rate went from{" "}
              {formatRateBps(SECTION16_RATE_BEFORE_BPS / 3)} to {formatRateBps(SECTION16_RATE_FROM_BPS / 3)} on{" "}
              {formatDate(SECTION16_RATE_CHANGE, { weekday: false, year: true })}, so each day earns the rate in force
              that day. On {formatInr(meter.principalPaise)} owed:
            </p>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-ink text-left text-xs text-ink-2">
                  <th className="pb-1 font-medium">Month</th>
                  <th className="pb-1 font-medium">Rate</th>
                  <th className="pb-1 text-right font-medium">Interest</th>
                </tr>
              </thead>
              <tbody>
                {meter.rests.map((rest) => (
                  <tr key={rest.start} className="border-b border-rule align-top">
                    <td className="py-1.5 pr-2">
                      {formatDate(rest.start ?? "", { weekday: false })} to{" "}
                      {formatDate(rest.end ?? "", { weekday: false })}
                    </td>
                    <td className="py-1.5 pr-2">
                      {rest.rates.map((r) => `${r.days} days at ${formatRateBps(r.annualBps)}`).join(", ")}
                    </td>
                    <td className="py-1.5 text-right whitespace-nowrap">{formatInr(rest.interestPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-ink-2">General information, not legal advice.</p>
          </Ln>
        )}
      </div>
    </div>
  );
}

function Actions({
  invoiceId,
  customerName,
  payToken,
  open,
}: {
  invoiceId: string;
  customerName: string;
  payToken: string | null;
  open: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const payLink = payToken ? `${location.origin}/pay/${payToken}` : null;
  const copy = async () => {
    if (!payLink) return;
    await navigator.clipboard.writeText(payLink);
    setCopied(true);
  };
  return (
    <div>
      <Head title="What you can do" />
      <div className="ln wide">
        <div className="m" />
        <div className="p mt-4 grid gap-2">
          {open && (
            <Link to={`/call/${invoiceId}`} className="btn primary px-4 py-3 text-[15px]">
              <Phone aria-hidden /> Call with AI
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
              <Copy aria-hidden /> {copied ? "Pay link copied" : "Copy pay link"}
            </button>
          )}
          {open && !payLink && (
            <small id={`paynote-${invoiceId}`} className="-mt-1 text-xs text-ink-2">
              Pay links switch on with the Customer pay link screen.
            </small>
          )}
          {open && (
            <Link to={`/print/letter/${invoiceId}`} className="btn secondary">
              <FileText aria-hidden /> Payment Demand Letter
            </Link>
          )}
          {open && (
            <Link to={`/print/case/${invoiceId}`} className="btn secondary">
              <Scale aria-hidden /> ODR case file
            </Link>
          )}
          {open && (
            <small className="-mt-1 text-xs text-ink-2">
              ODR: the government's online dispute resolution portal for small businesses, odr.msme.gov.in.
            </small>
          )}
          <Link to={`/print/invoice/${invoiceId}`} className="btn secondary">
            <Printer aria-hidden /> Print Tax Invoice
          </Link>
          <Link to={`/app/invoices/${invoiceId}/duplicate`} className="btn secondary">
            <Copy aria-hidden /> Duplicate this invoice
          </Link>
          {open && (
            <button type="button" className="btn bare" disabled title="Comes with the Inbox">
              <Flag aria-hidden /> Mark as disputed
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
