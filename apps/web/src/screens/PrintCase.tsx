import { useEffect, useState } from "react";
import { useParams } from "react-router";
import type { CallRow, ReminderRow } from "@tagada/appwrite";
import { odrCaseFile, type CaseFile } from "@tagada/domain";
import { useWorkspaceRows, useWorld } from "../lib/world.tsx";
import { customerOf, invoiceOf, invoicesForDocument, promisesForDocument, sellerOf } from "../lib/documents.ts";
import { NotFound } from "./NotFound.tsx";
import { glossOf } from "../lib/call.ts";
import { DocHeading, DocLetterhead, DocTable, PageFooter, docSheet } from "./DocParts.tsx";
import { NothingDue, PlanBanner, PrintBar } from "./PrintBar.tsx";
import { useT } from "../i18n/index.ts";

/** /print/case/:id. A4, running onto a second page when the history is long; the toolbar does not print. */
export function PrintCase() {
  const { id } = useParams();
  const world = useWorld();
  const reminders = useWorkspaceRows<ReminderRow>("reminders", true);
  const calls = useWorkspaceRows<CallRow>("calls", true);
  const invoice = world.invoices.find((row) => row.$id === id);
  const customer = invoice ? world.customers.get(invoice.customerId) : undefined;
  const [englishCopy, setEnglishCopy] = useState(false);
  const t = useT();
  if (!invoice || !customer) return <NotFound what="Invoice" />;

  const lang = englishCopy ? "en" : customer.lang === "hi" || customer.lang === "bn" ? customer.lang : "en";
  const listed = invoicesForDocument(world.invoices, invoice).map(invoiceOf);
  const ready = reminders !== null && reminders !== "failed" && calls !== null && calls !== "failed";
  const input = ready
    ? {
        seller: sellerOf(world.workspace),
        customer: customerOf(customer),
        invoices: listed,
        promises: promisesForDocument(world.promisesByInvoice),
        reminders: reminders.map((row) => ({
          invoiceId: row.invoiceId,
          sentDate: row.sentDate,
          stage: row.stage,
          channel: row.channel,
          status: row.status,
        })),
        calls: calls.map((row) => ({ invoiceId: row.invoiceId, startedAt: row.startedAt, transcript: row.transcript })),
        today: world.workspace.today,
        invoiceId: invoice.$id,
      }
    : null;
  const file = input ? odrCaseFile({ ...input, lang }) : null;
  // The page prints in the Customer's language; what only the Owner sees on screen follows the header.
  const screen = input && lang !== t.lang ? odrCaseFile({ ...input, lang: t.lang }) : file;
  const copy = { englishCopy, onEnglishCopy: () => setEnglishCopy((on) => !on) };
  if (screen?.nothingDue) return <NothingDue invoiceId={invoice.$id} text={screen.nothingDue} {...copy} />;

  return (
    <div className="px-3 py-4 sm:px-6 print:p-0">
      <PrintBar invoiceId={invoice.$id} canPrint={file !== null} {...copy} />
      <PlanBanner text={screen?.planBanner ?? null} />
      {!ready || !file ? (
        <p className="text-center text-ink-2">
          {reminders === "failed" || calls === "failed"
            ? t.print.caseFailed
            : t.print.caseLoading}
        </p>
      ) : (
        <CaseSheet file={file} />
      )}
    </div>
  );
}

/** The English for each line said on the call; null while it loads or when the gloss is off. */
function useGloss(lines: readonly string[]): (string | null)[] | null {
  const key = lines.join("\n");
  const [gloss, setGloss] = useState<{ key: string; lines: string[] | null } | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    glossOf(key.split("\n"))
      .catch(() => null)
      .then((out) => live && setGloss({ key, lines: out }));
    return () => {
      live = false;
    };
  }, [key]);
  if (gloss?.key !== key || !gloss.lines) return null;
  // A line already said in English needs no gloss.
  return gloss.lines.map((line, i) => (line && line !== lines[i] ? line : null));
}

