// Bank statement: suggestions until the Owner confirms. Nothing is paid before that.
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { Link } from "react-router";
import { Check, CircleDot, CircleHelp, Copy, Flag, Scale } from "lucide-react";
import type { BankAllocation, BankTxnRow, InvoiceLineRow } from "@tagada/appwrite";
import {
  invoicesForMatch,
  matchCredit,
  matchForCustomer,
  overpayPaise,
  proofBankLine,
  type MatchKind,
  type ProofResultKind,
} from "@tagada/domain";
import { formatInr } from "@tagada/money";
import { useT, type Copy as Words } from "../i18n/index.ts";
import { proofReadout, proofTone } from "../lib/proof.ts";
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
function confirmedNotice(t: Words, done: string | null, changed: string | null): string {
  const left = changed ? t.bank.changed(changed) : null;
  if (done && left) return `${done} ${left}`;
  return done ?? left ?? t.bank.nothingToConfirm;
}

/** The bank line an advance event was kept from. */
function advanceCredit(payload: string | null): string | null {
  if (!payload) return null;
  try {
    const id = (JSON.parse(payload) as { bankTxnId?: unknown }).bankTxnId;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}

/** /app/bank: import a statement, read the suggestion, confirm it. */
export function Bank() {
  const world = useWorld();
  const t = useT();
  const { reload, events } = useWorldState();
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
    const out = new Map<string, { kind: MatchKind; note: string }>();
    if (!Array.isArray(credits) || !Array.isArray(lines)) return out;
    const open = invoicesForMatch({
      customers: [...world.customers.values()],
      invoices: world.invoices,
      lines,
    });
    for (const row of credits) {
      // A confirmed credit has paid its Invoices, so matching it again against what is open would say "Unknown deposit".
      if (row.matchStatus === "confirmed") continue;
      const credit = { date: row.date, narration: row.narration, reference: row.utr ?? "", amountPaise: row.amountPaise };
      const assigned = row.assignedCustomerId ? world.customers.get(row.assignedCustomerId) : undefined;
      const match = assigned
        ? matchForCustomer(credit, open, { id: assigned.$id, name: assigned.name })
        : matchCredit(credit, open);
      out.set(row.$id, { kind: match.kind, note: match.note });
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
      setNotice(e instanceof SaveError ? t.common.saveError(e.message) : t.common.couldNotBeDone);
    } finally {
      setBusy(false);
    }
  };

  const importReport = async (body: { sample?: true; csv?: string }) => {
    const report = await importBank(body);
    return t.bank.imported(report.already, report.added);
  };

  const takeFile = async (file: File) => {
    const csv = await file.text();
    await run(() => importReport({ csv }));
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void takeFile(file);
  };

  const kept = new Set(Array.isArray(events) ? events.flatMap((event) => (event.type === "advance" ? [advanceCredit(event.payload)] : [])) : []);
  const invoiceOf = (id: string) => world.invoices.find((invoice) => invoice.$id === id);
  const customerOf = (customerId: string) => world.customers.get(customerId)?.name;
  const statementNote =
    credits === null ? t.bank.reading : credits === "failed" ? t.bank.unreadable : Array.isArray(credits) && rows.length === 0 ? t.bank.none : null;

  return (
    <Paper label={t.bank.title}>
      <Ln>
        <h1 className="text-[28px] leading-tight">{t.bank.title}</h1>
        <p className="mt-1 max-w-[68ch] text-sm text-ink-2">
          {t.bank.intro}{" "}
          <button
            type="button"
            className="linkbtn inline-flex min-h-11 items-center"
            aria-expanded={why}
            onClick={() => setWhy((open) => !open)}
          >
            {t.bank.tdsAsk}
          </button>
        </p>
        {why && <p className="mt-2 max-w-[68ch] text-sm">{t.bank.tdsWhy}</p>}
        <p className="mt-3">
          <Badge kind="sim">{t.bank.simulated}</Badge>
        </p>
      </Ln>

      <Ln>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn primary" disabled={busy} onClick={() => void run(() => importReport({ sample: true }))}>
            {t.bank.importSample}
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={busy || exact.length === 0}
            onClick={() =>
              void run(async () => {
                const { confirmed: n, message } = await confirmBank({ allExact: true });
                return confirmedNotice(t, n === 0 ? null : t.bank.confirmedExact(n), message);
              })
            }
          >
            {t.bank.confirmAllExact}
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
          <span className="block">{t.bank.drop}</span>
          <span className="mt-1 block text-ink-2">
            {t.bank.columns}{" "}
            <a href="/bank-statement.csv" download>
              bank-statement.csv
            </a>
            .
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            aria-label={t.bank.csvLabel}
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
        <Head title={t.bank.credits} m={t.bank.date} a={t.bank.amount} />
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
            const note = notes.get(row.$id);
            const extra = overpayPaise(row.amountPaise, shares);
            return (
              <li key={row.$id} className="ln ruler" data-utr={row.utr ?? undefined}>
                <div className="m">{t.date(row.date, { weekday: false })}</div>
                <div className="p">
                  <span className="block">{row.narration}</span>
                  {row.assignedCustomerId && (
                    <span className="mt-1 block text-[13px] text-ink-2">
                      {t.bank.assignedTo(customerOf(row.assignedCustomerId) ?? t.common.customer)}
                    </span>
                  )}
                  {row.utr && <span className="mono mt-1 block text-[13px] text-ink-2">{row.utr}</span>}
                  <span className={`word ${icon.tone} mt-1`}>
                    <icon.icon aria-hidden /> {t.bank.kinds[kind]}
                  </span>{" "}
                  <span className="word plain">{t.bank.matchStatus[row.matchStatus]}</span>
                  {note && <small className="mt-1 block">{t.bank.matchNote(note.kind, note.note)}</small>}
                  {row.matchStatus === "confirmed" && <small className="mt-1 block">{t.bank.confirmedPayment}</small>}
                  {shares.length === 0 && !note && <small className="mt-1 block">{t.bank.noSuggestion}</small>}
                  {shares.map((share) => {
                    const invoice = invoiceOf(share.invoiceId);
                    return (
                      <small key={share.invoiceId} className="mt-1 block">
                        {invoice ? (
                          <Link to={`/app/invoices/${invoice.$id}`}>{customerOf(invoice.customerId) ?? t.common.customer}</Link>
                        ) : (
                          t.common.customer
                        )}
                        {invoice && (
                          <>
                            {" "}
                            <span className="mono">{invoice.number}</span>
                          </>
                        )}
                        {`: ${formatInr(share.amountPaise)}`}
                        {share.tdsPaise ? t.bank.keptTds(formatInr(share.tdsPaise)) : ""}
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
                          return t.bank.matchNote(match.kind as MatchKind, match.note);
                        })
                      }
                    />
                  )}
                  {row.matchStatus === "confirmed" && extra > 0 && shares[0] && !kept.has(row.$id) && (
                    <button
                      type="button"
                      className="btn secondary mt-2"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const done = await keepAdvance(row.$id);
                          return t.bank.advanceKept(formatInr(done.amountPaise), done.customerName);
                        })
                      }
                    >
                      {t.bank.keepAdvance(formatInr(extra), customerOf(invoiceOf(shares[0].invoiceId)?.customerId ?? "") ?? t.common.customer)}
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
                          return confirmedNotice(t, n === 0 ? null : t.bank.confirmed, message);
                        })
                      }
                    >
                      {t.bank.confirm}
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
        <Head title={t.bank.proofs} />
        {proofs === "failed" && <p className="px-4 py-4 text-sm">{t.bank.proofsFailed}</p>}
        {Array.isArray(proofs) && proofs.length === 0 && <p className="px-4 py-4 text-sm text-ink-2">{t.bank.noProofs}</p>}
        <ul className="entries">
          {(Array.isArray(proofs) ? [...proofs] : [])
            .sort((a, b) => (b.checkedAt ?? "").localeCompare(a.checkedAt ?? ""))
            .map((proof) => {
              const invoice = invoiceOf(proof.invoiceId);
              const readout = proofReadout(proof.extracted);
              const tone = proofTone(proof.result);
              const line = readout ? proofBankLine(readout, rows) : null;
              return (
                <li key={proof.$id} className="ln wide ruler">
                  <div className="m">{proof.fileId ? <Shot fileId={proof.fileId} /> : null}</div>
                  <div className="p">
                    <span className={`word ${tone}`}>
                      {proof.result === "found" ? <Check aria-hidden /> : proof.result === "amount_mismatch" ? <Flag aria-hidden /> : <CircleDot aria-hidden />}{" "}
                      {t.proof.labels[proof.result ?? "not_found_yet"]}
                    </span>
                    <span className="mt-1 block">
                      {invoice ? (
                        <Link to={`/app/invoices/${invoice.$id}`}>{customerOf(invoice.customerId) ?? t.common.customer}</Link>
                      ) : (
                        t.common.customer
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
                        UTR <span className="mono">{readout.utr || t.bank.none_}</span>
                        {readout.amount ? `, ${readout.amount}` : ""}
                        {readout.dateText ? `, ${readout.dateText}` : ""}
                        {readout.payeeVpa ? `, ${readout.payeeVpa}` : ""}
                      </small>
                    ) : (
                      <small className="mt-1 block">{t.bank.nothingRead}</small>
                    )}
                    {line && (
                      <small className="mt-1 block">
                        {t.bank.checkedAgainst} {t.date(line.date, { weekday: false })} {line.narration} {formatInr(line.amountPaise)}
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
  const t = useT();
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (customerId) onAssign(customerId);
      }}
    >
      <label className="text-sm">
        {t.bank.assign}
        <select
          className="mt-1 block min-h-11 max-w-full rounded-md border border-rule-strong bg-paper px-2 text-sm"
          value={customerId}
          disabled={disabled}
          onChange={(event) => setCustomerId(event.target.value)}
        >
          <option value="">{t.bank.choose}</option>
          {names.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn secondary" disabled={disabled || !customerId}>
        {t.bank.showSuggestion}
      </button>
    </form>
  );
}

/** A stored screenshot. Clicking it shows the whole image. */
function Shot({ fileId }: { fileId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const t = useT();
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
  if (src === "failed") return <span className="text-[12px] text-ink-2">{t.bank.shotFailed}</span>;
  if (!src) return <span className="text-[12px] text-ink-2">{t.bank.shotLoading}</span>;
  return (
    <>
      <button type="button" className="block" aria-label={t.bank.enlarge} onClick={() => setOpen(true)}>
        <img src={src} alt="" className="h-16 w-16 rounded border border-rule object-cover" />
      </button>
      {open && (
        <dialog open className="fixed inset-0 z-50 grid h-full w-full max-h-none max-w-none place-items-center bg-ink/70 p-4" onClick={() => setOpen(false)}>
          <img src={src} alt={t.bank.shotAlt} className="max-h-[90dvh] max-w-full" />
        </dialog>
      )}
    </>
  );
}
