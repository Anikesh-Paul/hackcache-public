// Rates live here so a later notification changes one table, not the arithmetic.
// GST rates are whole percent. §16 rates are basis points: 16.5% is 1650, 17.25% is 1725.

/** GST rates the invoice form is allowed to charge, in whole percent. */
export const GST_RATES = [0, 5, 18] as const;

export type GstRate = (typeof GST_RATES)[number];

export function isGstRate(rate: number): rate is GstRate {
  return (GST_RATES as readonly number[]).includes(rate);
}

/**
 * Aggregate turnover of ₹5,00,00,000. e-invoicing applies strictly above this
 * (Notification 10/2023-CT), not at it.
 */
export const E_INVOICE_TURNOVER_PAISE = 50_000_000 * 100;

export const E_INVOICE_NOTE =
  "you'd need an IRN from the IRP for this invoice; not generated in this prototype";

/** Rule 5(1)(f). The Bill of Supply is headed with this sentence, verbatim. */
export const COMPOSITION_HEADING =
  "composition taxable person, not eligible to collect tax on supplies";

/** First day of the 17.25% §16 rate. Through the day before, the rate is 16.5%. */
export const SECTION16_RATE_CHANGE = "2026-10-07";

/** 16.5% — three times the 5.50% Bank Rate, through 6 Oct 2026. */
export const SECTION16_RATE_BEFORE_BPS = 1650;

/** 17.25% — three times the 5.75% Bank Rate notified on 7 Oct 2026. */
export const SECTION16_RATE_FROM_BPS = 1725;
