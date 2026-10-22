import { requireInt } from "./integer.ts";

const ONES = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
] as const;

const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"] as const;

const SCALES: readonly (readonly [bigint, string])[] = [
  [1_00_00_000n, "Crore"],
  [1_00_000n, "Lakh"],
  [1_000n, "Thousand"],
];

function wordAt<T extends readonly string[]>(list: T, index: number, name: string): string {
  const word = list[index];
  if (word === undefined) throw new Error(`no ${name} word for ${index}`);
  return word;
}

function under100(n: bigint): string {
  if (n < 20n) return wordAt(ONES, Number(n), "ones");
  const ten = wordAt(TENS, Number(n / 10n), "tens");
  const one = n % 10n;
  return one === 0n ? ten : `${ten}-${wordAt(ONES, Number(one), "ones")}`;
}

function under1000(n: bigint): string {
  if (n < 100n) return under100(n);
  const head = `${wordAt(ONES, Number(n / 100n), "ones")} Hundred`;
  const rest = n % 100n;
  return rest === 0n ? head : `${head} ${under100(rest)}`;
}

function indianWords(n: bigint): string {
  if (n === 0n) return "Zero";
  const parts: string[] = [];
  let left = n;
  for (const [size, name] of SCALES) {
    if (left >= size) {
      parts.push(`${under1000(left / size)} ${name}`);
      left %= size;
    }
  }
  if (left > 0n) parts.push(under1000(left));
  return parts.join(" ");
}

function rupeeWords(rupees: bigint): string {
  return `${indianWords(rupees)} ${rupees === 1n ? "Rupee" : "Rupees"}`;
}

function paisaWords(paise: bigint): string {
  return `${indianWords(paise)} ${paise === 1n ? "Paisa" : "Paise"}`;
}

/** English amount in words for an integer number of paise. Whole rupees drop the paise. */
export function amountInWords(paise: number): string {
  const value = requireInt(paise, "paise");
  if (value < 0n) throw new Error("paise must be ≥ 0");
  const rupees = value / 100n;
  const rem = value % 100n;
  if (rupees === 0n && rem === 0n) return "Zero Rupees Only";
  if (rupees === 0n) return `${paisaWords(rem)} Only`;
  if (rem === 0n) return `${rupeeWords(rupees)} Only`;
  return `${rupeeWords(rupees)} and ${paisaWords(rem)} Only`;
}
