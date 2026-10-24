// Rates live here so a later notification changes one table, not the arithmetic.
// GST rates are whole percent. §16 rates are basis points: 16.5% is 1650, 17.25% is 1725.

/** GST rates the invoice form is allowed to charge, in whole percent. */
export const GST_RATES = [0, 5, 18] as const;

export type GstRate = (typeof GST_RATES)[number];

/**
 * Units a line can be counted in, as they print on the invoice. "nos" (numbers)
 * is the default and is stored as null.
 */
export const LINE_UNITS = ["nos", "pcs", "set", "dozen", "box", "bundle", "kg", "g", "m", "ft", "sq ft", "l"] as const;

export type LineUnit = (typeof LINE_UNITS)[number];

export function isLineUnit(unit: unknown): unit is LineUnit {
  return typeof unit === "string" && (LINE_UNITS as readonly string[]).includes(unit);
}

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

/**
 * The day each Ladder stage falls due, in whole IST days from the Invoice's
 * due date, stage 1 first: a heads-up 3 days before, the due-date reminder on
 * the day, then 7, 14, 21 and 30 days late.
 */
export const LADDER_STAGE_DAYS = [-3, 0, 7, 14, 21, 30] as const;

/**
 * What a minute of Call with AI uses on the ElevenLabs agent, in credits
 * (#13: read off the ElevenLabs usage page for the test calls).
 */
export const CALL_CREDITS_PER_MINUTE = 450;

/**
 * The price of 1,000 credits in paise: the Creator plan's $22 for 100,000
 * credits at ₹88 to the dollar is ₹19.36.
 */
export const CALL_CREDIT_PAISE_PER_THOUSAND = 1936;
