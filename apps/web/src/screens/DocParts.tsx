// The parts the Payment Demand Letter and the ODR case file share: the
// letterhead, the A4 sheet, ledger tables and the printed page footer.
import type { ReactNode } from "react";
import type { Letterhead } from "@tagada/domain";
import { Badge } from "../ui.tsx";

/** White paper on screen; on print the @page margins frame it, so the sheet adds none. */
export const docSheet =
  "on-paper doc mx-auto w-full max-w-[min(100%,210mm)] bg-paper p-5 text-[13px] leading-snug text-ink shadow-[var(--sheet-shadow)] sm:min-h-[297mm] sm:px-[16mm] sm:py-[14mm] print:min-h-0 print:max-w-none print:bg-white print:p-0 print:text-[11.5px] print:text-black print:shadow-none";

type Headings = { reference: string; date: string; udyam: string; contact: string };

/** Business name, address, GSTIN, Udyam and contact on the left; the title, reference and date on the right. */
export function DocLetterhead({
  head,
  title,
  reference,
  date,
  headings,
  udyamNote,
}: {
  head: Letterhead;
  title: string;
  reference: string;
  date: string;
  headings: Headings;
  udyamNote: string;
}) {
  return (
    <header className="keep grid gap-x-6 gap-y-3 border-b border-ink pb-3 sm:grid-cols-[minmax(0,1fr)_auto] print:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <p className="text-xl font-semibold leading-tight">{head.name}</p>
        {head.address && <p className="mt-1 max-w-[52ch]">{head.address}</p>}
        <dl className="doc-meta mt-1 text-ink-2">
          {head.gstin && (
            <div>
              <dt>GSTIN</dt>
              <dd className="mono text-ink">{head.gstin}</dd>
            </div>
          )}
          {head.udyam && (
            <div>
              <dt>{headings.udyam}</dt>
              <dd className="mono text-ink">{head.udyam}</dd>
            </div>
          )}
          {head.contact && (
            <div>
              <dt>{headings.contact}</dt>
              <dd className="break-all text-ink">{head.contact}</dd>
            </div>
          )}
        </dl>
        {head.udyamSample && (
          <p className="no-print mt-1">
            <Badge kind="sim">{udyamNote}</Badge>
          </p>
        )}
      </div>
      <div className="sm:text-right print:text-right">
        <h1 className="text-2xl leading-tight">{title}</h1>
        <dl className="mt-2 grid grid-cols-[auto_auto] gap-x-3 sm:justify-end print:justify-end">
          <dt className="text-ink-2">{headings.reference}</dt>
          <dd className="mono">{reference}</dd>
          <dt className="text-ink-2">{headings.date}</dt>
          <dd>{date}</dd>
        </dl>
      </div>
    </header>
  );
}

/** A section heading that stays with what follows it on the printed page. */
export function DocHeading({ n, children }: { n?: number; children: ReactNode }) {
  return (
    <h2 className="doc-h2 mt-5 mb-1.5 text-[13px] font-semibold uppercase tracking-[0.04em] print:mt-3.5 print:mb-1">
      {n !== undefined && <span className="mr-1.5">{n}.</span>}
      {children}
    </h2>
  );
}

export type DocColumn = { label: ReactNode; numeric?: boolean; className?: string };

/** A ruled ledger table: figures right-aligned in tabular digits, and an optional bold total row. */
export function DocTable({
  columns,
  rows,
  total,
  caption,
}: {
  columns: DocColumn[];
  rows: { key: string; cells: ReactNode[] }[];
  total?: { label: ReactNode; cells: ReactNode[] };
  caption?: string;
}) {
  const align = (column: DocColumn | undefined) => `${column?.numeric ? "num text-right" : "text-left"} ${column?.className ?? ""}`;
  return (
    <table className="doc-table w-full border-collapse">
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead>
        <tr className="border-y border-ink">
          {columns.map((column, i) => (
            <th key={i} scope="col" className={`py-1 pr-3 align-bottom text-[11px] font-medium text-ink-2 last:pr-0 ${align(column)}`}>
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-b border-rule align-top">
            {row.cells.map((cell, i) => (
              <td key={i} className={`py-1.5 pr-3 last:pr-0 print:py-1 ${align(columns[i])}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {total && (
        <tfoot>
          <tr className="border-b-2 border-ink font-semibold">
            <th scope="row" colSpan={columns.length - total.cells.length} className="py-1.5 pr-3 text-left">
              {total.label}
            </th>
            {total.cells.map((cell, i) => (
              <td key={i} className={`py-1.5 pr-3 last:pr-0 ${align(columns[columns.length - total.cells.length + i])}`}>
                {cell}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

/** A quiet note: small type behind a left rule, for general information that is not a warning. */
export function DocNote({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <aside className="keep mt-3 border-l-2 border-rule-strong pl-3 text-[11.5px] leading-snug text-ink-2 print:text-[10.5px]">
      <p className="font-medium text-ink">{heading}</p>
      {children}
    </aside>
  );
}

/** The printed footer: the business name on the left, "page / pages" on the right. Screen-only pages ignore it. */
export function PageFooter({ name }: { name: string }) {
  // A CSS string: quotes and backslashes escaped, and nothing that could close the style element.
  const quoted = `"${name.replace(/[\\"]/g, "\\$&").replace(/[<>\n\r]/g, " ")}"`;
  const box = `font: 9px "IBM Plex Sans", sans-serif; color: #333;`;
  return (
    <style>{`@media print { @page { @bottom-left { content: ${quoted}; ${box} } @bottom-right { content: counter(page) " / " counter(pages); ${box} } } }`}</style>
  );
}
