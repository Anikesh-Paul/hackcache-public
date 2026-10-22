const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** 15 characters: state, PAN, entity, the literal Z, check character. */
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export type GstinCheck = { ok: true } | { ok: false; reason: "pattern" | "check-digit" };

/**
 * Check character for the first 14 characters of a GSTIN.
 * ISO 7064 Mod 36,36, factors 2 and 1 from the right.
 */
export function gstinCheckDigit(first14: string): string {
  if (!/^[0-9A-Z]{14}$/.test(first14)) throw new Error("GSTIN check digit needs 14 letters or digits");
  let factor = 2;
  let sum = 0;
  for (let i = first14.length - 1; i >= 0; i--) {
    const code = CHARSET.indexOf(first14[i] ?? "");
    if (code < 0) throw new Error("GSTIN check digit needs 14 letters or digits");
    const product = factor * code;
    factor = factor === 2 ? 1 : 2;
    const remainder = product % 36;
    sum += (product - remainder) / 36 + remainder;
  }
  const digit = CHARSET[(36 - (sum % 36)) % 36];
  if (digit === undefined) throw new Error("GSTIN check digit failed");
  return digit;
}

/** Pattern first, then the check character. Letters are matched in uppercase. */
export function checkGstin(gstin: string): GstinCheck {
  const value = gstin.trim().toUpperCase();
  if (!GSTIN_PATTERN.test(value)) return { ok: false, reason: "pattern" };
  const expected = gstinCheckDigit(value.slice(0, 14));
  if (expected !== value[14]) return { ok: false, reason: "check-digit" };
  return { ok: true };
}
