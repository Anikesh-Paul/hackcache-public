import { Link } from "react-router";
import { AlertTriangle, ArrowLeft, Printer } from "lucide-react";
import { useLang } from "../lib/prefs.ts";

const BAR = {
  en: { back: "Back to the Invoice", print: "Print or save as PDF", english: "English copy", customer: "Customer's language" },
  hi: { back: "बिल पर वापस", print: "छापें या PDF सहेजें", english: "अंग्रेज़ी प्रति", customer: "ग्राहक की भाषा" },
  bn: { back: "বিলে ফিরে যান", print: "ছাপুন বা PDF সেভ করুন", english: "ইংরেজি কপি", customer: "গ্রাহকের ভাষা" },
};

/** Screen-only controls. Print CSS hides `.no-print`, so the A4 page has no app chrome. */
export function PrintBar({
  invoiceId,
  canPrint = true,
  englishCopy,
  onEnglishCopy,
}: {
  invoiceId: string;
  canPrint?: boolean;
  englishCopy?: boolean;
  onEnglishCopy?: () => void;
}) {
  const { lang } = useLang();
  const t = BAR[lang];
  return (
    <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap gap-2">
      <Link to={`/app/invoices/${invoiceId}`} className="btn secondary">
        <ArrowLeft aria-hidden /> {t.back}
      </Link>
      {canPrint && (
        <button type="button" className="btn primary" onClick={() => window.print()}>
          <Printer aria-hidden /> {t.print}
        </button>
      )}
      {onEnglishCopy && (
        <button type="button" className="btn secondary" aria-pressed={englishCopy} onClick={onEnglishCopy}>
          {englishCopy ? t.customer : t.english}
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
export function NothingDue({
  invoiceId,
  text,
  englishCopy,
  onEnglishCopy,
}: {
  invoiceId: string;
  text: string;
  englishCopy?: boolean;
  onEnglishCopy?: () => void;
}) {
  return (
    <div className="px-3 py-4 sm:px-6">
      <PrintBar invoiceId={invoiceId} canPrint={false} englishCopy={englishCopy} onEnglishCopy={onEnglishCopy} />
      <p role="status" className="mx-auto max-w-[210mm] text-center text-ink-2">
        {text}
      </p>
    </div>
  );
}
