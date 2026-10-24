// Bank statement: suggestions until the Owner confirms. Nothing is paid before that.
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { Link } from "react-router";
import { Check, CircleDot, CircleHelp, Copy, Flag, Scale } from "lucide-react";
import type { BankAllocation, BankTxnRow, InvoiceLineRow } from "@tagada/appwrite";
import {
  MATCH_LABEL,
  TDS_EXPLAIN,
  bankNarration,
  invoicesForMatch,
  matchCredit,
  overpayPaise,
  proofBankLine,
  type MatchKind,
  type ProofResultKind,
} from "@tagada/domain";
import { formatDate, formatInr } from "@tagada/money";
import { ownerCopy } from "../i18n/owner.ts";
import { useLang } from "../lib/prefs.ts";
import { proofLabel, proofReadout, proofTone } from "../lib/proof.ts";
import { SaveError, assignCredit, confirmBank, importBank, keepAdvance, loadScreenshot } from "../lib/appwrite.ts";
import { useWorkspaceRows, useWorld, useWorldState } from "../lib/world.tsx";
import { Badge, Head, Ln, Paper } from "../ui.tsx";

type ProofRow = {
  $id: string;
  invoiceId: string;
  fileId: string | null;
  result: ProofResultKind | null;
  extracted: string | null;
  checkedAt: string | null;
};

const KIND_ICON: Record<MatchKind, { icon: typeof Check; tone: string }> = {
  exact: { icon: Check, tone: "ok" },
  part: { icon: CircleDot, tone: "plain" },
  multi: { icon: Copy, tone: "plain" },
  overpay: { icon: Flag, tone: "warn" },
  unknown: { icon: CircleHelp, tone: "short" },
  tds: { icon: Scale, tone: "warn" },
};

const TDS_WHY =
  `${TDS_EXPLAIN} ` +
  "A large buyer of goods can deduct 0.1%. Work is 1% for an individual or HUF and 2% for a company; on an Invoice with an installation line, that is a share of the installation line only. " +
  "10% is the rate for professional or technical fees. Confirming a possible TDS covers the Invoice; that amount was kept back, not left owed.";

function allocations(row: BankTxnRow): BankAllocation[] {
  if (!row.allocations) return [];
  try {
    const parsed = JSON.parse(row.allocations) as unknown;
    return Array.isArray(parsed) ? (parsed as BankAllocation[]) : [];
  } catch {
    return [];
  }
}

/** What Confirm did, and what it left for the Owner to check. */
function confirmedNotice(done: string | null, changed: string | null): string {
  if (done && changed) return `${done} ${changed}`;
  return done ?? changed ?? "Nothing to confirm.";
}

