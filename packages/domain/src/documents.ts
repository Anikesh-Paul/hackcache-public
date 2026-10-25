// The Payment Demand Letter and the ODR case file. Pure: every figure comes
// from the rows passed in, and every paise sum from `money`. Both demand only
// what is past due: an Invoice not yet due is left out, and under an agreed
// Plan or Promise only the instalments whose date has passed. The workspace
// stores a UPI ID and no bank account, so the letter prints the Demo world's
// sample account as the bank transfer. The screen says no one is paid. The
// payment date is 7 days on from the Demo date, the same window the final
// reminder names. It is not a statutory period.
import {
  addDays,
  daysBetween,
  differencePaise,
  financialYear,
  formatDate,
  formatInr,
  formatRateBps,
  bengaliDate,
  formatDateIn,
  hindiDate,
  sumPaise,
  upiPayUri,
} from "@tagada/money";
import { stripTags } from "./call.ts";
import { docPhrases, type DocLang, type DocPhrases } from "./doc-copy.ts";
import { invoiceStanding, type InvoiceFacts, type PromiseFacts } from "./invoice.ts";
import { stageName } from "./ladder.ts";
import { msmedInterest, section43bh, type SellerFacts } from "./msmed.ts";

export const LETTER_TITLE = "Payment Demand Letter";
export const LETTER_DISCLAIMER = "This is not a GST or legal notice.";
export const MSMED_BOX_LABEL = "general information, not legal advice";

/** First-use explanation. The acronym is defined in the opening words. */
export const MSMED_EXPLAIN =
  "MSMED is the Micro, Small and Medium Enterprises Development Act. A micro or small supplier that is not a trader may charge compound interest on a late payment, with a new rest each month, at three times the RBI Bank Rate. The figure is worked out by Tagada's interest code.";

export const ODR_EXPLAIN =
  "ODR is online dispute resolution. The government's portal for delayed payments to micro and small businesses is odr.msme.gov.in.";

export const TDS_EXPLAIN =
  "TDS is tax deducted at source. Some Customers must keep back a set share of a payment and pay that share to the tax department in the supplier's name. Possible TDS means the amount kept back is exactly 0.1%, 1%, 2% or 10% of the taxable value.";

/**
 * The Demo world's bank transfer. The IFSC is not issued to any bank.
 * The screen says so; the printed letter still tells the Customer where to pay.
 */
export const SAMPLE_BANK = {
  bankName: "Sample bank for this Demo world",
  accountNumber: "38492011000018",
  ifsc: "DEMO0TAGADA",
  note: "Pay by bank transfer to this account.",
} as const;

/**
 * The Demo world's Udyam registration number, seeded on its workspace. District
 * code 00 is not issued, so it names no real enterprise; the screen says it is a sample.
 */
export const SAMPLE_UDYAM = "UDYAM-TR-00-0012345";

/**
 * A Udyam registration number as the certificate prints it, UDYAM-XX-00-0000000,
 * from what the Owner typed: any case, spaces or none. Null when it is not one.
 */
export function udyamNumber(text: string): string | null {
  const plain = text.toUpperCase().replace(/\s+/g, "");
  const parts = /^UDYAM-?([A-Z]{2})-?(\d{2})-?(\d{7})$/.exec(plain);
  return parts ? `UDYAM-${parts[1]}-${parts[2]}-${parts[3]}` : null;
}

export const ODR_STEPS = [
  "Print this page. It lists the Invoices, the interest workings, the Reminder history and the call transcript excerpt.",
  "Open odr.msme.gov.in and sign in with the supplier's Udyam details.",
  "File a delayed-payment case and upload this page with the Invoices.",
  "Keep a copy of the filing. Tagada prepares this page and does not file the case.",
] as const;

const PAYMENT_WINDOW_DAYS = 7;
const EXCERPT_TURNS = 4;
const NOT_IN_DEMAND = "This interest is not added to the amount demanded above.";
const NO_TRANSCRIPT = "No call transcript is stored for these Invoices yet.";
const NO_REMINDERS = "No Reminders are stored for these Invoices yet.";

export type DocumentSeller = SellerFacts & {
  businessName: string;
  address: string | null;
  gstin: string | null;
  upiVpa: string | null;
  ownerEmail: string | null;
  /** The Udyam registration number; null when the workspace has none. */
  udyamNumber: string | null;
};

