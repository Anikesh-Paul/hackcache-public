import { useParams } from "react-router";
import type { CallRow, ReminderRow } from "@tagada/appwrite";
import { odrCaseFile } from "@tagada/domain";
import { useWorkspaceRows, useWorld } from "../lib/world.tsx";
import { customerOf, invoiceOf, invoicesForDocument, promisesForDocument, sellerOf } from "../lib/documents.ts";
import { NotFound } from "./NotFound.tsx";
import { NothingDue, PlanBanner, PrintBar } from "./PrintBar.tsx";

const sheet =
  "on-paper case-file mx-auto w-full max-w-[min(100%,210mm)] bg-paper p-4 text-[12px] leading-snug text-ink shadow-[var(--sheet-shadow)] sm:p-[10mm] print:max-w-none print:bg-white print:p-0 print:text-black print:shadow-none";

/** /print/case/:id. One A4 page: the toolbar does not print. */
export function PrintCase() {
  const { id } = useParams();
  const world = useWorld();
  const reminders = useWorkspaceRows<ReminderRow>("reminders", true);
  const calls = useWorkspaceRows<CallRow>("calls", true);
  const invoice = world.invoices.find((row) => row.$id === id);
  const customer = invoice ? world.customers.get(invoice.customerId) : undefined;
  if (!invoice || !customer) return <NotFound what="Invoice" />;

  const listed = invoicesForDocument(world.invoices, invoice).map(invoiceOf);
  const ready = reminders !== null && reminders !== "failed" && calls !== null && calls !== "failed";
  const file = ready
    ? odrCaseFile({
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
      })
    : null;
  if (file?.nothingDue) return <NothingDue invoiceId={invoice.$id} text={file.nothingDue} />;

  return (
    <div className="px-3 py-4 sm:px-6 print:p-0">
      <PrintBar invoiceId={invoice.$id} canPrint={file !== null} />
      <PlanBanner text={file?.planBanner ?? null} />
      {!ready || !file ? (
        <p className="text-center text-ink-2">
          {reminders === "failed" || calls === "failed"
            ? "The case file could not be loaded. Reload the page to try again."
            : "Loading the case file…"}
        </p>
      ) : (
        <article className={sheet}>
          <header className="flex flex-wrap items-end justify-between gap-2 border-b-2 border-ink pb-2">
            <div>
              <p className="font-semibold">{file.fromName}</p>
              <h1 className="text-xl">{file.title}</h1>
            </div>
            <p>{file.dateLine}</p>
          </header>
          <p className="mt-2">
            For {file.toName}. {file.odrExplanation}
          </p>

          <section className="mt-2">
            <h2 className="font-semibold">Steps</h2>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5">
              {file.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>

          <section className="mt-2">
            <h2 className="font-semibold">Invoices</h2>
            <ul>
              {file.invoices.map((line) => (
                <li key={line.number} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 border-b border-rule py-1">
                  <span className="min-w-0">
                    <span className="mono">{line.number}</span>
                    <span className="text-ink-2">
                      {" "}
                      issued {line.issued}, due {line.due}
                      {line.note && `. ${line.note}`}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium">{line.outstanding}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-2">
            <h2 className="font-semibold">Interest workings</h2>
            <p className="mt-1">{file.interestExplanation}</p>
            <p className="mt-1">{file.interestNote}</p>
            {file.interestLines.length > 0 && (
              <ul className="mt-1">
                {file.interestLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-2">
            <h2 className="font-semibold">Reminder history</h2>
            {file.reminderNote ? (
              <p className="mt-1">{file.reminderNote}</p>
            ) : (
              <ul className="mt-1">
                {file.reminders.map((line) => (
                  <li key={`${line.when}-${line.text}`}>
                    {line.when}. {line.text}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-2">
            <h2 className="font-semibold">Call transcript excerpt</h2>
            {file.transcriptWhen && <p className="mt-1 text-ink-2">{file.transcriptWhen}</p>}
            <p className="mt-1 whitespace-pre-line">{file.transcriptLine}</p>
          </section>
        </article>
      )}
    </div>
  );
}
