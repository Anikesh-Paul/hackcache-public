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
  sumPaise,
  upiPayUri,
} from "@tagada/money";
import { stripTags } from "./call.ts";
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
  nothingDue: string | null;
  planBanner: string | null;
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
  what: "letter" | "case file",
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
      issued: dated(invoice.issueDate),
      due: dated(invoice.dueDate),
      outstanding: formatInr(due.paise),
      note: due.agreed ? `Instalments past their date under the agreed ${kindOf(due.agreed)}` : null,
    });
    balances.push(due.paise);
    const meter = msmedInterest(seller, invoice, standing, today);
    if (!meter) continue;
    interests.push(meter.interestPaise);
    principals.push(meter.principalPaise);
    for (const rest of meter.rests) workings.push(restLine(invoice.number, rest));
  }
  const outstandingPaise = sumPaise(balances);
  const interestPaise = sumPaise(interests);
  // Only the Invoices past their appointed day earn interest, so the total names that amount, not all that is owed.
  const interestTotal = `Interest so far ${formatInr(interestPaise)}, on ${formatInr(sumPaise(principals))} owed past the MSMED due date.`;
  const [first] = agreed;
  return {
    listed,
    lines,
    outstandingPaise,
    outstanding: formatInr(outstandingPaise),
    workings,
    interestTotal,
    nothingDue: listed.length === 0 ? `Nothing is past due for ${customer.name}.` : null,
    planBanner: first ? `A ${kindOf(first)} is agreed with ${customer.name}. This ${what} goes against it.` : null,
  };
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
    lines.push(`${role === "agent" ? "Munim" : "Customer"}: ${said}`);
  }
  return lines.length > 0 ? lines.join("\n") : null;
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
}): DemandLetter {
  const { listed, lines, outstandingPaise, outstanding, workings, interestTotal, nothingDue, planBanner } = prepare(
    input.invoices,
    input.promises ?? [],
    input.customer,
    input.seller,
    input.today,
    "letter",
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
    nothingDue,
    planBanner,
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
            totalLine: interestTotal,
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
  promises?: readonly DocumentPromise[];
  reminders: readonly DocumentReminder[];
  calls: readonly DocumentCall[];
  today: string;
}): CaseFile {
  const { listed, lines, workings, interestTotal, nothingDue, planBanner } = prepare(
    input.invoices,
    input.promises ?? [],
    input.customer,
    input.seller,
    input.today,
    "case file",
  );
  const ids = new Set(listed.map((invoice) => invoice.$id));
  const numbers = new Map(listed.map((invoice) => [invoice.$id, invoice.number]));
  const reminders = input.reminders
    .filter((reminder) => ids.has(reminder.invoiceId))
    .sort((a, b) => (a.sentDate ?? "").localeCompare(b.sentDate ?? "") || a.stage - b.stage)
    .map((reminder) => {
      const which = numbers.size > 1 ? `${numbers.get(reminder.invoiceId) ?? "Invoice"}, ` : "";
      return {
        when: reminder.sentDate ? dated(reminder.sentDate) : "Date not recorded",
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
    nothingDue,
    planBanner,
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
        : `${interestTotal} This is ${MSMED_BOX_LABEL}.`,
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
    letter.nothingDue ?? "",
    letter.planBanner ?? "",
    ...letter.invoices.flatMap((line) => [line.number, line.issued, line.due, line.outstanding, line.note ?? ""]),
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