/** /app/bank: import a statement, read the suggestion, confirm it. */
export function Bank() {
  const world = useWorld();
  const { lang } = useLang();
  const t = ownerCopy(lang);
  const { reload } = useWorldState();
  const credits = useWorkspaceRows<BankTxnRow>("bank_txns", true);
  const lines = useWorkspaceRows<InvoiceLineRow>("invoice_lines", true);
  const proofs = useWorkspaceRows<ProofRow>("proof_checks");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState(false);
  const [over, setOver] = useState(false);

  const rows = Array.isArray(credits) ? [...credits].sort((a, b) => a.date.localeCompare(b.date) || a.$id.localeCompare(b.$id)) : [];
  const exact = rows.filter((row) => row.matchStatus === "suggested" && row.matchKind === "exact");
  const notes = useMemo(() => {
    const out = new Map<string, string>();
    if (!Array.isArray(credits) || !Array.isArray(lines)) return out;
    const open = invoicesForMatch({
      customers: [...world.customers.values()],
      invoices: world.invoices,
      lines,
    });
    for (const row of credits) {
      // A confirmed credit has paid its Invoices, so matching it again against what is open would say "Unknown deposit".
      if (row.matchStatus === "confirmed") continue;
      const match = matchCredit(
        { date: row.date, narration: row.narration, reference: row.utr ?? "", amountPaise: row.amountPaise },
        open,
      );
      out.set(row.$id, match.note);
    }
    return out;
  }, [credits, lines, world]);

  const run = async (task: () => Promise<string>) => {
    setBusy(true);
    try {
      setNotice(await task());
      await reload();
    } catch (e) {
      console.error(e);
      setNotice(e instanceof SaveError ? e.message : "That could not be done.");
    } finally {
      setBusy(false);
    }
  };

  const takeFile = async (file: File) => {
    const csv = await file.text();
    await run(async () => (await importBank({ csv })).summary);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void takeFile(file);
  };

  const invoiceOf = (id: string) => world.invoices.find((invoice) => invoice.$id === id);
  const customerOf = (customerId: string) => world.customers.get(customerId)?.name;
  const statementNote =
    credits === null
      ? "Reading the statement…"
      : credits === "failed"
        ? "The statement could not be read."
        : Array.isArray(credits) && rows.length === 0
          ? "No credits yet."
          : null;

  return (
    <Paper label="Bank">
      <Ln>
        <h1 className="text-[28px] leading-tight">Bank</h1>
        <p className="mt-1 max-w-[68ch] text-sm text-ink-2">
          Each credit has a suggestion. Nothing is marked paid until you confirm it.{" "}
          <button
            type="button"
            className="linkbtn inline-flex min-h-11 items-center"
            aria-expanded={why}
            onClick={() => setWhy((open) => !open)}
          >
            What is TDS?
          </button>
        </p>
        {why && <p className="mt-2 max-w-[68ch] text-sm">{TDS_WHY}</p>}
        <p className="mt-3">
          <Badge kind="sim">Simulated bank feed</Badge>
        </p>
      </Ln>

      <Ln>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => void run(async () => (await importBank({ sample: true })).summary)}
          >
            Import sample statement
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={busy || exact.length === 0}
            onClick={() =>
              void run(async () => {
                const { confirmed: n, message } = await confirmBank({ allExact: true });
                return confirmedNotice(n === 0 ? null : `Confirmed ${n} exact.`, message);
              })
            }
          >
            Confirm all exact
          </button>
        </div>
        {notice && (
          <p className="mt-3 text-sm" aria-live="polite">
            {notice}
          </p>
        )}

        <label
          className={`mt-4 block cursor-pointer rounded-md border border-dashed px-4 py-4 text-sm ${over ? "border-ink" : "border-rule-strong"}`}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          <span className="block">Drop a CSV here, or choose a file.</span>
          <span className="mt-1 block text-ink-2">
            Columns: date, narration, utr, amount. A sample file is{" "}
            <a href="/bank-statement.csv" download>
              bank-statement.csv
            </a>
            .
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            aria-label="Bank statement CSV"
            className="mt-2 block w-full min-h-11 max-w-full text-sm"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void takeFile(file);
            }}
          />
        </label>
      </Ln>

      <div className="sect mt-6">
        <Head title="Credits" m="date" a="amount" />
        {statementNote && (
          <Ln>
            <p className={`py-4 text-sm ${credits === "failed" ? "" : "text-ink-2"}`}>{statementNote}</p>
          </Ln>
        )}
        <ul className="entries">
          {rows.map((row) => {
            const kind = row.matchKind ?? "unknown";
            const icon = KIND_ICON[kind];
            const shares = allocations(row);
            return (
              <li key={row.$id} className="ln ruler" data-utr={row.utr ?? undefined}>
                <div className="m">{formatDate(row.date, { weekday: false })}</div>
                <div className="p">
                  <span className="block">{bankNarration(row.narration)}</span>
                  {bankNarration(row.narration) !== row.narration && (
                    <span className="mt-1 block text-[13px] text-ink-2">Assigned to {row.narration.slice(0, row.narration.indexOf("\n"))}</span>
                  )}
                  {row.utr && <span className="mono mt-1 block text-[13px] text-ink-2">{row.utr}</span>}
                  <span className={`word ${icon.tone} mt-1`}>
                    <icon.icon aria-hidden /> {MATCH_LABEL[kind]}
                  </span>{" "}
                  <span className="word plain">{row.matchStatus === "confirmed" ? "Confirmed" : row.matchStatus === "suggested" ? "Suggested" : "Unmatched"}</span>
                  {notes.get(row.$id) && <small className="mt-1 block">{notes.get(row.$id)}</small>}
                  {row.matchStatus === "confirmed" && <small className="mt-1 block">Confirmed as a payment.</small>}
                  {shares.length === 0 && !notes.get(row.$id) && <small className="mt-1 block">No Invoice suggested.</small>}
                  {shares.map((share) => {
                    const invoice = invoiceOf(share.invoiceId);
                    return (
                      <small key={share.invoiceId} className="mt-1 block">
                        {invoice ? (
                          <Link to={`/app/invoices/${invoice.$id}`}>{customerOf(invoice.customerId) ?? "Customer"}</Link>
                        ) : (
                          "Customer"
                        )}
                        {invoice && (
                          <>
                            {" "}
                            <span className="mono">{invoice.number}</span>
                          </>
                        )}
                        {`: ${formatInr(share.amountPaise)}`}
                        {share.tdsPaise ? `, and ${formatInr(share.tdsPaise)} kept back as TDS` : ""}
                      </small>
                    );
                  })}
                  {kind === "unknown" && row.matchStatus !== "confirmed" && (
                    <AssignCustomer
                      names={[...world.customers.values()].map((customer) => ({ id: customer.$id, name: customer.name }))}
                      disabled={busy}
                      onAssign={(customerId) =>
                        void run(async () => {
                          const match = await assignCredit(row.$id, customerId);
                          return match.note;
                        })
                      }
                    />
                  )}
                  {overpayPaise(row.amountPaise, shares) > 0 && shares[0] && (
                    <button
                      type="button"
                      className="btn secondary mt-2"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const kept = await keepAdvance(row.$id);
                          return `${formatInr(kept.amountPaise)} kept as an advance for ${kept.customerName}.`;
                        })
                      }
                    >
                      {t.keepAdvance(
                        formatInr(overpayPaise(row.amountPaise, shares)),
                        customerOf(invoiceOf(shares[0].invoiceId)?.customerId ?? "") ?? "Customer",
                      )}
                    </button>
                  )}
                  {row.matchStatus === "suggested" && (
                    <button
                      type="button"
                      className="btn secondary mt-2"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const { confirmed: n, message } = await confirmBank({ ids: [row.$id] });
                          return confirmedNotice(n === 0 ? null : "Confirmed.", message);
                        })
                      }
                    >
                      Confirm
                    </button>
                  )}
                </div>
                <div className="a">{formatInr(row.amountPaise)}</div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="sect mt-8">
        <Head title="Payment proofs" />
        {proofs === "failed" && <p className="px-4 py-4 text-sm">Payment proofs could not be read.</p>}
        {Array.isArray(proofs) && proofs.length === 0 && (
          <p className="px-4 py-4 text-sm text-ink-2">No screenshot to check yet.</p>
        )}
        <ul className="entries">
          {(Array.isArray(proofs) ? [...proofs] : [])
            .sort((a, b) => (b.checkedAt ?? "").localeCompare(a.checkedAt ?? ""))
            .map((proof) => {
              const invoice = invoiceOf(proof.invoiceId);
              const label = proofLabel(proof.result);
              const readout = proofReadout(proof.extracted);
              const tone = proofTone(proof.result);
              const line = readout ? proofBankLine(readout, rows) : null;
              return (
                <li key={proof.$id} className="ln wide ruler">
                  <div className="m">{proof.fileId ? <Shot fileId={proof.fileId} /> : null}</div>
                  <div className="p">
                    <span className={`word ${tone}`}>
                      {proof.result === "found" ? <Check aria-hidden /> : proof.result === "amount_mismatch" ? <Flag aria-hidden /> : <CircleDot aria-hidden />}{" "}
                      {label}
                    </span>
                    <span className="mt-1 block">
                      {invoice ? (
                        <Link to={`/app/invoices/${invoice.$id}`}>{customerOf(invoice.customerId) ?? "Customer"}</Link>
                      ) : (
                        "Customer"
                      )}
                      {invoice && (
                        <>
                          {" "}
                          <span className="mono">{invoice.number}</span>
                        </>
                      )}
                    </span>
                    {readout ? (
                      <small className="mt-1 block">
                        UTR <span className="mono">{readout.utr || "none"}</span>
                        {readout.amount ? `, ${readout.amount}` : ""}
                        {readout.dateText ? `, ${readout.dateText}` : ""}
                        {readout.payeeVpa ? `, ${readout.payeeVpa}` : ""}
                      </small>
                    ) : (
                      <small className="mt-1 block">Nothing read off the screenshot yet.</small>
                    )}
                    {line && (
                      <small className="mt-1 block">
                        Checked against {formatDate(line.date, { weekday: false })} {bankNarration(line.narration)}{" "}
                        {formatInr(line.amountPaise)}
                        {line.utr ? (
                          <>
                            {" "}
                            <span className="mono">{line.utr}</span>
                          </>
                        ) : null}
                      </small>
                    )}
                  </div>
                </li>
              );
            })}
        </ul>
      </div>
    </Paper>
  );
}

