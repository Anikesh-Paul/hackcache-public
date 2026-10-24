// The Payment Demand Letter and the ODR case file. Pure: every figure comes
// from the rows passed in, and every paise sum from `money`. The workspace
// stores a UPI ID and no bank account, so the letter prints the Demo world's
// sample account as the bank transfer. The screen says no one is paid. The
// payment date is 7 days on from the Demo date, the same window the final
// reminder names. It is not a statutory period.
import {
  addDays,
  formatDate,
  formatInr,
  formatRateBps,
  sumPaise,
  upiPayUri,
} from "@tagada/money";
import { stripTags } from "./call.ts";
import { invoiceStanding, type InvoiceFacts } from "./invoice.ts";
import { LADDER_STAGES } from "./ladder.ts";
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
  "TDS is tax deducted at source. Some Customers must keep back a set share of a payment and pay that share to the tax department in the supplier's name. Possible TDS means the shortfall is exactly 0.1%, 1%, 2% or 10% of the taxable value.";

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
  outstanding: string;
};

export type DemandLetter = {
  title: typeof LETTER_TITLE;
  disclaimer: typeof LETTER_DISCLAIMER;
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
    label: typeof MSMED_BOX_LABEL;
    explanation: typeof MSMED_EXPLAIN;
    totalLine: string;
    lines: string[];
    aside: typeof NOT_IN_DEMAND;
  };
};

export type CaseReminderLine = { when: string; text: string };

export type CaseFile = {
  title: "ODR case file";
  dateLine: string;
  fromName: string;
  toName: string;
  odrExplanation: typeof ODR_EXPLAIN;
  steps: readonly string[];
  invoices: LetterInvoiceLine[];
  interestExplanation: typeof MSMED_EXPLAIN;
  interestNote: string;
  interestLines: string[];
  reminders: CaseReminderLine[];
  reminderNote: string | null;
  transcriptWhen: string | null;
  transcriptExcerpt: string | null;
  /** The excerpt, or the sentence shown when none is stored. */
  transcriptLine: string;
};

function dated(iso: string): string {
  return formatDate(iso, { weekday: false, year: true });
}

function restLine(invoiceNumber: string, rest: { start: string | null; end: string | null; rates: { days: number | null; annualBps: number }[]; interestPaise: number }): string {
  const rates = rest.rates
    .map((part) => (part.days === null ? formatRateBps(part.annualBps) : `${formatRateBps(part.annualBps)} for ${part.days} days`))
    .join(" + ");
  const when =
    rest.start && rest.end ? `${formatDate(rest.start, { weekday: false })} to ${formatDate(rest.end, { weekday: false })}` : "Month";
  return `${invoiceNumber}: ${when}, ${rates}, ${formatInr(rest.interestPaise)}`;
}

/** One pass over the Invoices: the lines, what is owed, and any MSMED interest. */
function prepare(invoices: readonly DocumentInvoice[], seller: SellerFacts, today: string) {
  const listed = [...invoices].sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.number.localeCompare(b.number));
  const lines: LetterInvoiceLine[] = [];
  const balances: number[] = [];
  const workings: string[] = [];
  const interests: number[] = [];
  for (const invoice of listed) {
    const standing = invoiceStanding(invoice, [], today);
    lines.push({
      number: invoice.number,
      issued: dated(invoice.issueDate),
      due: dated(invoice.dueDate),
      outstanding: formatInr(standing.balancePaise),
    });
    balances.push(standing.balancePaise);
    const meter = msmedInterest(seller, invoice, standing, today);
    if (!meter) continue;
    interests.push(meter.interestPaise);
    for (const rest of meter.rests) workings.push(restLine(invoice.number, rest));
  }
  const outstandingPaise = sumPaise(balances);
  return { listed, lines, outstandingPaise, outstanding: formatInr(outstandingPaise), workings, interestPaise: sumPaise(interests) };
}

function whyNoInterest(seller: SellerFacts): string {
  if (seller.isTrader) return "No MSMED interest is claimed. This seller is a trader.";
  if (seller.udyamType !== "micro" && seller.udyamType !== "small") {
    return "No MSMED interest is claimed. This seller is not a micro or small Udyam enterprise.";
  }
  return "No MSMED interest is claimed. Nothing here is overdue and unpaid.";
}

