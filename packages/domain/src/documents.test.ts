import { describe, expect, it } from "vitest";
import { amountInWords, hindiRupees } from "@tagada/money";
import {
  LETTER_TITLE,
  caseText,
  demandLetter,
  letterText,
  odrCaseFile,
  transcriptExcerpt,
  type DocumentCall,
  type DocumentCustomer,
  type DocumentInvoice,
  type DocumentReminder,
  type DocumentSeller,
} from "./index.ts";

const TODAY = "2026-11-02";

const seller: DocumentSeller = {
  businessName: "Tripura Bamboo Works",
  address: "Plot 14, Agartala",
  gstin: "16AAKFT3920R1Z1",
  upiVpa: "tripurabamboo@demo",
  ownerEmail: "accounts@tripurabamboo.example",
  udyamType: "micro",
  isTrader: false,
};

const guptaCustomer: DocumentCustomer = {
  name: "Gupta Traders",
  address: "12 Strand Road, Kolkata",
  place: "Kolkata",
};

const guptaInvoice: DocumentInvoice = {
  $id: "i18",
  number: "TBW/26-27/0018",
  issueDate: "2026-08-26",
  totalPaise: 11_800_000,
  paidPaise: 0,
  status: "sent",
  dueDate: "2026-09-25",
  ladderStage: 3,
  pausedUntil: null,
  pauseReason: null,
};

const notDue: DocumentInvoice = {
  ...guptaInvoice,
  $id: "i30",
  number: "TBW/26-27/0030",
  issueDate: "2026-10-20",
  dueDate: "2026-11-19",
  totalPaise: 504_000,
};

const reminders: DocumentReminder[] = [
  { invoiceId: "i18", sentDate: "2026-09-22", stage: 1, channel: "email", status: "sent" },
  { invoiceId: "i18", sentDate: "2026-09-25", stage: 2, channel: "email", status: "sent" },
  { invoiceId: "i18", sentDate: "2026-10-02", stage: 3, channel: "whatsapp_link", status: "sent" },
];

const call: DocumentCall = {
  invoiceId: "i18",
  startedAt: "2026-10-20T11:40:00.000+05:30",
  transcript: JSON.stringify({
    turns: [
      { role: "agent", message: "[polite] Namaste. I am an assistant from Tripura Bamboo Works.", t: 3 },
      { role: "user", message: "I will look at it and call you back.", t: 18 },
    ],
  }),
};

const letter = demandLetter({
  seller,
  customer: guptaCustomer,
  invoices: [guptaInvoice],
  invoiceId: "i18",
  today: TODAY,
  payUrl: "https://tagada.example/pay/abc",
});

