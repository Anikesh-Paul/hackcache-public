import { UpiQr } from "./screens/TaxInvoice.tsx";

/** This visitor's own pay link for Gupta ji, as a URL on this site. */
export function payLinkUrl(token: string): string {
  return `${window.location.origin}/pay/${encodeURIComponent(token)}`;
}

/** A QR code a judge scans to open the pay link on a phone, as the Customer would. */
export function PayLinkQr({ token, label }: { token: string; label: string }) {
  const url = payLinkUrl(token);
  return (
    <div className="mt-2 flex items-center gap-3">
      <UpiQr uri={url} label={`QR code: ${label}`} className="size-24" />
      <p className="text-[13px] text-ink-2">{label}: scan it with the camera.</p>
    </div>
  );
}