function CaseSheet({ file }: { file: CaseFile }) {
  const t = useT();
  const h = file.headings;
  const gloss = useGloss(file.transcriptTurns.map((turn) => turn.message));
  const many = file.reminderRows.some((row) => row.invoice !== null);
  const summary = [
    { label: h.invoices, value: String(file.summary.invoiceCount) },
    { label: h.principal, value: file.summary.principal },
    { label: h.interestSoFar, value: file.summary.interest ?? file.headings.notClaimed },
    { label: h.totalClaimed, value: file.summary.total, total: true },
  ];

  return (
    <>
      <PageFooter name={file.letterhead.name} />
      <article lang={file.lang} className={docSheet}>
        <DocLetterhead
          head={file.letterhead}
          title={file.title}
          reference={file.reference}
          date={file.dateLine}
          headings={h}
          udyamNote={t.print.udyamNote}
        />

        {/* The cover: who claims from whom, and how much. */}
        <section className="keep mt-4 border-2 border-ink">
          <div className="grid sm:grid-cols-2 print:grid-cols-2">
            <div className="min-w-0 p-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-2">{h.claimant}</p>
              {/* The address is in the letterhead above. */}
              <p className="mt-0.5 font-semibold">{file.fromName}</p>
              {file.letterhead.udyam && (
                <p>
                  {h.udyam} <span className="mono">{file.letterhead.udyam}</span>
                  {file.letterhead.udyamType && <span className="text-ink-2">, {file.letterhead.udyamType}</span>}
                </p>
              )}
              {file.letterhead.gstin && (
                <p>
                  GSTIN <span className="mono">{file.letterhead.gstin}</span>
                </p>
              )}
            </div>
            <div className="min-w-0 border-t border-rule-strong p-3 sm:border-t-0 sm:border-l print:border-t-0 print:border-l">
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-2">{h.respondent}</p>
              <p className="mt-0.5 font-semibold">{file.toName}</p>
              {file.toAddress && <p>{file.toAddress}</p>}
              {file.toGstin && (
                <p>
                  GSTIN <span className="mono">{file.toGstin}</span>
                </p>
              )}
            </div>
          </div>
          <dl className="grid grid-cols-2 border-t border-ink sm:grid-cols-4 print:grid-cols-4">
            {summary.map((item) => (
              <div key={item.label} className={`min-w-0 px-3 py-2 ${item.total ? "bg-[var(--rule)]/30 print:bg-transparent" : ""}`}>
                <dt className="text-[11px] text-ink-2">{item.label}</dt>
                <dd className={`num ${item.total ? "text-lg font-semibold" : "font-medium"}`}>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <p className="mt-2 text-[11.5px] text-ink-2">{file.odrExplanation}</p>

        <DocHeading n={1}>{h.invoices}</DocHeading>
        <DocTable
          columns={[{ label: h.number }, { label: h.issued }, { label: h.due }, { label: h.outstanding, numeric: true }]}
          rows={file.invoices.map((line) => ({
            key: line.number,
            cells: [
              <>
                <span className="mono">{line.number}</span>
                {line.note && <span className="block text-[11px] text-ink-2">{line.note}</span>}
              </>,
              line.issued,
              line.due,
              line.outstanding,
            ],
          }))}
          total={{ label: h.total, cells: [file.summary.principal] }}
        />

        <DocHeading n={2}>
          {h.interest} <span className="font-normal normal-case tracking-normal text-ink-2">· MSMED §16</span>
        </DocHeading>
        <p className="text-[11.5px] text-ink-2">{file.interestExplanation}</p>
        {file.interestRows.length > 0 && (
          <div className="mt-2">
            <DocTable
              columns={[
                { label: h.number },
                { label: h.period },
                { label: h.rate, numeric: true },
                { label: h.days, numeric: true },
                { label: h.interestAmount, numeric: true },
              ]}
              rows={file.interestRows.map((row, i) => ({
                key: `${row.invoice}-${i}`,
                cells: [<span className="mono">{row.invoice}</span>, row.period, row.rate, row.days ?? "", row.interest],
              }))}
              total={file.interestTotal ? { label: h.total, cells: [file.interestTotal] } : undefined}
            />
          </div>
        )}
        <p className="mt-1.5">{file.interestNote}</p>

        <DocHeading n={3}>{h.reminders}</DocHeading>
        {file.reminderNote ? (
          <p>{file.reminderNote}</p>
        ) : (
          <DocTable
            columns={[
              { label: h.date },
              ...(many ? [{ label: h.number }] : []),
              { label: h.stage },
              { label: h.channel },
              { label: h.delivery },
            ]}
            rows={file.reminderRows.map((row, i) => ({
              key: `${row.date}-${i}`,
              cells: [
                <span className="whitespace-nowrap">{row.date}</span>,
                ...(many ? [<span className="mono">{row.invoice}</span>] : []),
                row.stage,
                row.channel,
                row.delivery,
              ],
            }))}
          />
        )}

        <section className="keep">
          <DocHeading n={4}>{h.transcript}</DocHeading>
          {file.transcriptWhen && <p className="text-ink-2">{file.transcriptWhen}</p>}
          {file.transcriptTurns.length === 0 ? (
            <p className="mt-1">{file.transcriptLine}</p>
          ) : (
            <ol className="mt-1.5 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2" aria-label={h.said}>
              {file.transcriptTurns.map((turn, i) => (
                <li key={i} className="contents">
                  <span className="text-right text-[11px] font-medium uppercase tracking-[0.04em] text-ink-2">{turn.speaker}</span>
                  <span className="min-w-0 border-l border-rule pl-3">
                    <span lang="hi" className="block">
                      {turn.message}
                    </span>
                    {gloss?.[i] && (
                      <span lang="en" className="mt-0.5 block text-[11.5px] italic text-ink-2">
                        {gloss[i]}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="keep">
          <DocHeading n={5}>{h.howToFile}</DocHeading>
          <ol className="grid gap-1.5">
            {file.steps.map((step, i) => (
              <li key={step} className="grid grid-cols-[1.25rem_1.25rem_minmax(0,1fr)] items-baseline gap-x-1.5">
                <span aria-hidden className="inline-block size-3 translate-y-0.5 border border-ink" />
                <span className="num text-ink-2">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>
      </article>
    </>
  );
}