describe("Payment Demand Letter", () => {
  it("uses that title, names the Invoice and the amount, and sets a payment date", () => {
    expect(letter.title).toBe(LETTER_TITLE);
    expect(letter.title).toBe("Payment Demand Letter");
    const text = letterText(letter);
    expect(text).toContain("TBW/26-27/0018");
    expect(text).toContain("₹1,18,000");
    expect(letter.deadlineLine).toBe("Please pay ₹1,18,000 by Mon 9 Nov 2026.");
    expect(text).toContain("UPI: tripurabamboo@demo");
    expect(text).toContain("Bank transfer");
    expect(text).toContain("Pay by bank transfer to this account.");
    expect(text).toContain("DEMO0TAGADA");
    expect(text).toContain("Pay link: https://tagada.example/pay/abc");
  });

  it("leaves out an Invoice not yet due, from the lines, the amount and the interest", () => {
    const both = demandLetter({
      seller,
      customer: guptaCustomer,
      invoices: [guptaInvoice, notDue],
      invoiceId: "i18",
      today: TODAY,
      payUrl: null,
    });
    expect(both.invoices.map((line) => line.number)).toEqual(["TBW/26-27/0018"]);
    expect(both.outstanding).toBe("₹1,18,000");
    expect(letterText(both)).not.toContain("TBW/26-27/0030");
    expect(both.msmed?.totalLine).toBe("Interest so far ₹2,057.65, on ₹1,18,000 owed past the MSMED due date.");
    expect(both.nothingDue).toBeNull();
    expect(both.planBanner).toBeNull();
  });

  it("under an agreed Plan, demands only the instalments whose date has passed, and warns on screen", () => {
    const planned = demandLetter({
      seller,
      customer: guptaCustomer,
      invoices: [guptaInvoice],
      promises: [{ invoiceId: "i18", status: "approved", instalments: [{ amountPaise: 6_000_000, date: "2026-10-30" }, { amountPaise: 5_800_000, date: "2026-12-02" }] }],
      invoiceId: "i18",
      today: TODAY,
      payUrl: null,
    });
    expect(planned.outstanding).toBe("₹60,000");
    expect(planned.deadlineLine).toBe("Please pay ₹60,000 by Mon 9 Nov 2026.");
    expect(planned.invoices[0]).toMatchObject({ outstanding: "₹60,000", note: "Instalments past their date under the agreed Plan" });
    expect(planned.planBanner).toBe("A Plan is agreed with Gupta Traders. This letter goes against it.");
    expect(planned.nothingDue).toBeNull();
  });

  it("says when nothing is past due, and demands nothing", () => {
    for (const input of [
      { invoices: [notDue], promises: [] },
      { invoices: [guptaInvoice], promises: [{ invoiceId: "i18", status: "approved" as const, instalments: [{ amountPaise: 6_000_000, date: "2026-11-06" }, { amountPaise: 5_800_000, date: "2026-12-02" }] }] },
    ]) {
      const none = demandLetter({ seller, customer: guptaCustomer, ...input, invoiceId: input.invoices[0]!.$id, today: TODAY, payUrl: null });
      expect(none.nothingDue).toBe("Nothing is past due for Gupta Traders.");
      expect(none.invoices).toEqual([]);
      expect(none.upiUri).toBeNull();
      expect(none.msmed).toBeNull();
    }
  });

  it("demands the whole amount once the Plan is broken, with no banner", () => {
    const broken = demandLetter({
      seller,
      customer: guptaCustomer,
      invoices: [guptaInvoice],
      promises: [{ invoiceId: "i18", status: "broken", instalments: [{ amountPaise: 6_000_000, date: "2026-10-30" }, { amountPaise: 5_800_000, date: "2026-12-02" }] }],
      invoiceId: "i18",
      today: TODAY,
      payUrl: null,
    });
    expect(broken.outstanding).toBe("₹1,18,000");
    expect(broken.planBanner).toBeNull();
  });

  it("keeps legal notice inside the disclaimer, and never says 90 days", () => {
    const text = letterText(letter);
    expect(text.match(/legal notice/gi)).toEqual(["legal notice"]);
    expect(text).toContain("This is not a GST or legal notice.");
    expect(text).not.toMatch(/90 days/i);
    expect(text).not.toMatch(/\bdebtor\b/i);
    expect(text).not.toMatch(/\bfake\b/i);
  });

  it("puts MSMED interest in the general-information box for a micro non-trader", () => {
    expect(letter.msmed?.label).toBe("general information, not legal advice");
    expect(letter.msmed?.explanation.startsWith("MSMED is")).toBe(true);
    expect(letter.msmed?.totalLine).toContain("₹2,057.65");
    expect(letter.msmed?.aside).toBe("This interest is not added to the amount demanded above.");
    expect(letterText(letter)).toContain("₹2,057.65");
  });

  it("hides the MSMED box for a trader, a medium enterprise and a seller without Udyam", () => {
    for (const facts of [
      { udyamType: "micro" as const, isTrader: true },
      { udyamType: "medium" as const, isTrader: false },
      { udyamType: null, isTrader: false },
    ]) {
      const hidden = demandLetter({
        seller: { ...seller, ...facts },
        customer: guptaCustomer,
        invoices: [guptaInvoice],
        invoiceId: "i18",
        today: TODAY,
        payUrl: null,
      });
      expect(hidden.msmed).toBeNull();
      const text = letterText(hidden);
      expect(text).not.toContain("general information, not legal advice");
      expect(text).not.toContain("₹2,057.65");
      expect(text.match(/legal notice/gi)).toEqual(["legal notice"]);
    }
  });
});