export type DocumentCustomer = {
  name: string;
  address: string | null;
  place: string | null;
  gstin?: string | null;
};

export type DocumentInvoice = InvoiceFacts & {
  $id: string;
  number: string;
  issueDate: string;
};

export type DocumentPromise = PromiseFacts & { invoiceId: string };

export type DocumentReminder = {
  invoiceId: string;
  sentDate: string | null;
  stage: number;
  channel: "email" | "whatsapp_link" | "call";
  status: "queued" | "sent" | "failed" | "retried" | "skipped_cap" | "skipped_stage_off";
};

export type DocumentCall = {
  invoiceId: string;
  startedAt: string | null;
  transcript: string | null;
};

export type LetterInvoiceLine = {
  number: string;
  issued: string;
  due: string;
  /** What this Invoice is asked for: all it owes, or under an agreed Plan the past-date instalments. */
  outstanding: string;
  note: string | null;
};

/** The seller's letterhead: the same on the letter and the case file. */
export type Letterhead = {
  name: string;
  address: string | null;
  gstin: string | null;
  udyam: string | null;
  udyamType: string | null;
  /** True for the Demo world's seeded number, which the screen badges as a sample. */
  udyamSample: boolean;
  contact: string | null;
};

/** One monthly rest of MSMED interest, as a table row. */
export type InterestRow = {
  invoice: string;
  period: string;
  rate: string;
  /** Days in the rest; null for a flat-rate month. */
  days: number | null;
  interest: string;
};

export type DemandLetter = {
  lang: DocLang;
  /** "Nothing is past due for …" when no Invoice is: the page shows this and nothing to print. */
  nothingDue: string | null;
  /** On screen only, never printed: an agreed Plan or Promise this letter goes against. */
  planBanner: string | null;
  title: string;
  /** "TBW/DL/26-27/0019": the opened Invoice's number with the document's code. */
  reference: string;
  letterhead: Letterhead;
  disclaimer: string;
  /** Amount in words: Hindi when the Customer's language is Hindi, English otherwise. */
  outstandingWords: string;
  bankHeading: string;
  headings: DocPhrases["headings"];
  dateLine: string;
  toName: string;
  toAddress: string | null;
  fromName: string;
  fromAddress: string | null;
  fromGstin: string | null;
  invoices: LetterInvoiceLine[];
  outstanding: string;
  deadlineLine: string;
  /** "Please pay by Mon 9 Nov 2026", under the amount due. */
  payBy: string;
  upiLine: string;
  upiVpa: string | null;
  upiUri: string | null;
  bank: {
    accountName: string;
    bankName: string;
    accountNumber: string;
    ifsc: string;
    note: string;
  };
  payLinkLine: string;
  /** The pay link itself, for small print beside the QR; null when the Invoice has none. */
  payUrl: string | null;
  /** "Scan with any UPI app, or open the pay link." */
  scanOrOpen: string;
  contactLine: string | null;
  signOff: string;
  msmed: null | {
    label: string;
    explanation: string;
    totalLine: string;
    lines: string[];
    aside: string;
  };
  /** Section 43B(h), one line per Invoice demanded, when the seller is covered. */
  deduction: null | {
    heading: string;
    explanation: string;
    lines: string[];
  };
};

export type CaseReminderLine = { when: string; text: string };

/** One Reminder as a table row. `invoice` is set only when the file names more than one Invoice. */
export type CaseReminderRow = { date: string; invoice: string | null; stage: string; channel: string; delivery: string };

/** One line said on the call: the speaker for the margin, and the words. */
export type CaseTurn = { speaker: string; message: string };

