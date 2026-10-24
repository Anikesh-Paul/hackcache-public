import { useParams } from "react-router";
import { demandLetter } from "@tagada/domain";
import { useWorld } from "../lib/world.tsx";
import { customerOf, invoiceOf, invoicesForDocument, sellerOf } from "../lib/documents.ts";
import { Badge } from "../ui.tsx";
import { NotFound } from "./NotFound.tsx";
import { PrintBar } from "./PrintBar.tsx";
import { UpiQr } from "./TaxInvoice.tsx";

const sheet =
  "mx-auto w-full max-w-[min(100%,210mm)] bg-paper p-5 text-[13px] leading-snug text-ink shadow-[var(--sheet-shadow)] sm:p-[12mm] print:max-w-none print:bg-white print:p-0 print:text-black print:shadow-none";

/** /print/letter/:id. The toolbar is screen-only, so the printed page has no app chrome. */
export function PrintLetter() {
  const { id } = useParams();
  const world = useWorld();
  const invoice = world.invoices.find((row) => row.$id === id);
  const customer = invoice ? world.customers.get(invoice.customerId) : undefined;
  if (!invoice || !customer) return <NotFound what="Invoice" />;

  const payUrl = invoice.payToken ? `${location.origin}/pay/${invoice.payToken}` : null;
  const letter = demandLetter({
    seller: sellerOf(world.workspace),
    customer: customerOf(customer),
    invoices: invoicesForDocument(world.invoices, invoice).map(invoiceOf),
    invoiceId: invoice.$id,
    today: world.workspace.today,
    payUrl,
  });

  return (
    <div className="px-3 py-4 sm:px-6 print:p-0">
      <PrintBar invoiceId={invoice.$id} />
      <article className={sheet}>
        <header className="border-b-2 border-ink pb-3">
          <p className="text-lg font-semibold">{letter.fromName}</p>
          {letter.fromAddress && <p>{letter.fromAddress}</p>}
          {letter.fromGstin && (
            <p>
              GSTIN <span className="mono">{letter.fromGstin}</span>
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-2xl">{letter.title}</h1>
            <p>{letter.dateLine}</p>
          </div>
          <p className="mt-2 font-medium">{letter.disclaimer}</p>
        </header>

        <section className="border-b border-rule-strong py-3">
          <p className="text-ink-2">To</p>
          <p className="font-semibold">{letter.toName}</p>
          {letter.toAddress && <p>{letter.toAddress}</p>}
        </section>

        <section className="py-3">
          <h2 className="font-semibold">Invoices</h2>
          <ul className="mt-2 divide-y divide-rule">
            {letter.invoices.map((line) => (
              <li key={line.number} className="grid gap-1 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline">
                <p>
                  <span className="mono">{line.number}</span>
                  <span className="mt-0.5 block text-ink-2">
                    Issued {line.issued}. Due {line.due}.
                  </span>
                </p>
                <p className="font-medium">{line.outstanding}</p>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex justify-between gap-3 border-t border-ink pt-2 text-base font-semibold">
            <span>Outstanding</span>
            <span>{letter.outstanding}</span>
          </p>
          <p className="mt-3">{letter.deadlineLine}</p>
        </section>

        <section className="border-t border-rule-strong py-3">
          <h2 className="font-semibold">How to pay</h2>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {letter.upiUri && (
              <UpiQr uri={letter.upiUri} label={`UPI QR code to pay ${letter.outstanding}`} className="size-24" />
            )}
            <p className="min-w-0 break-words">{letter.upiLine}</p>
          </div>
          {letter.upiUri && (
            <p className="no-print mt-2">
              <Badge kind="sim">Simulated UPI ID: no one is paid</Badge>
            </p>
          )}
          <h3 className="mt-4 font-medium">Bank transfer</h3>
          <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
            <dt className="text-ink-2">Account name</dt>
            <dd className="break-words">{letter.bank.accountName}</dd>
            <dt className="text-ink-2">Bank</dt>
            <dd className="break-words">{letter.bank.bankName}</dd>
            <dt className="text-ink-2">Account number</dt>
            <dd className="mono break-all">{letter.bank.accountNumber}</dd>
            <dt className="text-ink-2">IFSC</dt>
            <dd className="mono">{letter.bank.ifsc}</dd>
          </dl>
          <p className="mt-1">{letter.bank.note}</p>
          <p className="no-print mt-2">
            <Badge kind="sim">Sample account for this Demo world. No one is paid.</Badge>
          </p>
          <p className="mt-3 break-all">{letter.payLinkLine}</p>
          {letter.contactLine && <p className="mt-2">{letter.contactLine}</p>}
        </section>

        {letter.msmed && (
          <aside className="mt-2 border border-rule-strong p-3">
            <p className="font-medium">{letter.msmed.label}</p>
            <p className="mt-2">{letter.msmed.explanation}</p>
            <p className="mt-2 font-medium">{letter.msmed.totalLine}</p>
            <ul className="mt-2 space-y-1">
              {letter.msmed.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-2">{letter.msmed.aside}</p>
          </aside>
        )}

        <footer className="mt-8 flex justify-end">
          <div className="text-center">
            <p>{letter.signOff}</p>
            <div className="mt-10 w-56 border-t border-ink pt-1 text-xs">Authorised signatory</div>
          </div>
        </footer>
      </article>
    </div>
  );
}
