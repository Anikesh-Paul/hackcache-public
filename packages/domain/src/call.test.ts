import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAN_RULE,
  callCalendar,
  callConfirmation,
  callGuard,
  checkOutcome,
  munimFirstLine,
  proposePlan,
  spokenName,
  stripTags,
  whatsappLink,
} from "./index.ts";

const TODAY = "2026-11-02"; // Mon
const GUPTA = { rule: DEFAULT_PLAN_RULE, owedPaise: 11_800_000, today: TODAY };

describe("callGuard", () => {
  const gupta = {
    customerName: "Gupta Traders",
    consentCalls: true,
    consentAt: "2026-10-02T12:40:00.000+05:30",
    clock: "11:20",
    balancePaise: 11_800_000,
    disputed: false,
  };

  it("lets the Owner call a consenting Customer inside 10 AM to 6 PM", () => {
    expect(callGuard(gupta)).toEqual({ ok: true });
    expect(callGuard({ ...gupta, clock: "10:00" }).ok).toBe(true);
    expect(callGuard({ ...gupta, clock: "17:59" }).ok).toBe(true);
  });

  it("blocks a call outside calling hours by the Demo date clock, and says so", () => {
    for (const clock of ["09:59", "18:00", "21:30", "00:00"]) {
      expect(callGuard({ ...gupta, clock })).toEqual({
        ok: false,
        block: "outside_hours",
        message: `It is ${clock} by the Demo date clock. Calls are made only between 10 AM and 6 PM.`,
      });
    }
  });

  it("blocks a Customer who has not agreed to reminder calls", () => {
    expect(callGuard({ ...gupta, consentCalls: false, consentAt: null })).toEqual({
      ok: false,
      block: "no_consent",
      message: "Gupta Traders has not agreed to reminder calls. Send a reminder or the pay link instead.",
    });
    expect(callGuard({ ...gupta, consentAt: null }).ok).toBe(false);
  });

  it("does not call about a disputed or paid Invoice", () => {
    expect(callGuard({ ...gupta, disputed: true })).toMatchObject({ ok: false, block: "disputed" });
    expect(callGuard({ ...gupta, balancePaise: 0 })).toMatchObject({ ok: false, block: "nothing_owed" });
  });

  it("treats an unreadable clock as outside hours", () => {
    expect(callGuard({ ...gupta, clock: "late" })).toMatchObject({ ok: false, block: "outside_hours" });
  });
});

describe("callCalendar", () => {
  it("lists the next 15 days with their weekdays, today marked", () => {
    const days = callCalendar(TODAY).split(", ");
    expect(days).toHaveLength(15);
    expect(days[0]).toBe("Monday 2026-11-02 (today)");
    expect(days[4]).toBe("Friday 2026-11-06");
    expect(days[14]).toBe("Monday 2026-11-16");
  });
});

describe("munimFirstLine", () => {
  it("is the agent's first line, as ElevenLabs fills it in: Munim says it is an AI", () => {
    expect(munimFirstLine({ customerName: "Gupta Traders", businessName: "Tripura Bamboo Works", amountWords: "एक लाख अठारह हज़ार रुपये" })).toBe(
      "नमस्ते Gupta जी, मैं Tripura Bamboo Works की ओर से AI सहायक मुनीम बोल रही हूँ। आपके एक लाख अठारह हज़ार रुपये के बिल के बारे में बात करनी थी, क्या अभी दो मिनट बात हो सकती है?",
    );
  });
});

describe("spokenName", () => {
  it("is how the agent addresses the Customer, before जी", () => {
    expect(spokenName("Gupta Traders")).toBe("Gupta");
    expect(spokenName("M/s Das & Sons")).toBe("Das");
    expect(spokenName("Hotel Gomati View")).toBe("Gomati");
    expect(spokenName("  Paul Gift House ")).toBe("Paul");
  });
});