function AssignCustomer({
  names,
  disabled,
  onAssign,
}: {
  names: { id: string; name: string }[];
  disabled: boolean;
  onAssign: (customerId: string) => void;
}) {
  const [customerId, setCustomerId] = useState("");
  const t = ownerCopy(useLang().lang);
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (customerId) onAssign(customerId);
      }}
    >
      <label className="text-sm">
        {t.assign}
        <select
          className="mt-1 block min-h-11 max-w-full rounded-md border border-rule-strong bg-paper px-2 text-sm"
          value={customerId}
          disabled={disabled}
          onChange={(event) => setCustomerId(event.target.value)}
        >
          <option value="">Choose a Customer</option>
          {names.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn secondary" disabled={disabled || !customerId}>
        {t.showSuggestion}
      </button>
    </form>
  );
}

/** A stored screenshot. Clicking it shows the whole image. */
function Shot({ fileId }: { fileId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    let url = "";
    loadScreenshot(fileId).then(
      (next) => {
        url = next;
        if (live) setSrc(next);
        else URL.revokeObjectURL(next);
      },
      (e: unknown) => {
        console.error("screenshot", e);
        if (live) setSrc("failed");
      },
    );
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [fileId]);
  if (src === "failed") return <span className="text-[12px] text-ink-2">The screenshot could not be loaded.</span>;
  if (!src) return <span className="text-[12px] text-ink-2">Loading the screenshot…</span>;
  return (
    <>
      <button type="button" className="block" aria-label="Enlarge the screenshot" onClick={() => setOpen(true)}>
        <img src={src} alt="" className="h-16 w-16 rounded border border-rule object-cover" />
      </button>
      {open && (
        <dialog open className="fixed inset-0 z-50 grid h-full w-full max-h-none max-w-none place-items-center bg-ink/70 p-4" onClick={() => setOpen(false)}>
          <img src={src} alt="UPI screenshot" className="max-h-[90dvh] max-w-full" />
        </dialog>
      )}
    </>
  );
}
