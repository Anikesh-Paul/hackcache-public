import { Link, useParams } from "react-router";
import type { InvoiceLineRow } from "@tagada/appwrite";
import { addDays } from "@tagada/money";
import { useInvoiceRows, useWorld } from "../lib/world.tsx";
import { priceLines } from "../lib/pricing.ts";
import { Ln, Paper } from "../ui.tsx";
import { NotFound } from "./NotFound.tsx";
import { PrintBar } from "./PrintBar.tsx";
import { TaxInvoice } from "./TaxInvoice.tsx";
import { useT } from "../i18n/index.ts";

/** /print/invoice/:id: the saved Invoice on A4, priced by `money`. */
export function PrintInvoice() {
  const { id } = useParams();
  const world = useWorld();
  const invoice = world.invoices.find((i) => i.$id === id);
  const lines = useInvoiceRows<InvoiceLineRow>("invoice_lines", invoice?.$id);
  const customer = invoice ? world.customers.get(invoice.customerId) : undefined;
  const t = useT();
  if (!invoice || !customer) return <NotFound what="Invoice" />;

  return (
    <div className="px-3 py-4 sm:px-6 print:p-0">
      <PrintBar invoiceId={invoice.$id} />
      {lines === "failed" ? (
        <p className="text-center">{t.invoice.linesFailed}</p>
      ) : lines ? (
        <div className="on-paper">
          <TaxInvoice
            workspace={world.workspace}
            customer={customer}
            lines={lines}
            priced={priceLines(world.workspace, customer, lines)}
            number={invoice.number}
            issueDate={invoice.issueDate}
            dueDate={invoice.dueDate}
          />
        </div>
      ) : (
        <p className="text-center text-ink-2">{t.print.invoiceLoading}</p>
      )}
    </div>
  );
}

/** /app/invoices/:id/duplicate: the same Customer and lines, dated today, read-only. */
export function DuplicatePreview() {
  const { id } = useParams();
  const world = useWorld();
  const invoice = world.invoices.find((i) => i.$id === id);
  const lines = useInvoiceRows<InvoiceLineRow>("invoice_lines", invoice?.$id);
  const customer = invoice ? world.customers.get(invoice.customerId) : undefined;
  const t = useT();
  if (!invoice || !customer) return <NotFound what="Invoice" />;
  const today = world.workspace.today;
  const credit = customer.creditDays ?? 30;

  return (
    <div className="grid gap-4">
      <Paper label={t.duplicate.title}>
        <Ln>
          <p className="text-[13px] text-ink-2">
            <Link to={`/app/invoices/${invoice.$id}`}>
              {customer.name}, <span className="mono">{invoice.number}</span>
            </Link>{" "}
            / {t.duplicate.crumb}
          </p>
          <h1 className="mt-1 text-[28px] leading-tight">{t.duplicate.title}</h1>
          <p className="mt-2 max-w-[60ch]">{t.duplicate.preview(customer.name, credit)}</p>
          <Link to={`/app/invoices/new?from=${invoice.$id}`} className="btn primary mt-4">
            {t.duplicate.open}
          </Link>
        </Ln>
      </Paper>
      {lines === "failed" ? (
        <p className="text-center">{t.invoice.linesFailed}</p>
      ) : lines ? (
        <TaxInvoice
          workspace={world.workspace}
          customer={customer}
          lines={lines}
          priced={priceLines(world.workspace, customer, lines)}
          number={null}
          issueDate={today}
          dueDate={addDays(today, credit)}
        />
      ) : (
        <p className="text-center text-ink-2">{t.invoice.linesLoading}</p>
      )}
    </div>
  );
}
