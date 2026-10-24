import { Link } from "react-router";
import { ArrowLeft, Printer } from "lucide-react";

/** Screen-only controls. Print CSS hides `.no-print`, so the A4 page has no app chrome. */
export function PrintBar({ invoiceId }: { invoiceId: string }) {
  return (
    <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap gap-2">
      <Link to={`/app/invoices/${invoiceId}`} className="btn secondary">
        <ArrowLeft aria-hidden /> Back to the Invoice
      </Link>
      <button type="button" className="btn primary" onClick={() => window.print()}>
        <Printer aria-hidden /> Print or save as PDF
      </button>
    </div>
  );
}
