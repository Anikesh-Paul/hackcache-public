import { describe, expect, it } from "vitest";
import type { EventRow, PromiseRow } from "@tagada/appwrite";
import { COPY } from "../i18n/index.ts";
import { eventText } from "./history.ts";

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

  it("keeps the stored sentence for a type it does not know", () => {
    expect(eventText(COPY.hi, event("something_new", "Something new happened"), [])).toBe("Something new happened");
  });
});