describe("proposePlan, the client tool", () => {
  it("rejects ₹40,000 and hands back the minimum in Hindi words", () => {
    const { reply, check } = proposePlan(GUPTA, {
      first_amount_rupees: 40000,
      first_date: "2026-11-06",
      rest_date: "2026-12-02",
    });
    expect(reply).toMatchObject({
      accepted: false,
      min_first_amount_rupees: 59000,
      offered_first_amount_words: "चालीस हज़ार रुपये",
      min_first_amount_words: "उनसठ हज़ार रुपये",
      plan_first_amount_words: "उनसठ हज़ार रुपये",
      plan_rest_amount_words: "उनसठ हज़ार रुपये",
      first_date_words: "शुक्रवार, छह नवंबर",
      rest_date_words: "बुधवार, दो दिसंबर",
    });
    expect(check).toEqual({
      offeredPaise: 4_000_000,
      accepted: false,
      note: "₹40,000 by Fri 6 Nov: below your 50% rule (₹59,000), so the agent will counter",
    });
  });

  it("accepts साठ हज़ार on Friday and the rest by Wed 2 Dec", () => {
    const { reply, check, said } = proposePlan(GUPTA, {
      first_amount_rupees: "60000",
      first_date: "2026-11-06",
      rest_date: "2026-12-02",
    });
    expect(reply).toMatchObject({
      accepted: true,
      plan_first_amount_words: "साठ हज़ार रुपये",
      plan_rest_amount_words: "अट्ठावन हज़ार रुपये",
    });
    expect(check).toEqual({
      offeredPaise: 6_000_000,
      accepted: true,
      note: "₹60,000 by Fri 6 Nov, the rest by Wed 2 Dec: inside your rule",
    });
    expect(said).toContainEqual({ words: "अट्ठावन हज़ार रुपये", paise: 5_800_000 });
  });

  it("asks for a missing date instead of judging the Plan", () => {
    const { reply } = proposePlan(GUPTA, { first_amount_rupees: 60000, first_date: "2026-11-06" });
    expect(reply.accepted).toBe(false);
    expect(reply.error).toMatch(/needs a date/);
  });

  it("calls the whole amount a Promise, not a Plan", () => {
    const { reply } = proposePlan(GUPTA, {
      first_amount_rupees: 118000,
      first_date: "2026-11-06",
      rest_date: "2026-12-02",
    });
    expect(reply.accepted).toBe(false);
    expect(reply.error).toMatch(/outcome "promise"/);
  });
});