export type CaseFile = {
  lang: DocLang;
  nothingDue: string | null;
  planBanner: string | null;
  title: string;
  /** "TBW/ODR/26-27/0019". */
  reference: string;
  letterhead: Letterhead;
  toAddress: string | null;
  toGstin: string | null;
  /** The cover box: what is claimed, from the same sums as the sections below. */
  summary: {
    invoiceCount: number;
    principal: string;
    /** Null when no MSMED interest can be claimed. */
    interest: string | null;
    total: string;
  };
  interestRows: InterestRow[];
  /** The total row of the interest table, or null when there are no rests. */
  interestTotal: string | null;
  reminderRows: CaseReminderRow[];
  transcriptTurns: CaseTurn[];
  dateLine: string;
  fromName: string;
  toName: string;
  headings: DocPhrases["headings"];
  odrExplanation: string;
  steps: readonly string[];
  invoices: LetterInvoiceLine[];
  interestExplanation: string;
  interestNote: string;
  interestLines: string[];
  reminders: CaseReminderLine[];
  reminderNote: string | null;
  transcriptWhen: string | null;
  transcriptExcerpt: string | null;
  /** The excerpt, or the sentence shown when none is stored. */
  transcriptLine: string;
};

function dated(iso: string, lang: DocLang): string {
  if (lang === "hi") return hindiDate(iso);
  if (lang === "bn") return bengaliDate(iso, { year: true });
  return formatDate(iso, { weekday: false, year: true });
}

/** A date in a list of workings: short, in the letter's language. */
function shortDated(iso: string, lang: DocLang): string {
  return formatDateIn(iso, lang, { weekday: false });
}

type Rest = { start: string | null; end: string | null; rates: { days: number | null; annualBps: number }[]; interestPaise: number };

function restRow(invoiceNumber: string, rest: Rest, phrases: DocPhrases, lang: DocLang): InterestRow {
  // One rate needs no day count beside it: the Days column has it.
  const [only] = rest.rates;
  const rate =
    rest.rates.length === 1 && only
      ? formatRateBps(only.annualBps)
      : rest.rates
          .map((part) => (part.days === null ? formatRateBps(part.annualBps) : phrases.restRate(formatRateBps(part.annualBps), part.days)))
          .join(" + ");
  return {
    invoice: invoiceNumber,
    period:
      rest.start && rest.end ? phrases.restSpan(shortDated(rest.start, lang), shortDated(rest.end, lang)) : phrases.restMonth,
    rate,
    days: rest.start && rest.end ? daysBetween(rest.start, rest.end) : null,
    interest: formatInr(rest.interestPaise),
  };
}

function restLine(invoiceNumber: string, rest: Rest, phrases: DocPhrases, lang: DocLang): string {
  const rates = rest.rates
    .map((part) => (part.days === null ? formatRateBps(part.annualBps) : phrases.restRate(formatRateBps(part.annualBps), part.days)))
    .join(" + ");
  const { period, interest } = restRow(invoiceNumber, rest, phrases, lang);
  return `${invoiceNumber}: ${period}, ${rates}, ${interest}`;
}

const DOC_CODES = { letter: "DL", case: "ODR" } as const;

/**
 * The document's reference: the Invoice number with the document's code after
 * its prefix, so TBW/26-27/0019 gives TBW/DL/26-27/0019. A number in another
 * shape keeps whole, after the code and the financial year of `today`.
 */
export function documentReference(what: "letter" | "case", invoiceNumber: string, today: string): string {
  const code = DOC_CODES[what];
  const parts = /^(.+)\/(\d{2}-\d{2})\/([^/]+)$/.exec(invoiceNumber);
  if (parts) return `${parts[1]}/${code}/${parts[2]}/${parts[3]}`;
  return `${code}/${financialYear(today)}/${invoiceNumber}`;
}

function letterheadOf(seller: DocumentSeller, phrases: DocPhrases): Letterhead {
  const sized = seller.udyamType === "micro" || seller.udyamType === "small" || seller.udyamType === "medium" ? seller.udyamType : null;
  return {
    name: seller.businessName,
    address: seller.address,
    gstin: seller.gstin,
    udyam: seller.udyamNumber,
    udyamType: sized ? phrases.udyamType[sized] : null,
    udyamSample: seller.udyamNumber === SAMPLE_UDYAM,
    contact: seller.ownerEmail,
  };
}

/** The Invoice the page was opened from, else the first one named, for the reference. */
function referenceInvoice(invoices: readonly DocumentInvoice[], listed: readonly DocumentInvoice[], invoiceId: string | undefined) {
  return invoices.find((invoice) => invoice.$id === invoiceId) ?? listed[0] ?? invoices[0];
}

/**
 * What one Invoice is past due on `today`: nothing before its due date; under
 * an agreed Plan or Promise, what it owes beyond the instalments still to
 * come (the past-date ones); otherwise all it owes.
 */
