import { Link, useParams } from "react-router";
import { ArrowLeft, Printer } from "lucide-react";
import type { InvoiceLineRow } from "@tagada/appwrite";
import { addDays } from "@tagada/money";
import { useInvoiceRows, useWorld } from "../lib/world.tsx";
import { priceLines } from "../lib/pricing.ts";
import { Ln, Paper } from "../ui.tsx";
import { NotFound } from "./NotFound.tsx";
import { TaxInvoice } from "./TaxInvoice.tsx";

/** /print/invoice/:id: the saved Invoice on A4, priced by `money`. */
export function PrintInvoice() {
  const { id } = useParams();
  const world = useWorld();
  const invoice = world.invoices.find((i) => i.$id === id);
  const lines = useInvoiceRows<InvoiceLineRow>("invoice_lines", invoice?.$id);
  const customer = invoice ? world.customers.get(invoice.customerId) : undefined;
  if (!invoice || !customer) return <NotFound what="Invoice" />;

  return (
    <div className="px-3 py-4 sm:px-6 print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap gap-2">
        <Link to={`/app/invoices/${invoice.$id}`} className="btn secondary">
          <ArrowLeft aria-hidden /> Back to the Invoice
        </Link>
        <button type="button" className="btn primary" onClick={() => window.print()}>
          <Printer aria-hidden /> Print or save as PDF
        </button>
      </div>
      {lines === "failed" ? (
        <p className="text-center">The lines could not be loaded. Reload the page to try again.</p>
      ) : lines ? (
        <TaxInvoice
          workspace={world.workspace}
          customer={customer}
          lines={lines}
          priced={priceLines(world.workspace, customer, lines)}
          number={invoice.number}
          issueDate={invoice.issueDate}
          dueDate={invoice.dueDate}
        />
      ) : (
        <p className="text-center text-ink-2">Loading the Invoice…</p>
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
  if (!invoice || !customer) return <NotFound what="Invoice" />;
  const today = world.workspace.today;
  const credit = customer.creditDays ?? 30;

  return (
    <div className="grid gap-4">
      <Paper label="Duplicate this invoice">
        <Ln>
          <p className="text-[13px] text-ink-2">
            <Link to={`/app/invoices/${invoice.$id}`}>
              {customer.name}, <span className="mono">{invoice.number}</span>
            </Link>{" "}
            / duplicate
          </p>
          <h1 className="mt-1 text-[28px] leading-tight">Duplicate this invoice</h1>
          <p className="mt-2 max-w-[60ch]">
            A preview of the same lines for {customer.name}, dated today with {credit} days' credit. Nothing is saved:
            the new-invoice form will let you change it and give it the next number.
          </p>
        </Ln>
      </Paper>
      {lines === "failed" ? (
        <p className="text-center">The lines could not be loaded. Reload the page to try again.</p>
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
        <p className="text-center text-ink-2">Loading the lines…</p>
      )}
    </div>
  );
}
