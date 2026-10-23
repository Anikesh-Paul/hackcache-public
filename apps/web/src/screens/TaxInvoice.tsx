import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { CustomerRow, InvoiceLineRow, WorkspaceRow } from "@tagada/appwrite";
import { formatDate, formatInr, formatRateBps, stateName, upiPayUri, type InvoiceTotals } from "@tagada/money";
import { Badge } from "../ui.tsx";

export type TaxInvoiceProps = {
  workspace: WorkspaceRow;
  customer: CustomerRow;
  lines: InvoiceLineRow[];
  priced: InvoiceTotals;
  /** Null on a preview that has not been saved, so has no number yet. */
  number: string | null;
  issueDate: string;
  dueDate: string;
};

/** The A4 document (Rule 46 fields), shared by the print page and the duplicate preview. */
export function TaxInvoice({ workspace, customer, lines, priced, number, issueDate, dueDate }: TaxInvoiceProps) {
  const intra = priced.intraState;
  const chargesGst = priced.docType === "tax_invoice";
  const showGstin = priced.docType !== "invoice";
  const place = `${stateName(customer.stateCode ?? "")} (${customer.stateCode})`;
  const upi =
    workspace.upiVpa && priced.totalPaise > 0
      ? upiPayUri({
          vpa: workspace.upiVpa,
          payeeName: workspace.businessName,
          amountPaise: priced.totalPaise,
          note: number ?? "Invoice",
        })
      : null;

  return (
    <article className="mx-auto w-full max-w-[min(100%,210mm)] bg-paper p-5 text-[13px] text-ink shadow-[var(--sheet-shadow)] sm:p-[12mm] print:max-w-none print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-ink pb-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold">{workspace.businessName}</p>
          <p className="max-w-[48ch]">{workspace.address}</p>
          {showGstin && (
            <p>
              GSTIN <span className="mono">{workspace.gstin}</span>
            </p>
          )}
          <p>
            State {stateName(workspace.stateCode ?? "")}, code {workspace.stateCode}
          </p>
        </div>
        <div className="text-right">
          <h1 className="text-2xl tracking-normal">{priced.title}</h1>
          {priced.compositionHeading && <p className="max-w-[36ch] text-xs">{priced.compositionHeading}</p>}
          <p className="text-xs text-ink-2">Original for recipient</p>
        </div>
      </header>

      <section className="grid gap-4 border-b border-rule-strong py-3 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="text-xs text-ink-2">Billed to</p>
          <p className="font-semibold">{customer.name}</p>
          <p>{customer.address}</p>
          {showGstin && customer.gstin && (
            <p>
              GSTIN <span className="mono">{customer.gstin}</span>
            </p>
          )}
          <p>
            State {stateName(customer.stateCode ?? "")}, code {customer.stateCode}
          </p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] content-start gap-x-3 sm:justify-self-end">
          <dt className="text-ink-2">Invoice no.</dt>
          <dd className="mono">{number ?? "Given on save"}</dd>
          <dt className="text-ink-2">Date</dt>
          <dd>{formatDate(issueDate, { weekday: false, year: true })}</dd>
          <dt className="text-ink-2">Due</dt>
          <dd>{formatDate(dueDate, { weekday: false, year: true })}</dd>
          <dt className="text-ink-2">Place of supply</dt>
          <dd>{place}</dd>
          {chargesGst && (
            <>
              <dt className="text-ink-2">Reverse charge</dt>
              <dd>No</dd>
            </>
          )}
        </dl>
      </section>

      <div className="overflow-x-auto print:overflow-visible">
        <table className="mt-3 w-full min-w-[560px] border-collapse text-[12px] print:min-w-0">
          <thead>
            <tr className="border-b border-ink text-left align-bottom">
              <th className="py-1 pr-2 font-medium">#</th>
              <th className="py-1 pr-2 font-medium">Description</th>
              <th className="py-1 pr-2 font-medium">HSN/SAC</th>
              <th className="py-1 pr-2 text-right font-medium">Qty</th>
              <th className="py-1 pr-2 text-right font-medium">Rate</th>
              <th className="py-1 pr-2 text-right font-medium">Discount</th>
              <th className="py-1 pr-2 text-right font-medium">{chargesGst ? "Taxable value" : "Amount"}</th>
              {chargesGst &&
                (intra ? (
                  <>
                    <th className="py-1 pr-2 text-right font-medium">CGST</th>
                    <th className="py-1 text-right font-medium">SGST</th>
                  </>
                ) : (
                  <th className="py-1 text-right font-medium">IGST</th>
                ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, n) => {
              const p = priced.lines[n];
              return (
                <tr key={line.$id} className="border-b border-rule align-top">
                  <td className="py-1.5 pr-2">{n + 1}</td>
                  <td className="py-1.5 pr-2">{line.description}</td>
                  <td className="mono py-1.5 pr-2">{line.hsn ?? ""}</td>
                  <td className="py-1.5 pr-2 text-right">{line.qtyMilli / 1000} nos</td>
                  <td className="py-1.5 pr-2 text-right">{formatInr(line.ratePaise)}</td>
                  <td className="py-1.5 pr-2 text-right">
                    {line.discountBp > 0 ? `${line.discountBp / 100}%, ${formatInr(p?.discountPaise ?? 0)}` : "–"}
                  </td>
                  <td className="py-1.5 pr-2 text-right">{formatInr(p?.taxablePaise ?? 0)}</td>
                  {chargesGst &&
                    (intra ? (
                      <>
                        <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                          {formatRateBps(line.gstRateBp / 2)}, {formatInr(p?.cgstPaise ?? 0)}
                        </td>
                        <td className="py-1.5 text-right whitespace-nowrap">
                          {formatRateBps(line.gstRateBp / 2)}, {formatInr(p?.sgstPaise ?? 0)}
                        </td>
                      </>
                    ) : (
                      <td className="py-1.5 text-right whitespace-nowrap">
                        {formatRateBps(line.gstRateBp)}, {formatInr(p?.igstPaise ?? 0)}
                      </td>
                    ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="mt-3 flex flex-wrap items-start justify-between gap-6 break-inside-avoid">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink-2">Amount in words</p>
          <p className="font-medium">{priced.amountInWords}</p>
          {priced.eInvoiceNote && <p className="mt-2 text-xs">e-invoicing: {priced.eInvoiceNote}.</p>}
          {upi && (
            <div className="mt-4 flex items-center gap-3">
              <UpiQr uri={upi} label={`UPI QR code to pay ${formatInr(priced.totalPaise)}`} />
              <div className="text-xs">
                <p className="font-medium">Scan to pay {formatInr(priced.totalPaise)} by UPI</p>
                <p className="mono">{workspace.upiVpa}</p>
                <p className="mt-1 no-print">
                  <Badge kind="sim">Simulated UPI ID: no one is paid</Badge>
                </p>
              </div>
            </div>
          )}
        </div>
        <table className="w-full max-w-[300px] text-[13px]">
          <tbody>
            <Row label={chargesGst ? "Taxable value" : "Amount"} paise={priced.taxablePaise} />
            {chargesGst &&
              (intra ? (
                <>
                  <Row label="CGST" paise={priced.cgstPaise} />
                  <Row label="SGST" paise={priced.sgstPaise} />
                </>
              ) : (
                <Row label="IGST" paise={priced.igstPaise} />
              ))}
            <tr>
              <td className="py-0.5">Round-off</td>
              <td className="py-0.5 text-right">{formatInr(priced.roundOffPaise, { signed: true })}</td>
            </tr>
            <tr className="text-base font-semibold">
              <td className="border-t border-ink pt-1">Total</td>
              <td className="border-t border-ink pt-1 text-right">
                <span className="dbl">{formatInr(priced.totalPaise)}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <footer className="mt-10 flex justify-end break-inside-avoid">
        <div className="text-center">
          <p>For {workspace.businessName}</p>
          <div className="mt-10 w-56 border-t border-ink pt-1 text-xs">Authorised signatory</div>
        </div>
      </footer>
    </article>
  );
}

function Row({ label, paise }: { label: string; paise: number }) {
  return (
    <tr>
      <td className="py-0.5">{label}</td>
      <td className="py-0.5 text-right">{formatInr(paise)}</td>
    </tr>
  );
}

export function UpiQr({ uri, label, className = "size-28" }: { uri: string; label: string; className?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then((s) => live && setSvg(s));
    return () => {
      live = false;
    };
  }, [uri]);
  return (
    <div
      role="img"
      aria-label={label}
      className={`${className} flex-none bg-white p-1 [&>svg]:size-full`}
      // The SVG is generated locally from the UPI link, never from user HTML.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
