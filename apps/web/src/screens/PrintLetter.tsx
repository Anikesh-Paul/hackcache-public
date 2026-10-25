import { useState } from "react";
import { useParams } from "react-router";
import { demandLetter } from "@tagada/domain";
import { useT } from "../i18n/index.ts";
import { useWorld } from "../lib/world.tsx";
import { customerOf, invoiceOf, invoicesForDocument, promisesForDocument, sellerOf } from "../lib/documents.ts";
import { Badge } from "../ui.tsx";
import { NotFound } from "./NotFound.tsx";
import { DocHeading, DocLetterhead, DocNote, DocTable, PageFooter, docSheet } from "./DocParts.tsx";
import { NothingDue, PlanBanner, PrintBar } from "./PrintBar.tsx";
import { UpiQr } from "./TaxInvoice.tsx";

/** /print/letter/:id. The toolbar is screen-only, so the printed page has no app chrome. */
export function PrintLetter() {
  const { id } = useParams();
  const world = useWorld();
  const invoice = world.invoices.find((row) => row.$id === id);
  const customer = invoice ? world.customers.get(invoice.customerId) : undefined;
  const t = useT();
  const [englishCopy, setEnglishCopy] = useState(false);
  if (!invoice || !customer) return <NotFound what="Invoice" />;

  const note = { upi: t.print.upiNote, bank: t.print.bankNote };
  const payUrl = invoice.payToken ? `${location.origin}/pay/${invoice.payToken}` : null;
  const lang = englishCopy ? "en" : customer.lang === "hi" || customer.lang === "bn" ? customer.lang : "en";
  const input = {
    seller: sellerOf(world.workspace),
    customer: customerOf(customer),
    invoices: invoicesForDocument(world.invoices, invoice).map(invoiceOf),
    promises: promisesForDocument(world.promisesByInvoice),
    invoiceId: invoice.$id,
    today: world.workspace.today,
    payUrl,
  };
  const letter = demandLetter({ ...input, lang });
  // The page prints in the Customer's language; what only the Owner sees on screen follows the header.
  const screen = lang === t.lang ? letter : demandLetter({ ...input, lang: t.lang });
  const copy = { englishCopy, onEnglishCopy: () => setEnglishCopy((on) => !on) };
  const h = letter.headings;
  if (screen.nothingDue) return <NothingDue invoiceId={invoice.$id} text={screen.nothingDue} {...copy} />;

  return (
    <div className="px-3 py-4 sm:px-6 print:p-0">
      <PrintBar invoiceId={invoice.$id} {...copy} />
      <PlanBanner text={screen.planBanner} />
      <PageFooter name={letter.letterhead.name} />
      <article lang={letter.lang} className={docSheet}>
        <DocLetterhead
          head={letter.letterhead}
          title={letter.title}
          reference={letter.reference}
          date={letter.dateLine}
          headings={h}
          udyamNote={t.print.udyamNote}
        />
        <p className="mt-1 text-right text-[11px] text-ink-2">{letter.disclaimer}</p>

        <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:items-start print:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] print:items-start">
          <section className="keep min-w-0 pt-1">
            <p className="text-[11px] text-ink-2">{h.to}</p>
            <p className="font-semibold">{letter.toName}</p>
            {letter.toAddress && <p>{letter.toAddress}</p>}
          </section>

          {/* What is owed: the largest thing on the page, in figures and words, with the date to pay by. */}
          <section className="keep min-w-0 border-2 border-ink px-4 py-3" aria-label={h.amountDue}>
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-2">{h.amountDue}</p>
            <p className="num mt-0.5 text-[34px] font-semibold leading-none tracking-tight">{letter.outstanding}</p>
            <p className="mt-1.5">{letter.outstandingWords}</p>
            <p className="mt-2 border-t border-rule pt-2 font-medium">{letter.payBy}</p>
          </section>
        </div>

        <DocHeading>{h.invoices}</DocHeading>
        <DocTable
          columns={[{ label: h.number }, { label: h.issued }, { label: h.due }, { label: h.outstanding, numeric: true }]}
          rows={letter.invoices.map((line) => ({
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
          total={{ label: h.total, cells: [letter.outstanding] }}
        />

        <section className="keep">
          <DocHeading>{h.howToPay}</DocHeading>
          <div className="grid gap-5 sm:grid-cols-2 print:grid-cols-2">
            <div className="min-w-0">
              <h3 className="font-medium">{h.upi}</h3>
              {letter.upiUri ? (
                <div className="mt-2 flex items-start gap-3">
                  <UpiQr uri={letter.upiUri} label={`UPI QR code to pay ${letter.outstanding}`} className="size-28 border border-rule" />
                  <div className="min-w-0">
                    <p className="num text-lg font-semibold">{letter.outstanding}</p>
                    <p className="mono break-all">{letter.upiVpa}</p>
                    <p className="mt-1.5">{letter.scanOrOpen}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-1">{letter.upiLine}</p>
              )}
              {letter.upiUri && (
                <p className="no-print mt-2">
                  <Badge kind="sim">{note.upi}</Badge>
                </p>
              )}
              {letter.payUrl ? (
                <p className="mt-2 text-[10px] leading-tight text-ink-2">
                  <a href={letter.payUrl} className="break-all">
                    {letter.payUrl}
                  </a>
                </p>
              ) : (
                <p className="mt-2 text-[11px] text-ink-2">{letter.payLinkLine}</p>
              )}
            </div>
            <div className="min-w-0 sm:border-l sm:border-rule sm:pl-5 print:border-l print:border-rule print:pl-5">
              <h3 className="font-medium">{letter.bankHeading}</h3>
              <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
                <dt className="text-ink-2">{h.accountName}</dt>
                <dd className="break-words">{letter.bank.accountName}</dd>
                <dt className="text-ink-2">{h.bank}</dt>
                <dd className="break-words">{letter.bank.bankName}</dd>
                <dt className="text-ink-2">{h.accountNumber}</dt>
                <dd className="mono break-all">{letter.bank.accountNumber}</dd>
                <dt className="text-ink-2">{h.ifsc}</dt>
                <dd className="mono">{letter.bank.ifsc}</dd>
              </dl>
              <p className="mt-2">{letter.bank.note}</p>
              <p className="no-print mt-2">
                <Badge kind="sim">{note.bank}</Badge>
              </p>
            </div>
          </div>
          {letter.contactLine && <p className="mt-3">{letter.contactLine}</p>}
        </section>

        {(letter.msmed || letter.deduction) && <DocHeading>{h.notes}</DocHeading>}
        {letter.msmed && (
          <DocNote heading={`MSMED · ${letter.msmed.label}`}>
            <p className="mt-1">{letter.msmed.explanation}</p>
            <p className="mt-1 text-ink">{letter.msmed.totalLine}</p>
            <ul className="mt-1">
              {letter.msmed.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-1">{letter.msmed.aside}</p>
          </DocNote>
        )}
        {letter.deduction && (
          <DocNote heading={letter.deduction.heading}>
            <p className="mt-1">{letter.deduction.explanation}</p>
            <ul className="mt-1">
              {letter.deduction.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </DocNote>
        )}

        {/* The sign-off never splits from its signature line across a page break. */}
        <footer className="keep mt-8 w-64 print:mt-5">
          <p>{letter.signOff}</p>
          <div className="mt-12 border-t border-ink pt-1 print:mt-9">
            <p className="font-medium">{letter.letterhead.name}</p>
            <p className="text-[11px] text-ink-2">{h.signatory}</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
