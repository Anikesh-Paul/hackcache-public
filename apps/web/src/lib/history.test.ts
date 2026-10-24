import { describe, expect, it } from "vitest";
import type { EventRow, PromiseRow } from "@tagada/appwrite";
import { COPY } from "../i18n/index.ts";
import { eventText, receivedByHand } from "./history.ts";

const event = (type: string, summary: string, payload: unknown = null) =>
  ({ $id: "e1", invoiceId: "i1", at: "2026-11-02T04:30:00Z", type, actor: "customer", summary, payload: payload === null ? null : JSON.stringify(payload) }) as unknown as EventRow;

const promise = {
  $id: "p1",
  instalments: JSON.stringify([
    { amountPaise: 6_000_000, date: "2026-11-06" },
    { amountPaise: 5_800_000, date: "2026-12-02" },
  ]),
} as unknown as PromiseRow;

describe("stored history in the Owner's language", () => {
  it("shows the stored sentence in English", () => {
    expect(eventText(COPY.en, event("paid_claim", "Said on the pay link that the bill is already paid"), [])).toBe(
      "Said on the pay link that the bill is already paid",
    );
  });

  it("words each event again from its type and data", () => {
    expect(eventText(COPY.hi, event("payment", "Payment confirmed", { amountPaise: 2_331_000 }), [])).toBe(
      "बैंक स्टेटमेंट से ₹23,310 के भुगतान की पुष्टि हुई",
    );
    expect(eventText(COPY.bn, event("reminder", "Friendly heads-up sent by email", { stage: 1 }), [])).toBe(
      "হালকা অনুস্মারক ইমেলে পাঠানো হয়েছে",
    );
    expect(eventText(COPY.hi, event("plan_accepted", "Chose a Plan", { promiseId: "p1" }), [promise])).toBe(
      "भुगतान लिंक पर किश्त योजना चुनी: ₹60,000, शुक्र 6 नवंबर तक, फिर ₹58,000, बुध 2 दिसंबर तक। अनुस्मारक सीढ़ी रुकी है।",
    );
    expect(eventText(COPY.bn, event("dispute", 'Raised a Dispute: "Two chairs broken". The Ladder is paused.'), [])).toContain(
      '"Two chairs broken"',
    );
  });

  it("words the Owner's own changes: a payment by hand, a cancellation, a correction", () => {
    const cash = event("payment", "Recorded ₹5,000 received in cash on 30 Oct.", { amountPaise: 500_000, mode: "cash", date: "2026-10-30" });
    expect(eventText(COPY.hi, cash, [])).toBe("आपने 30 अक्टूबर को नकद ₹5,000 मिलना दर्ज किया");
    expect(eventText(COPY.bn, cash, [])).toContain("নগদে ₹5,000");
    const cancelled = event("cancelled", 'Invoice cancelled: "Raised twice".', { reason: "Raised twice" });
    expect(eventText(COPY.hi, cancelled, [])).toContain('"Raised twice"');
    const edited = event("edited", "Invoice corrected", { fromTotalPaise: 1_180_000, totalPaise: 2_465_000, dueDate: "2026-12-15" });
    expect(eventText(COPY.bn, edited, [])).toContain("₹11,800 থেকে ₹24,650");
  });

  it("counts only payments recorded by hand as cash received; a Bank match is in the statement already", () => {
    const events = [
      event("payment", "Recorded", { amountPaise: 500_000, mode: "upi", date: "2026-10-30" }),
      event("payment", "Confirmed from the bank statement", { amountPaise: 900_000, tdsPaise: 0 }),
      event("reminder", "sent", { stage: 1 }),
    ];
    expect(receivedByHand(events)).toEqual([{ date: "2026-10-30", amountPaise: 500_000 }]);
  });

  it("reads the channel and the reason from the payload before the stored sentence", () => {
    // The payload wins over a sentence that says otherwise.
    expect(eventText(COPY.hi, event("reminder", "sent by email", { stage: 3, channel: "whatsapp_link" }), [])).toBe(
      eventText(COPY.hi, event("reminder", "sent on WhatsApp", { stage: 3 }), []),
    );
    expect(eventText(COPY.bn, event("reminder", "sent", { stage: 1, channel: "email" }), [])).toBe("হালকা অনুস্মারক ইমেলে পাঠানো হয়েছে");
    expect(eventText(COPY.bn, event("dispute", "Raised a Dispute.", { reason: "Two chairs broken" }), [])).toContain('"Two chairs broken"');
  });

  it("does not throw on a Promise whose stored instalments cannot be read", () => {
    const broken = { $id: "p1", instalments: "not json" } as unknown as PromiseRow;
    expect(() => eventText(COPY.hi, event("plan_accepted", "Chose a Plan", { promiseId: "p1" }), [broken])).not.toThrow();
  });

  it("keeps the stored sentence for a type it does not know", () => {
    expect(eventText(COPY.hi, event("something_new", "Something new happened"), [])).toBe("Something new happened");
  });
});
