// Paise arithmetic. Every quotient rounds half away from zero (half up for
// the positive amounts an invoice or an interest rest produces).

/** A safe integer, or throw. Money never travels as a float. */
export function requireInt(value: number, name: string): bigint {
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be an integer`);
  return BigInt(value);
}

export function toInt(value: bigint, name: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(`${name} is too large`);
  }
  return Number(value);
}

/** `numerator / denominator`, rounded half away from zero. Denominator > 0. */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("denominator must be positive");
  const neg = numerator < 0n;
  const n = neg ? -numerator : numerator;
  const q = n / denominator;
  const rem = n % denominator;
  const mag = rem * 2n >= denominator ? q + 1n : q;
  return neg ? -mag : mag;
}