function pastDue(invoice: DocumentInvoice, promises: readonly DocumentPromise[], today: string) {
  const standing = invoiceStanding(invoice, [], today);
  if (standing.balancePaise <= 0 || standing.daysLate === 0) return { paise: 0, agreed: null, standing };
  const agreed = promises.find((p) => p.invoiceId === invoice.$id && p.status === "approved") ?? null;
  if (!agreed) return { paise: standing.balancePaise, agreed, standing };
  const toCome = sumPaise(agreed.instalments.filter((i) => i.date >= today).map((i) => i.amountPaise));
  const owed = differencePaise(standing.balancePaise, toCome);
  return { paise: owed > 0 ? owed : 0, agreed, standing };
}

const kindOf = (promise: DocumentPromise) => (promise.instalments.length > 1 ? "Plan" : "Promise");

/** One pass over the Invoices: the past-due lines, what is demanded, and any MSMED interest. */
function prepare(
  invoices: readonly DocumentInvoice[],
  promises: readonly DocumentPromise[],
  customer: DocumentCustomer,
  seller: SellerFacts,
  today: string,
  what: "letter" | "case",
  phrases: DocPhrases,
  lang: DocLang,
) {
  const sorted = [...invoices].sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.number.localeCompare(b.number));
  const listed: DocumentInvoice[] = [];
  const lines: LetterInvoiceLine[] = [];
  const balances: number[] = [];
  const workings: string[] = [];
  const interestRows: InterestRow[] = [];
  const deductions: string[] = [];
  const interests: number[] = [];
  const principals: number[] = [];
  const agreed: DocumentPromise[] = [];
  for (const invoice of sorted) {
    const due = pastDue(invoice, promises, today);
    if (due.agreed) agreed.push(due.agreed);
    if (due.paise === 0) continue;
    const { standing } = due;
    listed.push(invoice);
    lines.push({
      number: invoice.number,
      issued: dated(invoice.issueDate, lang),
      due: dated(invoice.dueDate, lang),
      outstanding: formatInr(due.paise),
      note: due.agreed ? phrases.instalmentNote(kindOf(due.agreed)) : null,
    });
    balances.push(due.paise);
    const clock = section43bh(seller, invoice, today);
    if (clock) deductions.push(phrases.deductionLine(invoice.number, dated(clock.claimBy, lang), clock.claimYear, clock.sameYear));
    const meter = msmedInterest(seller, invoice, standing, today);
    if (!meter) continue;
    interests.push(meter.interestPaise);
    principals.push(meter.principalPaise);
    for (const rest of meter.rests) {
      workings.push(restLine(invoice.number, rest, phrases, lang));
      interestRows.push(restRow(invoice.number, rest, phrases, lang));
    }
  }
  const outstandingPaise = sumPaise(balances);
  const interestPaise = sumPaise(interests);
  // Only the Invoices past their appointed day earn interest, so the total names that amount, not all that is owed.
  const interestTotal = phrases.interestTotal(formatInr(interestPaise), formatInr(sumPaise(principals)));
  const [first] = agreed;
  return {
    listed,
    lines,
    outstandingPaise,
    outstanding: formatInr(outstandingPaise),
    outstandingWords: phrases.amountWords(outstandingPaise),
    workings,
    interestRows,
    interestPaise,
    claimsInterest: interests.length > 0,
    deductions,
    interestTotal,
    nothingDue: listed.length === 0 ? phrases.nothingDue(customer.name) : null,
    planBanner: first ? phrases.planBanner(kindOf(first), customer.name, what) : null,
    lang,
  };
}

function whyNoInterest(seller: SellerFacts, phrases: DocPhrases): string {
  if (seller.isTrader) return phrases.noInterestTrader;
  if (seller.udyamType !== "micro" && seller.udyamType !== "small") return phrases.noInterestSize;
  return phrases.noInterestNone;
}

/** The first turns of a stored call, or null when no transcript was kept. */
/** One line said on a call, as the post-call webhook stored it: `at` is seconds into the call. */
export type CallTurn = { role: "agent" | "user"; message: string; at: number };

