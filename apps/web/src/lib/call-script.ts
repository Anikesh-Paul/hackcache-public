// "Be Gupta ji": what the judge can say on the call, worked out from the
// Invoice opened, so the lines fit whatever is owed.
import {
  addDays,
  differencePaise,
  formatDate,
  formatInr,
  hindiDate,
  hindiRupees,
  minimumSharePaise,
  nearestPaise,
  percentOfPaise,
  sumPaise,
} from "@tagada/money";
import type { PlanRule } from "@tagada/domain";

export type PersonaKey = "cooperative" | "short" | "dispute";
export type Persona = { key: PersonaKey; title: string; what: string; lines: { hi: string; en: string }[] };

type Facts = { owedPaise: number; today: string; rule: PlanRule };

export function personas({ owedPaise, today, rule }: Facts): Persona[] {
  const min = minimumSharePaise(owedPaise, rule.minFirstPct * 100);
  // About a third first; then the minimum rounded to ₹10,000, never below it.
  const low = nearestPaise(percentOfPaise(owedPaise, 3400), 100_000);
  const near = nearestPaise(min, 1_000_000);
  const high = near < min ? sumPaise([near, 1_000_000]) : near;
  const restBy = addDays(today, rule.restWithinDays);
  const say = (paise: number) => hindiRupees(paise);
  return [
    {
      key: "cooperative" as const,
      title: "Cooperative",
      what: "Pays the whole bill on one date.",
      lines: [
        {
          hi: `हाँ जी, शुक्रवार को पूरे ${say(owedPaise)} दे दूँगा।`,
          en: `Yes, I'll pay the full ${formatInr(owedPaise)} on Friday.`,
        },
      ],
    },
    {
      key: "short" as const,
      title: "Short on cash",
      what: "Offers too little; the agent counters with your rule.",
      lines: [
        {
          hi: `इस हफ़्ते मुश्किल है। शुक्रवार को ${say(low)} दे सकता हूँ, बाकी अगले महीने।`,
          en: `It's hard this week. I can pay ${formatInr(low)} on Friday, the rest next month.`,
        },
        // A bill so small that the round figure is all of it has no second offer.
        ...(differencePaise(owedPaise, high) > 0
          ? [
              {
                hi: `ठीक है, शुक्रवार को ${say(high)} दे दूँगा, बाकी ${hindiDate(restBy)} तक।`,
                en: `OK, I'll pay ${formatInr(high)} on Friday and the rest by ${formatDate(restBy)}.`,
              },
            ]
          : []),
      ],
    },
    {
      key: "dispute" as const,
      title: "Disputes the bill",
      what: "Says the bill is wrong; the Ladder pauses.",
      lines: [
        {
          hi: "बिल में गड़बड़ी है। दो कुर्सियाँ टूटी हुई आई थीं।",
          en: "The bill is wrong. Two chairs arrived broken.",
        },
      ],
    },
  ];
}

/** An amount the agent said, found by the exact Hindi words it was handed. */
export function amountSaid(message: string, known: ReadonlyMap<string, number>): number | null {
  let best: [string, number] | null = null;
  for (const [words, paise] of known) {
    if (message.includes(words) && (!best || words.length > best[0].length)) best = [words, paise];
  }
  return best?.[1] ?? null;
}

/** Elapsed call time as "0:09". */
export function clockOf(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
