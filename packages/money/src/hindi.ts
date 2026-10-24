import { parseCivilDate, weekday } from "./date.ts";
import { divRound, requireInt } from "./integer.ts";

// Ported from prototype/call-test.html. The agent copies these words; it must
// not turn digits into Hindi itself.

const HI = (
  "शून्य एक दो तीन चार पाँच छह सात आठ नौ दस ग्यारह बारह तेरह चौदह पंद्रह सोलह सत्रह अठारह उन्नीस " +
  "बीस इक्कीस बाईस तेईस चौबीस पच्चीस छब्बीस सत्ताईस अट्ठाईस उनतीस तीस इकतीस बत्तीस तैंतीस चौंतीस पैंतीस छत्तीस सैंतीस अड़तीस उनतालीस " +
  "चालीस इकतालीस बयालीस तैंतालीस चवालीस पैंतालीस छियालीस सैंतालीस अड़तालीस उनचास पचास इक्यावन बावन तिरपन चौवन पचपन छप्पन सत्तावन अट्ठावन उनसठ " +
  "साठ इकसठ बासठ तिरसठ चौंसठ पैंसठ छियासठ सड़सठ अड़सठ उनहत्तर सत्तर इकहत्तर बहत्तर तिहत्तर चौहत्तर पचहत्तर छिहत्तर सतहत्तर अठहत्तर उन्यासी " +
  "अस्सी इक्यासी बयासी तिरासी चौरासी पचासी छियासी सत्तासी अट्ठासी नवासी नब्बे इक्यानवे बानवे तिरानवे चौरानवे पचानवे छियानवे सत्तानवे अट्ठानवे निन्यानवे"
).split(" ");

const HI_DAYS = "रविवार सोमवार मंगलवार बुधवार गुरुवार शुक्रवार शनिवार".split(" ");

const HI_MONTHS = "जनवरी फ़रवरी मार्च अप्रैल मई जून जुलाई अगस्त सितंबर अक्टूबर नवंबर दिसंबर".split(" ");

const SCALES: readonly (readonly [bigint, string])[] = [
  [1_00_00_000n, "करोड़"],
  [1_00_000n, "लाख"],
  [1_000n, "हज़ार"],
  [100n, "सौ"],
];

function hindiWord(n: bigint): string {
  const word = HI[Number(n)];
  if (word === undefined) throw new Error(`no Hindi word for ${n}`);
  return word;
}

function hindiBig(n: bigint): string {
  if (n < 100n) return hindiWord(n);
  const parts: string[] = [];
  let left = n;
  for (const [size, word] of SCALES) {
    if (left >= size) {
      parts.push(hindiBig(left / size), word);
      left %= size;
    }
  }
  if (left > 0n) parts.push(hindiWord(left));
  return parts.join(" ");
}

/** Whole rupees in Hindi words, without the "रुपये" suffix. 59000 → "उनसठ हज़ार". */
export function hindiNumber(rupees: number): string {
  const value = requireInt(rupees, "rupees");
  if (value < 0n) throw new Error("rupees must be ≥ 0");
  return hindiBig(value);
}

/**
 * An amount in paise as the call agent says it: whole rupees (half up, as the
 * prototype's Math.round did) plus " रुपये". 5900000 → "उनसठ हज़ार रुपये".
 */
export function hindiRupees(paise: number): string {
  const value = requireInt(paise, "paise");
  if (value < 0n) throw new Error("paise must be ≥ 0");
  return `${hindiBig(divRound(value, 100n))} रुपये`;
}

/**
 * Weekday and date in Hindi, for an ISO date. An unusable string is returned
 * unchanged, as the call prototype did.
 */
/** "6 नवंबर": digits, for lists of dates where words would be heavy. */
export function hindiShortDate(iso: string): string {
  const date = parseCivilDate(iso);
  const monthName = date ? HI_MONTHS[date.month - 1] : undefined;
  if (!date || monthName === undefined) return iso;
  return `${date.day} ${monthName}`;
}

export function hindiDate(iso: string): string {
  const date = parseCivilDate(iso);
  const day = weekday(iso);
  if (!date || day === null) return iso;
  const dayName = HI_DAYS[day];
  const monthName = HI_MONTHS[date.month - 1];
  if (dayName === undefined || monthName === undefined) return iso;
  return `${dayName}, ${hindiWord(BigInt(date.day))} ${monthName}`;
}