describe("ODR case file", () => {
  const file = odrCaseFile({
    seller,
    customer: guptaCustomer,
    invoices: [guptaInvoice],
    reminders,
    calls: [call],
    today: TODAY,
  });

  it("includes Gupta's Reminder history and the stored call transcript excerpt", () => {
    expect(file.reminders.map((line) => line.text)).toEqual([
      "Friendly heads-up, sent by email",
      "Due-date reminder, sent by email",
      "Overdue reminder with pay link, sent on WhatsApp",
    ]);
    expect(file.transcriptExcerpt).toBe(
      "Munim: Namaste. I am an assistant from Tripura Bamboo Works.\nCustomer: I will look at it and call you back.",
    );
    expect(file.transcriptWhen).toBe("20 Oct 2026");
    expect(caseText(file)).toContain("I will look at it and call you back.");
  });

  it("explains ODR and MSMED, numbers the portal steps, and claims neither speed nor exclusivity", () => {
    const text = caseText(file);
    expect(text.startsWith("ODR case file")).toBe(true);
    expect(file.odrExplanation.startsWith("ODR is")).toBe(true);
    expect(file.interestExplanation.startsWith("MSMED is")).toBe(true);
    expect(file.steps).toHaveLength(4);
    expect(text).toContain("1. Print this page.");
    expect(text).toContain("odr.msme.gov.in");
    expect(text).toContain("₹2,057.65");
    for (const banned of [/only (route|way|portal)/i, /fastest/i, /exclusive/i, /\bquick\b/i, /within \d+ days/i, /\bsoon\b/i]) {
      expect(file.steps.join(" "), banned.source).not.toMatch(banned);
    }
    expect(text).not.toMatch(/90 days/i);
    expect(text).not.toMatch(/legal notice/i);
    expect(text).not.toMatch(/\bdebtor\b/i);
    expect(text).not.toMatch(/\bfake\b/i);
  });

  it("follows the letter's rules: no Invoice not yet due, past-date instalments only, and a note when nothing is due", () => {
    const both = odrCaseFile({ seller, customer: guptaCustomer, invoices: [guptaInvoice, notDue], reminders, calls: [], today: TODAY });
    expect(both.invoices.map((line) => line.number)).toEqual(["TBW/26-27/0018"]);
    expect(caseText(both)).not.toContain("TBW/26-27/0030");
    const planned = odrCaseFile({
      seller,
      customer: guptaCustomer,
      invoices: [guptaInvoice],
      promises: [{ invoiceId: "i18", status: "approved", instalments: [{ amountPaise: 6_000_000, date: "2026-10-30" }, { amountPaise: 5_800_000, date: "2026-12-02" }] }],
      reminders,
      calls: [],
      today: TODAY,
    });
    expect(planned.invoices[0]?.outstanding).toBe("₹60,000");
    expect(planned.planBanner).toBe("A Plan is agreed with Gupta Traders. This case file goes against it.");
    const none = odrCaseFile({ seller, customer: guptaCustomer, invoices: [notDue], reminders, calls: [], today: TODAY });
    expect(none.nothingDue).toBe("Nothing is past due for Gupta Traders.");
    expect(none.invoices).toEqual([]);
  });

  it("says when no call transcript is stored", () => {
    const empty = odrCaseFile({
      seller,
      customer: guptaCustomer,
      invoices: [guptaInvoice],
      reminders: [],
      calls: [{ invoiceId: "i18", startedAt: null, transcript: JSON.stringify({ issued: {} }) }],
      today: TODAY,
    });
    expect(empty.transcriptExcerpt).toBeNull();
    expect(caseText(empty)).toContain("No call transcript is stored for these Invoices yet.");
    expect(empty.reminderNote).toBe("No Reminders are stored for these Invoices yet.");
  });
});

describe("documents in the Customer's language", () => {
  const input = {
    seller,
    customer: guptaCustomer,
    invoices: [guptaInvoice],
    invoiceId: "i18",
    today: TODAY,
    payUrl: "https://tagada.example/pay/abc",
    reminders: [] as DocumentReminder[],
    calls: [] as DocumentCall[],
  };

  it("prints Gupta's letter in Hindi, with the amount in Hindi words", () => {
    const letter = demandLetter({ ...input, lang: "hi" });
    expect(letter.title).toBe("बकाया भुगतान के लिए पत्र");
    expect(letter.disclaimer).toBe("यह जीएसटी या कानूनी नोटिस नहीं है।");
    expect(letter.outstandingWords).toBe(hindiRupees(11_800_000));
    expect(letter.headings.outstanding).toBe("बकाया");
    const text = letterText(letter);
    expect(text).not.toMatch(/\bfake\b/i);
    expect(text).not.toMatch(/\bdebtor\b/i);
    expect(text).not.toMatch(/90 days/i);
    expect(text.match(/कानूनी नोटिस/g)).toEqual(["कानूनी नोटिस"]);
  });

  it("prints Roy's letter in Bengali, with the amount in English words", () => {
    const letter = demandLetter({ ...input, customer: { ...guptaCustomer, name: "Roy Furnishings" }, lang: "bn" });
    expect(letter.title).toBe("বকেয়া পরিশোধের চিঠি");
    expect(letter.outstandingWords).toBe(amountInWords(11_800_000));
    expect(letter.disclaimer).toBe("এটি কোনো জিএসটি বা আইনি নোটিশ নয়।");
    const file = odrCaseFile({ ...input, customer: { ...guptaCustomer, name: "Roy Furnishings" }, lang: "bn" });
    expect(file.title).toBe("ওডিআর কেস ফাইল");
    expect(caseText(file)).not.toMatch(/90 days/i);
  });

  it("an English copy is the English letter", () => {
    expect(demandLetter({ ...input, lang: "en" }).title).toBe(LETTER_TITLE);
  });
});

describe("transcriptExcerpt", () => {
  it("keeps the first four turns and drops voice-direction tags", () => {
    const raw = JSON.stringify({
      turns: [
        { role: "agent", message: "[calm] One" },
        { role: "user", message: "Two" },
        { role: "agent", message: "Three" },
        { role: "user", message: "Four" },
        { role: "agent", message: "Five" },
      ],
    });
    expect(transcriptExcerpt(raw)).toBe("Munim: One\nCustomer: Two\nMunim: Three\nCustomer: Four");
  });

  it("returns null when the call has not stored turns", () => {
    expect(transcriptExcerpt(null)).toBeNull();
    expect(transcriptExcerpt("not json")).toBeNull();
    expect(transcriptExcerpt("{}")).toBeNull();
  });
});
