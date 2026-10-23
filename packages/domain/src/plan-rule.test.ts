import { describe, expect, it } from "vitest";
import { DEFAULT_PLAN_RULE, planRule, type PlanVerdict } from "./index.ts";

const TODAY = "2026-11-02"; // Mon
const GUPTA = 11_800_000; // ₹1,18,000
const rule = DEFAULT_PLAN_RULE; // first ≥ 50% within 7 days, the rest within 30

const offer = (...instalments: { amountPaise: number; date: string | null }[]) =>
  planRule.evaluate(rule, { owedPaise: GUPTA, today: TODAY, instalments });

describe("planRule.evaluate", () => {
  it("accepts Gupta's ₹60,000 by Fri 6 Nov and ₹58,000 by Wed 2 Dec", () => {
    const v = offer({ amountPaise: 6_000_000, date: "2026-11-06" }, { amountPaise: 5_800_000, date: "2026-12-02" });
    expect(v).toMatchObject({
      verdict: "accept",
      minFirstPaise: 5_900_000,
      instalments: [
        { amountPaise: 6_000_000, date: "2026-11-06" },
        { amountPaise: 5_800_000, date: "2026-12-02" },
      ],
    });
  });

  it("accepts the first instalment on the last allowed day and the rest on the 30th day", () => {
    expect(offer({ amountPaise: 5_900_000, date: "2026-11-09" }, { amountPaise: 5_900_000, date: "2026-12-02" }).verdict).toBe(
      "accept",
    );
  });

  it("counters ₹40,000 with exactly the minimum, ₹59,000, on the same dates", () => {
    const v = offer({ amountPaise: 4_000_000, date: "2026-11-06" }, { amountPaise: 7_800_000, date: "2026-12-02" });
    expect(v).toMatchObject({
      verdict: "counter",
      minFirstPaise: 5_900_000,
      instalments: [
        { amountPaise: 5_900_000, date: "2026-11-06" },
        { amountPaise: 5_900_000, date: "2026-12-02" },
      ],
    });
    expect((v as Extract<PlanVerdict, { verdict: "counter" }>).reasons).toEqual([
      "The first instalment, ₹40,000, is below your 50% rule (₹59,000).",
    ]);
  });

  it("rounds the minimum up to the next whole rupee", () => {
    const v = planRule.evaluate(rule, {
      owedPaise: 100_001, // ₹1,000.01
      today: TODAY,
      instalments: [
        { amountPaise: 10_000, date: "2026-11-03" },
        { amountPaise: 90_001, date: "2026-11-20" },
      ],
    });
    expect(v.minFirstPaise).toBe(50_100); // ₹501, not ₹500.01
  });

  it("needs the Owner when a date is outside the rule", () => {
    const v = offer({ amountPaise: 6_000_000, date: "2026-11-12" }, { amountPaise: 5_800_000, date: "2026-12-20" });
    expect(v).toMatchObject({ verdict: "needs_owner", minFirstPaise: 5_900_000 });
    expect((v as Extract<PlanVerdict, { verdict: "needs_owner" }>).reasons).toEqual([
      "The first instalment is due on Thu 12 Nov, after your 7 days (Mon 9 Nov).",
      "The last instalment is due on Sun 20 Dec, after your 30 days (Wed 2 Dec).",
    ]);
  });

  it("needs the Owner, not a counter, when both the amount and a date are outside the rule", () => {
    expect(offer({ amountPaise: 4_000_000, date: "2026-11-20" }, { amountPaise: 7_800_000, date: "2026-12-02" }).verdict).toBe(
      "needs_owner",
    );
  });

  it("rejects a Plan without both dates, saying what to do", () => {
    const v = offer({ amountPaise: 6_000_000, date: "2026-11-06" }, { amountPaise: 5_800_000, date: null });
    expect(v.verdict).toBe("reject");
    expect((v as Extract<PlanVerdict, { verdict: "reject" }>).reason).toBe(
      "Not recorded: every instalment needs a date (YYYY-MM-DD). Ask for the missing date and check the Plan again.",
    );
  });

  it("rejects a single instalment: that is a Promise, not a Plan", () => {
    expect(offer({ amountPaise: GUPTA, date: "2026-11-06" }).verdict).toBe("reject");
  });

  it("rejects instalments that do not add up to what is owed", () => {
    const v = offer({ amountPaise: 6_000_000, date: "2026-11-06" }, { amountPaise: 5_000_000, date: "2026-12-02" });
    expect(v).toMatchObject({ verdict: "reject" });
    expect((v as Extract<PlanVerdict, { verdict: "reject" }>).reason).toContain("₹1,10,000");
  });

  it("rejects dates before the Demo date or out of order", () => {
    expect(offer({ amountPaise: 6_000_000, date: "2026-11-01" }, { amountPaise: 5_800_000, date: "2026-12-02" }).verdict).toBe(
      "reject",
    );
    expect(offer({ amountPaise: 6_000_000, date: "2026-11-20" }, { amountPaise: 5_800_000, date: "2026-11-10" }).verdict).toBe(
      "reject",
    );
  });

  it("rejects a non-date and a zero instalment", () => {
    expect(offer({ amountPaise: 6_000_000, date: "Friday" }, { amountPaise: 5_800_000, date: "2026-12-02" }).verdict).toBe(
      "reject",
    );
    expect(offer({ amountPaise: 0, date: "2026-11-06" }, { amountPaise: GUPTA, date: "2026-12-02" }).verdict).toBe(
      "reject",
    );
  });

  it("follows the Owner's own rule numbers", () => {
    const strict = { minFirstPct: 75, firstWithinDays: 3, restWithinDays: 14 };
    const v = planRule.evaluate(strict, {
      owedPaise: GUPTA,
      today: TODAY,
      instalments: [
        { amountPaise: 6_000_000, date: "2026-11-05" },
        { amountPaise: 5_800_000, date: "2026-11-16" },
      ],
    });
    expect(v).toMatchObject({ verdict: "counter", minFirstPaise: 8_850_000 });
  });
});

