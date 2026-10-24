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
  differencePaise,
  formatDate,
  formatInr,
  formatRateBps,
  bengaliDate,
  hindiDate,
  hindiShortDate,
  sumPaise,
  upiPayUri,
} from "@tagada/money";
import { stripTags } from "./call.ts";
import { docPhrases, type DocLang, type DocPhrases } from "./doc-copy.ts";
import { invoiceStanding, type InvoiceFacts, type PromiseFacts } from "./invoice.ts";
import { stageName } from "./ladder.ts";
import { msmedInterest, type SellerFacts } from "./msmed.ts";

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
};

export type DocumentCustomer = {
  name: string;
  address: string | null;
  place: string | null;
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

export type DemandLetter = {
  /** "Nothing is past due for …" when no Invoice is: the page shows this and nothing to print. */
  nothingDue: string | null;
  /** On screen only, never printed: an agreed Plan or Promise this letter goes against. */
  planBanner: string | null;
  title: string;
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
  upiLine: string;
  upiUri: string | null;
  bank: {
    accountName: string;
    bankName: string;
    accountNumber: string;
    ifsc: string;
    note: string;
  };
  payLinkLine: string;
  contactLine: string | null;
  signOff: string;
  msmed: null | {
    label: string;
    explanation: string;
    totalLine: string;
    lines: string[];
    aside: string;
  };
};

export type CaseReminderLine = { when: string; text: string };

export type CaseFile = {
  nothingDue: string | null;
  planBanner: string | null;
  title: string;
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
  if (lang === "hi") return hindiShortDate(iso);
  if (lang === "bn") return bengaliDate(iso);
  return formatDate(iso, { weekday: false });
}

function restLine(
  invoiceNumber: string,
  rest: { start: string | null; end: string | null; rates: { days: number | null; annualBps: number }[]; interestPaise: number },
  phrases: DocPhrases,
  lang: DocLang,
): string {
  const rates = rest.rates
    .map((part) => (part.days === null ? formatRateBps(part.annualBps) : phrases.restRate(formatRateBps(part.annualBps), part.days)))
    .join(" + ");
  const when =
    rest.start && rest.end
      ? phrases.restSpan(shortDated(rest.start, lang), shortDated(rest.end, lang))
      : phrases.restMonth;
  return `${invoiceNumber}: ${when}, ${rates}, ${formatInr(rest.interestPaise)}`;
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
    const meter = msmedInterest(seller, invoice, standing, today);
    if (!meter) continue;
    interests.push(meter.interestPaise);
    principals.push(meter.principalPaise);
    for (const rest of meter.rests) workings.push(restLine(invoice.number, rest, phrases, lang));
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
export function transcriptExcerpt(raw: string | null, customerRole = "Customer"): string | null {
  if (!raw) return null;
  let turns: unknown;
  try {
    turns = (JSON.parse(raw) as { turns?: unknown }).turns;
  } catch {
    return null;
  }
  if (!Array.isArray(turns)) return null;
  const lines: string[] = [];
  for (const turn of turns) {
    if (lines.length >= EXCERPT_TURNS) break;
    if (!turn || typeof turn !== "object") continue;
    const role = (turn as { role?: unknown }).role;
    const message = (turn as { message?: unknown }).message;
    if ((role !== "agent" && role !== "user") || typeof message !== "string") continue;
    const said = stripTags(message);
    if (!said) continue;
    lines.push(`${role === "agent" ? "Munim" : customerRole}: ${said}`);
  }
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
  const { listed, lines, outstandingPaise, outstanding, outstandingWords, workings, interestTotal, nothingDue, planBanner } = prepare(
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

  return {
    nothingDue,
    planBanner,
    title: phrases.title,
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
    upiLine: input.seller.upiVpa ? phrases.upi(input.seller.upiVpa, outstanding) : phrases.noUpi,
    upiUri,
    bank: { accountName: input.seller.businessName, ...SAMPLE_BANK, note: phrases.bankNote },
    payLinkLine: input.payUrl ? phrases.payLink(input.payUrl) : phrases.noPayLink,
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
  lang?: DocLang | null;
}): CaseFile {
  const lang: DocLang = input.lang === "hi" || input.lang === "bn" ? input.lang : "en";
  const phrases = docPhrases(lang);
  const { listed, lines, workings, interestTotal, nothingDue, planBanner } = prepare(
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
  const reminders = input.reminders
    .filter((reminder) => ids.has(reminder.invoiceId))
    .sort((a, b) => (a.sentDate ?? "").localeCompare(b.sentDate ?? "") || a.stage - b.stage)
    .map((reminder) => {
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

  return {
    nothingDue,
    planBanner,
    title: phrases.caseTitle,
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

/** Every word the letter shows, for a grep of the rendered page. */
export function letterText(letter: DemandLetter): string {
  return [
    letter.title,
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
    letter.upiLine,
    letter.bankHeading,
    letter.bank.accountName,
    letter.bank.bankName,
    letter.bank.accountNumber,
    letter.bank.ifsc,
    letter.bank.note,
    letter.payLinkLine,
    letter.contactLine ?? "",
    letter.signOff,
    letter.msmed?.label ?? "",
    letter.msmed?.explanation ?? "",
    letter.msmed?.totalLine ?? "",
    ...(letter.msmed?.lines ?? []),
    letter.msmed?.aside ?? "",
  ].join("\n");
}

/** Every word the case file shows. */
export function caseText(file: CaseFile): string {
  return [
    file.title,
    file.dateLine,
    file.fromName,
    file.toName,
    file.odrExplanation,
    ...file.steps.map((step, index) => `${index + 1}. ${step}`),
    file.nothingDue ?? "",
    file.planBanner ?? "",
    ...file.invoices.flatMap((line) => [line.number, line.issued, line.due, line.outstanding, line.note ?? ""]),
    file.interestExplanation,
    file.interestNote,
    ...file.interestLines,
    file.reminderNote ?? "",
    ...file.reminders.flatMap((line) => [line.when, line.text]),
    file.transcriptWhen ?? "",
    file.transcriptLine,
  ].join("\n");
}
