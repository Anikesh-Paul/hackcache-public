// Bank statement: suggestions until the Owner confirms. Nothing is paid before that.
import { useState, type DragEvent } from "react";
import { Link } from "react-router";
import { Check, CircleDot, CircleHelp, Copy, Flag, Scale } from "lucide-react";
import type { BankAllocation, BankTxnRow } from "@tagada/appwrite";
import { MATCH_LABEL, PROOF_LABEL, type MatchKind, type ProofResultKind } from "@tagada/domain";
import { formatDate, formatInr, parseAmountPaise } from "@tagada/money";
import { SaveError, confirmBank, importBank } from "../lib/appwrite.ts";
import { useWorkspaceRows, useWorld, useWorldState } from "../lib/world.tsx";
import { Badge, Head, Ln, Paper } from "../ui.tsx";

type ProofRow = {
  $id: string;
  invoiceId: string;
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
  "Possible TDS means the amount is short by exactly 0.1%, 1%, 2% or 10% of the taxable value. " +
  "A large buyer of goods can deduct 0.1%. Work is 1% for an individual or HUF and 2% for a company, and a hotel's 2% is on the installation line only. " +
  "10% is the rate for professional or technical fees. Confirming a possible TDS covers the Invoice; the shortfall was kept back, not left owed.";

function allocations(row: BankTxnRow): BankAllocation[] {
  if (!row.allocations) return [];
  try {
    const parsed = JSON.parse(row.allocations) as unknown;
    return Array.isArray(parsed) ? (parsed as BankAllocation[]) : [];
  } catch {
    return [];
  }
}

function proofAmount(extracted: string | null): string {
  if (!extracted) return "";
  try {
    const parsed = JSON.parse(extracted) as { amountText?: unknown };
    if (typeof parsed.amountText !== "string") return "";
    const paise = parseAmountPaise(parsed.amountText);
    return paise === null ? "" : formatInr(paise);
  } catch {
    return "";
  }
}

export function proofLabel(result: ProofResultKind | null): string {
  return result ? PROOF_LABEL[result] : "Not found yet";
}

/** /app/bank: import a statement, read the suggestion, confirm it. */
export function Bank() {
  const world = useWorld();
  const { reload } = useWorldState();
  const credits = useWorkspaceRows<BankTxnRow>("bank_txns", true);
  const proofs = useWorkspaceRows<ProofRow>("proof_checks");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState(false);
  const [over, setOver] = useState(false);

  const rows = Array.isArray(credits) ? [...credits].sort((a, b) => a.date.localeCompare(b.date) || a.$id.localeCompare(b.$id)) : [];
  const exact = rows.filter((row) => row.matchStatus === "suggested" && row.matchKind === "exact");

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
              const n = await confirmBank({ allExact: true });
              return n === 0 ? "Nothing to confirm." : `Confirmed ${n} exact.`;
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
        <span className="mt-1 block text-ink-2">Columns: date, narration, utr, amount.</span>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          aria-label="Bank statement CSV"
          className="mt-2 block min-h-11 text-sm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void takeFile(file);
          }}
        />
      </label>

      <div className="sect mt-6">
        <Head title="Credits" m="date" a="amount" />
        {credits === null && <p className="px-4 py-4 text-sm text-ink-2">Reading the statement…</p>}
        {credits === "failed" && <p className="px-4 py-4 text-sm">The statement could not be read.</p>}
        {Array.isArray(credits) && rows.length === 0 && <p className="px-4 py-4 text-sm text-ink-2">No credits yet.</p>}
        <ul className="entries">
          {rows.map((row) => {
            const kind = row.matchKind ?? "unknown";
            const icon = KIND_ICON[kind];
            const shares = allocations(row);
            return (
              <li key={row.$id} className="ln ruler">
                <div className="m">{formatDate(row.date, { weekday: false })}</div>
                <div className="p">
                  <span className="block">{row.narration}</span>
                  {row.utr && <span className="mono mt-1 block text-[13px] text-ink-2">{row.utr}</span>}
                  <span className={`word ${icon.tone} mt-1`}>
                    <icon.icon aria-hidden /> {MATCH_LABEL[kind]}
                  </span>{" "}
                  <span className="word plain">{row.matchStatus === "confirmed" ? "Confirmed" : row.matchStatus === "suggested" ? "Suggested" : "Unmatched"}</span>
                  {shares.length === 0 && <small className="mt-1 block">No Invoice suggested.</small>}
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
                        {` · ${formatInr(share.amountPaise)}`}
                        {share.tdsPaise ? ` · ${formatInr(share.tdsPaise)} kept back as TDS` : ""}
                      </small>
                    );
                  })}
                  {row.matchStatus === "suggested" && (
                    <button
                      type="button"
                      className="btn secondary mt-2"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const n = await confirmBank({ ids: [row.$id] });
                          return n === 0 ? "Nothing to confirm." : "Confirmed.";
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
              const amount = proofAmount(proof.extracted);
              const tone = proof.result === "found" ? "ok" : proof.result === "amount_mismatch" ? "warn" : "plain";
              return (
                <li key={proof.$id} className="ln wide ruler">
                  <div className="m" />
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
                      {amount && ` · ${amount}`}
                    </span>
                  </div>
                </li>
              );
            })}
        </ul>
      </div>
    </Paper>
  );
}