describe("planRule.choices", () => {
  it("offers Plans the rule accepts, each adding up to what is owed", () => {
    const choices = planRule.choices(rule, { owedPaise: GUPTA, today: TODAY });
    expect(choices.length).toBeGreaterThanOrEqual(2);
    for (const instalments of choices) {
      expect(planRule.evaluate(rule, { owedPaise: GUPTA, today: TODAY, instalments }).verdict).toBe("accept");
    }
    expect(choices[0]).toEqual([
      { amountPaise: 5_900_000, date: "2026-11-09" },
      { amountPaise: 5_900_000, date: "2026-12-02" },
    ]);
  });

  it("splits the rest into whole rupees, so a Customer never sees paise", () => {
    const owedPaise = 2_331_000; // ₹23,310: the rest after ₹11,655 is ₹11,655
    const [, three] = planRule.choices(rule, { owedPaise, today: TODAY });
    expect(three?.map((i) => i.amountPaise)).toEqual([1_165_500, 582_800, 582_700]);
  });

  it("offers nothing when too little is owed to split", () => {
    expect(planRule.choices(rule, { owedPaise: 100, today: TODAY })).toEqual([]);
  });
});

describe("planRule.parse", () => {
  it("reads the workspace's stored rule, falling back to the default", () => {
    expect(planRule.parse('{"minFirstPct":60,"firstWithinDays":5,"restWithinDays":20}')).toEqual({
      minFirstPct: 60,
      firstWithinDays: 5,
      restWithinDays: 20,
    });
    expect(planRule.parse(null)).toEqual(DEFAULT_PLAN_RULE);
    expect(planRule.parse("not json")).toEqual(DEFAULT_PLAN_RULE);
    expect(planRule.parse('{"minFirstPct":500}')).toEqual(DEFAULT_PLAN_RULE);
  });
});