/** The lines a stored call transcript holds, without voice tags. Null when there are none (not in yet, or refused as tampered). */
export function callTurns(raw: string | null): CallTurn[] | null {
  if (!raw) return null;
  let turns: unknown;
  try {
    turns = (JSON.parse(raw) as { turns?: unknown }).turns;
  } catch {
    return null;
  }
  if (!Array.isArray(turns)) return null;
  const said: CallTurn[] = [];
  for (const turn of turns) {
    if (!turn || typeof turn !== "object") continue;
    const { role, message, t } = turn as { role?: unknown; message?: unknown; t?: unknown };
    if ((role !== "agent" && role !== "user") || typeof message !== "string") continue;
    const text = stripTags(message);
    if (text) said.push({ role, message: text, at: typeof t === "number" && t >= 0 ? t : 0 });
  }
  return said.length > 0 ? said : null;
}

export function transcriptExcerpt(raw: string | null, customerRole = "Customer"): string | null {
  const lines = (callTurns(raw) ?? [])
    .slice(0, EXCERPT_TURNS)
    .map((turn) => `${turn.role === "agent" ? "Munim" : customerRole}: ${turn.message}`);
  return lines.length > 0 ? lines.join("\n") : null;
}

function channelWords(channel: DocumentReminder["channel"], phrases: DocPhrases): string {
  if (channel === "email" || channel === "whatsapp_link") return phrases.channel[channel];
  return phrases.channel.call;
}

function statusWords(status: DocumentReminder["status"], phrases: DocPhrases): string {
  if (status === "sent" || status === "retried" || status === "failed" || status === "queued" || status === "skipped_cap") {
    return phrases.status[status];
  }
  return phrases.status.ready;
}

/**
 * The letter for one Customer. `invoices` are the ones it may name (the open
 * ones, or the Invoice the page was opened from); only what is past due is
 * demanded. Interest is a separate box, and only for a micro or small Udyam
 * supplier that is not a trader.
 */
export function demandLetter(input: {
  seller: DocumentSeller;
  customer: DocumentCustomer;
  invoices: readonly DocumentInvoice[];
  /** Every Promise and Plan on those Invoices. */
  promises?: readonly DocumentPromise[];
  invoiceId: string;
  today: string;
  payUrl: string | null;
  /** The Customer's language. English when omitted. */
  lang?: DocLang | null;
}): DemandLetter {
  const lang: DocLang = input.lang === "hi" || input.lang === "bn" ? input.lang : "en";
  const phrases = docPhrases(lang);
  const { listed, lines, outstandingPaise, outstanding, outstandingWords, workings, deductions, interestTotal, nothingDue, planBanner } = prepare(
    input.invoices,
    input.promises ?? [],
    input.customer,
    input.seller,
    input.today,
    "letter",
    phrases,
    lang,
  );
  const deadline = addDays(input.today, PAYMENT_WINDOW_DAYS);
  const primary = listed.find((invoice) => invoice.$id === input.invoiceId) ?? listed[0];
  const upiUri =
    input.seller.upiVpa && outstandingPaise > 0
      ? upiPayUri({
          vpa: input.seller.upiVpa,
          payeeName: input.seller.businessName,
          amountPaise: outstandingPaise,
          note: primary?.number ?? "Invoice",
        })
      : null;
  const deadlineText = lang === "en" ? formatDate(deadline, { year: true }) : dated(deadline, lang);
  const opened = referenceInvoice(input.invoices, listed, input.invoiceId);

  return {
    lang,
    nothingDue,
    planBanner,
    title: phrases.title,
    reference: documentReference("letter", opened?.number ?? "", input.today),
    letterhead: letterheadOf(input.seller, phrases),
    disclaimer: phrases.disclaimer,
    outstandingWords,
    bankHeading: phrases.bankHeading,
    headings: phrases.headings,
    dateLine: dated(input.today, lang),
    toName: input.customer.name,
    toAddress: input.customer.address ?? input.customer.place,
    fromName: input.seller.businessName,
    fromAddress: input.seller.address,
    fromGstin: input.seller.gstin,
    invoices: lines,
    outstanding,
    deadlineLine: phrases.deadline(outstanding, deadlineText),
    payBy: phrases.payBy(deadlineText),
    upiLine: input.seller.upiVpa ? phrases.upi(input.seller.upiVpa, outstanding) : phrases.noUpi,
    upiVpa: input.seller.upiVpa,
    upiUri,
    bank: { accountName: input.seller.businessName, ...SAMPLE_BANK, note: phrases.bankNote },
    payLinkLine: input.payUrl ? phrases.payLink(input.payUrl) : phrases.noPayLink,
    payUrl: input.payUrl,
    scanOrOpen: phrases.scanOrOpen,
    contactLine: input.seller.ownerEmail ? phrases.contact(input.seller.ownerEmail) : null,
    signOff: phrases.signOff(input.seller.businessName),
    msmed:
      workings.length === 0
        ? null
        : {
            label: phrases.msmedLabel,
            explanation: phrases.msmedExplain,
            totalLine: interestTotal,
            lines: workings,
            aside: phrases.interestAside,
          },
    deduction:
      deductions.length === 0
        ? null
        : { heading: phrases.deductionHeading, explanation: phrases.deductionExplain, lines: deductions },
  };
}