/** The first turns of a stored call, or null when no transcript was kept. */
export function transcriptExcerpt(raw: string | null): string | null {
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
    lines.push(`${role === "agent" ? "Tagada" : "Customer"}: ${said}`);
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

function stageName(stage: number): string {
  return LADDER_STAGES.find((s) => s.stage === stage)?.name ?? "Reminder";
}

function channelWords(channel: DocumentReminder["channel"]): string {
  if (channel === "email") return "by email";
  if (channel === "whatsapp_link") return "on WhatsApp";
  return "by phone";
}

function statusWords(status: DocumentReminder["status"]): string {
  if (status === "sent") return "sent";
  if (status === "retried") return "sent after a retry";
  if (status === "failed") return "failed";
  if (status === "queued") return "waiting to send";
  if (status === "skipped_cap") return "held for tomorrow";
  return "ready for you to send";
}

/**
 * The letter for one Customer. `invoices` are the ones it names (the open
 * ones, or the Invoice the page was opened from). Interest is a separate box,
 * and only for a micro or small Udyam supplier that is not a trader.
 */
export function demandLetter(input: {
  seller: DocumentSeller;
  customer: DocumentCustomer;
  invoices: readonly DocumentInvoice[];
  invoiceId: string;
  today: string;
  payUrl: string | null;
}): DemandLetter {
  const { listed, lines, outstandingPaise, outstanding, workings, interestPaise } = prepare(
    input.invoices,
    input.seller,
    input.today,
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

  return {
    title: LETTER_TITLE,
    disclaimer: LETTER_DISCLAIMER,
    dateLine: dated(input.today),
    toName: input.customer.name,
    toAddress: input.customer.address ?? input.customer.place,
    fromName: input.seller.businessName,
    fromAddress: input.seller.address,
    fromGstin: input.seller.gstin,
    invoices: lines,
    outstanding,
    deadlineLine: `Please pay ${outstanding} by ${formatDate(deadline, { year: true })}.`,
    upiLine: input.seller.upiVpa ? `UPI: ${input.seller.upiVpa}, for ${outstanding}` : "UPI: no UPI ID is saved in Settings.",
    upiUri,
    bank: { accountName: input.seller.businessName, ...SAMPLE_BANK },
    payLinkLine: input.payUrl ? `Pay link: ${input.payUrl}` : "Pay link: this Invoice has no pay link yet.",
    contactLine: input.seller.ownerEmail ? `Reply to ${input.seller.ownerEmail}` : null,
    signOff: `For ${input.seller.businessName}`,
    msmed:
      workings.length === 0
        ? null
        : {
            label: MSMED_BOX_LABEL,
            explanation: MSMED_EXPLAIN,
            totalLine: `Interest so far ${formatInr(interestPaise)}, on ${outstanding} still owed.`,
            lines: workings,
            aside: NOT_IN_DEMAND,
          },
  };
}

/** One page for odr.msme.gov.in. It does not say the portal is fast, or the only route. */
export function odrCaseFile(input: {
  seller: DocumentSeller;
  customer: DocumentCustomer;
  invoices: readonly DocumentInvoice[];
  reminders: readonly DocumentReminder[];
  calls: readonly DocumentCall[];
  today: string;
}): CaseFile {
  const { listed, lines, workings, interestPaise } = prepare(input.invoices, input.seller, input.today);
  const ids = new Set(listed.map((invoice) => invoice.$id));
  const numbers = new Map(listed.map((invoice) => [invoice.$id, invoice.number]));
  const reminders = input.reminders
    .filter((reminder) => ids.has(reminder.invoiceId))
    .sort((a, b) => (a.sentDate ?? "").localeCompare(b.sentDate ?? "") || a.stage - b.stage)
    .map((reminder) => {
      const which = numbers.size > 1 ? `${numbers.get(reminder.invoiceId) ?? "Invoice"}, ` : "";
      return {
        when: reminder.sentDate ? formatDate(reminder.sentDate, { weekday: false, year: true }) : "Date not recorded",
        text: `${which}${stageName(reminder.stage)}, ${statusWords(reminder.status)} ${channelWords(reminder.channel)}`,
      };
    });
  const spoken = input.calls
    .filter((call) => ids.has(call.invoiceId))
    .map((call) => ({ call, excerpt: transcriptExcerpt(call.transcript) }))
    .filter((item): item is { call: DocumentCall; excerpt: string } => item.excerpt !== null)
    .sort((a, b) => (b.call.startedAt ?? "").localeCompare(a.call.startedAt ?? ""));
  const chosen = spoken[0] ?? null;

  return {
    title: "ODR case file",
    dateLine: dated(input.today),
    fromName: input.seller.businessName,
    toName: input.customer.name,
    odrExplanation: ODR_EXPLAIN,
    steps: ODR_STEPS,
    invoices: lines,
    interestExplanation: MSMED_EXPLAIN,
    interestNote:
      workings.length === 0
        ? whyNoInterest(input.seller)
        : `Interest so far ${formatInr(interestPaise)}. This is general information, not legal advice.`,
    interestLines: workings,
    reminders,
    reminderNote: reminders.length === 0 ? NO_REMINDERS : null,
    transcriptWhen: chosen?.call.startedAt ? dated(chosen.call.startedAt.slice(0, 10)) : null,
    transcriptExcerpt: chosen?.excerpt ?? null,
    transcriptLine: chosen?.excerpt ?? NO_TRANSCRIPT,
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
    ...letter.invoices.flatMap((line) => [line.number, line.issued, line.due, line.outstanding]),
    letter.outstanding,
    letter.deadlineLine,
    letter.upiLine,
    "Bank transfer",
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
    ...file.invoices.flatMap((line) => [line.number, line.issued, line.due, line.outstanding]),
    file.interestExplanation,
    file.interestNote,
    ...file.interestLines,
    file.reminderNote ?? "",
    ...file.reminders.flatMap((line) => [line.when, line.text]),
    file.transcriptWhen ?? "",
    file.transcriptLine,
  ].join("\n");
}