describe("checkOutcome, what record_outcome may record", () => {
  it("records the agreed Plan: ₹60,000 Fri 6 Nov and ₹58,000 by Wed 2 Dec", () => {
    expect(
      checkOutcome(GUPTA, { outcome: "plan", amount_rupees: 60000, date: "2026-11-06", rest_date: "2026-12-02" }),
    ).toEqual({
      ok: true,
      outcome: {
        kind: "plan",
        instalments: [
          { amountPaise: 6_000_000, date: "2026-11-06" },
          { amountPaise: 5_800_000, date: "2026-12-02" },
        ],
        notes: null,
      },
    });
  });

  it("rejects a plan below the minimum with a sentence the agent can act on", () => {
    const r = checkOutcome(GUPTA, { outcome: "plan", amount_rupees: 40000, date: "2026-11-06", rest_date: "2026-12-02" });
    expect(r).toEqual({
      ok: false,
      say:
        'error: not recorded. A "plan" needs amount_rupees of at least 59000. If the customer agreed to the minimum, ' +
        'call record_outcome again with amount_rupees 59000; otherwise use outcome "plan_needs_owner" with their own offer.',
    });
  });

  it("rejects a plan missing a date", () => {
    for (const args of [
      { outcome: "plan", amount_rupees: 60000, date: "2026-11-06" },
      { outcome: "plan_needs_owner", amount_rupees: 40000, rest_date: "2026-12-02" },
    ]) {
      expect(checkOutcome(GUPTA, args)).toEqual({
        ok: false,
        say: "error: not recorded. A plan needs both date and rest_date (YYYY-MM-DD). Call record_outcome again with both.",
      });
    }
  });

  it("rejects a plan with dates outside the rule, pointing at plan_needs_owner", () => {
    const r = checkOutcome(GUPTA, { outcome: "plan", amount_rupees: 60000, date: "2026-11-20", rest_date: "2026-12-02" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.say).toMatch(/^error: not recorded\..*plan_needs_owner/);
  });

  it("keeps an offer outside the rule for the Owner, with the reasons", () => {
    const r = checkOutcome(GUPTA, {
      outcome: "plan_needs_owner",
      amount_rupees: 40000,
      date: "2026-11-06",
      rest_date: "2026-12-02",
      notes: "Short on cash this week",
    });
    expect(r).toEqual({
      ok: true,
      outcome: {
        kind: "plan_needs_owner",
        instalments: [
          { amountPaise: 4_000_000, date: "2026-11-06" },
          { amountPaise: 7_800_000, date: "2026-12-02" },
        ],
        reasons: ["The first instalment, ₹40,000, is below your 50% rule (₹59,000)."],
        notes: "Short on cash this week",
      },
    });
  });

  it("records an offer the rule accepts as a plan, whatever the agent called it", () => {
    const r = checkOutcome(GUPTA, {
      outcome: "plan_needs_owner",
      amount_rupees: 60000,
      date: "2026-11-06",
      rest_date: "2026-12-02",
    });
    expect(r.ok && r.outcome.kind).toBe("plan");
  });

  it("records a Promise of the whole amount by one date", () => {
    expect(checkOutcome(GUPTA, { outcome: "promise", date: "2026-11-06" })).toEqual({
      ok: true,
      outcome: { kind: "promise", instalments: [{ amountPaise: 11_800_000, date: "2026-11-06" }], notes: null },
    });
    expect(checkOutcome(GUPTA, { outcome: "promise" }).ok).toBe(false);
    expect(checkOutcome(GUPTA, { outcome: "promise", date: "2026-10-30" }).ok).toBe(false);
    expect(checkOutcome(GUPTA, { outcome: "promise", amount_rupees: 200000, date: "2026-11-06" }).ok).toBe(false);
  });

  it("records already paid, a Dispute, a callback and a refusal", () => {
    expect(checkOutcome(GUPTA, { outcome: "already_paid", reference: "612345678901", date: "2026-10-30" })).toEqual({
      ok: true,
      outcome: { kind: "already_paid", reference: "612345678901", date: "2026-10-30", notes: null },
    });
    expect(checkOutcome(GUPTA, { outcome: "dispute", notes: "  Two chairs arrived broken " })).toEqual({
      ok: true,
      outcome: { kind: "dispute", notes: "Two chairs arrived broken" },
    });
    expect(checkOutcome(GUPTA, { outcome: "callback", date: "2026-11-04" })).toMatchObject({
      ok: true,
      outcome: { kind: "callback", date: "2026-11-04" },
    });
    expect(checkOutcome(GUPTA, { outcome: "refused" })).toMatchObject({ ok: true, outcome: { kind: "refused" } });
  });

  it("names the outcomes it knows when given another", () => {
    const r = checkOutcome(GUPTA, { outcome: "maybe" });
    expect(!r.ok && r.say).toMatch(/^error: not recorded\. outcome must be one of promise, plan, plan_needs_owner/);
    expect(checkOutcome(GUPTA, null).ok).toBe(false);
  });
});

describe("stripTags", () => {
  it("drops voice-direction tags from the transcript", () => {
    expect(stripTags("[polite] नमस्ते [laughs]जी")).toBe("नमस्ते जी");
    expect(stripTags("[warmly]")).toBe("");
    expect(stripTags("₹60,000 [sic] ठीक")).toBe("₹60,000 ठीक");
  });
});

describe("the Hindi WhatsApp confirmation", () => {
  const text = callConfirmation({
    customerName: "Gupta Traders",
    businessName: "Tripura Bamboo Works",
    instalments: [
      { amountPaise: 6_000_000, date: "2026-11-06" },
      { amountPaise: 5_800_000, date: "2026-12-02" },
    ],
    payUrl: "https://tagada.example/pay/abc",
  });

  it("states the Plan with a full https pay link", () => {
    expect(text).toBe(
      "नमस्ते Gupta जी, Tripura Bamboo Works का संदेश। आज फ़ोन पर तय हुई किश्तें: " +
        "₹60,000 शुक्रवार, छह नवंबर तक; ₹58,000 बुधवार, दो दिसंबर तक। " +
        "यहाँ से भरें: https://tagada.example/pay/abc धन्यवाद।",
    );
  });

  it("opens WhatsApp to the Customer's number", () => {
    expect(whatsappLink("+91 98300 41234", "नमस्ते")).toBe(
      `https://wa.me/919830041234?text=${encodeURIComponent("नमस्ते")}`,
    );
    expect(whatsappLink("9830041234", "x")).toBe("https://wa.me/919830041234?text=x");
    expect(whatsappLink(null, "x")).toBe("https://wa.me/?text=x");
  });
});