/** One page for odr.msme.gov.in. It does not say the portal is fast, or the only route. */
export function odrCaseFile(input: {
  seller: DocumentSeller;
  customer: DocumentCustomer;
  invoices: readonly DocumentInvoice[];
  promises?: readonly DocumentPromise[];
  reminders: readonly DocumentReminder[];
  calls: readonly DocumentCall[];
  today: string;
  /** The Invoice the page was opened from, for the reference. The first one named when omitted. */
  invoiceId?: string;
  lang?: DocLang | null;
}): CaseFile {
  const lang: DocLang = input.lang === "hi" || input.lang === "bn" ? input.lang : "en";
  const phrases = docPhrases(lang);
  const { listed, lines, outstandingPaise, outstanding, workings, interestRows, interestPaise, claimsInterest, interestTotal, nothingDue, planBanner } = prepare(
    input.invoices,
    input.promises ?? [],
    input.customer,
    input.seller,
    input.today,
    "case",
    phrases,
    lang,
  );
  const ids = new Set(listed.map((invoice) => invoice.$id));
  const numbers = new Map(listed.map((invoice) => [invoice.$id, invoice.number]));
  const sent = input.reminders
    .filter((reminder) => ids.has(reminder.invoiceId))
    .sort((a, b) => (a.sentDate ?? "").localeCompare(b.sentDate ?? "") || a.stage - b.stage);
  const reminderRows = sent.map((reminder) => ({
    date: reminder.sentDate ? dated(reminder.sentDate, lang) : phrases.dateNotRecorded,
    invoice: numbers.size > 1 ? (numbers.get(reminder.invoiceId) ?? null) : null,
    stage: phrases.stage(stageName(reminder.stage)),
    channel: phrases.channelName[reminder.channel],
    delivery: statusWords(reminder.status, phrases),
  }));
  const reminders = sent.map((reminder) => {
      const which = numbers.size > 1 ? `${numbers.get(reminder.invoiceId) ?? "Invoice"}, ` : "";
      return {
        when: reminder.sentDate ? dated(reminder.sentDate, lang) : phrases.dateNotRecorded,
        text: `${which}${phrases.reminder(phrases.stage(stageName(reminder.stage)), statusWords(reminder.status, phrases), channelWords(reminder.channel, phrases))}`,
      };
    });
  const spoken = input.calls
    .filter((call) => ids.has(call.invoiceId))
    .map((call) => ({ call, excerpt: transcriptExcerpt(call.transcript, phrases.customerRole) }))
    .filter((item): item is { call: DocumentCall; excerpt: string } => item.excerpt !== null)
    .sort((a, b) => (b.call.startedAt ?? "").localeCompare(a.call.startedAt ?? ""));
  const chosen = spoken[0] ?? null;
  const transcriptTurns = (callTurns(chosen?.call.transcript ?? null) ?? []).slice(0, EXCERPT_TURNS).map((turn) => ({
    speaker: turn.role === "agent" ? "Munim" : phrases.customerRole,
    message: turn.message,
  }));
  const opened = referenceInvoice(input.invoices, listed, input.invoiceId);

  return {
    lang,
    nothingDue,
    planBanner,
    title: phrases.caseTitle,
    reference: documentReference("case", opened?.number ?? "", input.today),
    letterhead: letterheadOf(input.seller, phrases),
    toAddress: input.customer.address ?? input.customer.place,
    toGstin: input.customer.gstin ?? null,
    summary: {
      invoiceCount: listed.length,
      principal: outstanding,
      interest: claimsInterest ? formatInr(interestPaise) : null,
      total: formatInr(sumPaise([outstandingPaise, interestPaise])),
    },
    interestRows,
    interestTotal: interestRows.length > 0 ? formatInr(interestPaise) : null,
    reminderRows,
    transcriptTurns,
    dateLine: dated(input.today, lang),
    fromName: input.seller.businessName,
    toName: input.customer.name,
    headings: phrases.headings,
    odrExplanation: phrases.odrExplain,
    steps: phrases.steps,
    invoices: lines,
    interestExplanation: phrases.msmedExplain,
    interestNote: workings.length === 0 ? whyNoInterest(input.seller, phrases) : phrases.interestNote(interestTotal),
    interestLines: workings,
    reminders,
    reminderNote: reminders.length === 0 ? phrases.noReminders : null,
    transcriptWhen: chosen?.call.startedAt ? dated(chosen.call.startedAt.slice(0, 10), lang) : null,
    transcriptExcerpt: chosen?.excerpt ?? null,
    transcriptLine: chosen?.excerpt ?? phrases.noTranscript,
  };
}

