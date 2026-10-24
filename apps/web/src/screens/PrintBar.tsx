import { Link } from "react-router";
import { AlertTriangle, ArrowLeft, Printer } from "lucide-react";

/** Screen-only controls. Print CSS hides `.no-print`, so the A4 page has no app chrome. */
export function PrintBar({ invoiceId, canPrint = true }: { invoiceId: string; canPrint?: boolean }) {
  return (
    <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap gap-2">
      <Link to={`/app/invoices/${invoiceId}`} className="btn secondary">
        <ArrowLeft aria-hidden /> Back to the Invoice
      </Link>
      {canPrint && (
        <button type="button" className="btn primary" onClick={() => window.print()}>
          <Printer aria-hidden /> Print or save as PDF
        </button>
      )}
    </div>
  );
}

/** On screen only, never printed: the agreed Plan or Promise a demand goes against. */
export function PlanBanner({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="note" className="no-print mx-auto mb-4 max-w-[210mm] border-l-4 border-rule-strong bg-paper px-3 py-2">
      <span className="word warn">
        <AlertTriangle aria-hidden /> {text}
      </span>
    </p>
  );
}

/** "Nothing is past due for …", in place of a page with nothing to demand. */
export function NothingDue({ invoiceId, text }: { invoiceId: string; text: string }) {
  return (
    <div className="px-3 py-4 sm:px-6">
      <PrintBar invoiceId={invoiceId} canPrint={false} />
      <p role="status" className="mx-auto max-w-[210mm] text-center text-ink-2">
        {text}
      </p>
    </div>
  );
}