function letterheadText(head: Letterhead): string[] {
  return [head.name, head.address ?? "", head.gstin ?? "", head.udyam ?? "", head.udyamType ?? "", head.contact ?? ""];
}

/** Every word the letter shows, for a grep of the rendered page. */
export function letterText(letter: DemandLetter): string {
  return [
    letter.title,
    letter.reference,
    ...letterheadText(letter.letterhead),
    letter.disclaimer,
    letter.dateLine,
    letter.toName,
    letter.toAddress ?? "",
    letter.fromName,
    letter.fromAddress ?? "",
    letter.fromGstin ?? "",
    letter.nothingDue ?? "",
    letter.planBanner ?? "",
    ...letter.invoices.flatMap((line) => [line.number, line.issued, line.due, line.outstanding, line.note ?? ""]),
    letter.outstanding,
    letter.outstandingWords,
    letter.deadlineLine,
    letter.payBy,
    letter.upiLine,
    letter.bankHeading,
    letter.bank.accountName,
    letter.bank.bankName,
    letter.bank.accountNumber,
    letter.bank.ifsc,
    letter.bank.note,
    letter.payLinkLine,
    letter.scanOrOpen,
    letter.contactLine ?? "",
    letter.signOff,
    letter.msmed?.label ?? "",
    letter.msmed?.explanation ?? "",
    letter.msmed?.totalLine ?? "",
    ...(letter.msmed?.lines ?? []),
    letter.msmed?.aside ?? "",
    letter.deduction?.heading ?? "",
    letter.deduction?.explanation ?? "",
    ...(letter.deduction?.lines ?? []),
  ].join("\n");
}

/** Every word the case file shows. */
export function caseText(file: CaseFile): string {
  return [
    file.title,
    file.reference,
    ...letterheadText(file.letterhead),
    file.dateLine,
    file.fromName,
    file.toName,
    file.toAddress ?? "",
    file.toGstin ?? "",
    file.summary.principal,
    file.summary.interest ?? "",
    file.summary.total,
    file.odrExplanation,
    ...file.steps.map((step, index) => `${index + 1}. ${step}`),
    file.nothingDue ?? "",
    file.planBanner ?? "",
    ...file.invoices.flatMap((line) => [line.number, line.issued, line.due, line.outstanding, line.note ?? ""]),
    file.interestExplanation,
    file.interestNote,
    ...file.interestLines,
    ...file.interestRows.flatMap((row) => [row.invoice, row.period, row.rate, String(row.days ?? ""), row.interest]),
    file.interestTotal ?? "",
    ...file.reminderRows.flatMap((row) => [row.date, row.invoice ?? "", row.stage, row.channel, row.delivery]),
    ...file.transcriptTurns.flatMap((turn) => [turn.speaker, turn.message]),
    file.reminderNote ?? "",
    ...file.reminders.flatMap((line) => [line.when, line.text]),
    file.transcriptWhen ?? "",
    file.transcriptLine,
  ].join("\n");
}
