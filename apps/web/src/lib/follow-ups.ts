// Today's follow-ups: what the Ladder wants on the Demo date, each with its
// ready message, and what the daily run already did about it. An Invoice whose
// money is already in the bank is not chased: its line asks the Owner to confirm it.
import type { CustomerRow, EventRow, InvoiceRow, ReminderRow, WorkspaceRow } from "@tagada/appwrite";
import {
  LADDER_STAGES,
  REMINDER_NAMES,
  isCustomerLang,
  ladderDay,
  reminderMessage,
  sendFailureWords,
  waitingInBank,
  whatsappLink,
  type BankSuggestion,
  type PromiseFacts,
} from "@tagada/domain";
import { differencePaise, formatInr, sumPaise } from "@tagada/money";
import { istTime } from "./pricing.ts";

/**
 * `sent`: went out today. `failed`: the last try failed; the run tries again.
 * `in_bank`: the money is in the bank, waiting for the Owner to confirm it.
 * `ready`: waits for the Owner. `capped`: the Customer already had a message
 * today. `due`: an automatic stage the daily run has not reached yet.
 */
export type FollowUpState = "failed" | "in_bank" | "ready" | "capped" | "due" | "sent";

export type FollowUp = {
  invoiceId: string;
  customerName: string;
  number: string;
  stage: number;
  stageName: string;
  amountPaise: number;
  state: FollowUpState;
  /** "HH:MM" IST, when sent. */
  sentAt: string | null;
  channel: ReminderRow["channel"] | null;
  /** One plain sentence; the provider's own error stays on the Reminder row. */
  error: string | null;
  /** For `in_bank`, one line per Bank credit: "₹23,810 from Roy Furnishings is in your bank." */
  inBankLine: string | null;
  subject: string;
  text: string;
  whatsapp: string;
  mailto: string;
  /** The Customer agreed to reminder calls, and this is the call's stage. */
  canCall: boolean;
  /** What the Owner prepares at this stage, besides the message. */
  document: "letter" | "case_file" | null;
};

export type FollowUpInput = {
  workspace: Pick<WorkspaceRow, "today" | "autoSendStages" | "businessName" | "ownerEmail">;
  invoices: readonly InvoiceRow[];
  customers: ReadonlyMap<string, CustomerRow>;
  promisesByInvoice: ReadonlyMap<string, PromiseFacts[]>;
  reminders: readonly ReminderRow[];
  events: readonly EventRow[];
  bankCredits: readonly BankSuggestion[];
  payUrl: (token: string | null) => string;
};

const ORDER: FollowUpState[] = ["failed", "in_bank", "ready", "capped", "due", "sent"];

export function followUps(input: FollowUpInput): FollowUp[] {
  const { workspace, customers } = input;
  const today = workspace.today;
  const byKey = new Map(input.reminders.map((r) => [`${r.invoiceId}:${r.stage}`, r]));
  const eventById = new Map(input.events.map((e) => [e.$id, e]));

  const item = (invoice: InvoiceRow, stage: number, state: FollowUpState, reminder: ReminderRow | undefined): FollowUp => {
    const customer = customers.get(invoice.customerId);
    const amountPaise = differencePaise(invoice.totalPaise, invoice.paidPaise);
    const lang = customer?.lang ?? "en";
    const message =
      stage >= 1 && stage <= REMINDER_NAMES.length
        ? reminderMessage({
            stage,
            lang: isCustomerLang(lang) ? lang : "en",
            businessName: workspace.businessName,
            customerName: customer?.name ?? "",
            number: invoice.number,
            amountPaise,
            dueDate: invoice.dueDate,
            today,
            payUrl: input.payUrl(invoice.payToken),
            contact: workspace.ownerEmail ?? workspace.businessName,
          })
        : { subject: "", text: "" };
    const sentEvent = reminder ? eventById.get(`${reminder.$id}e`) : undefined;
    return {
      invoiceId: invoice.$id,
      customerName: customer?.name ?? "A Customer",
      number: invoice.number,
      stage,
      stageName: REMINDER_NAMES[stage - 1] ?? LADDER_STAGES[stage - 1]?.name ?? "",
      amountPaise,
      state,
      sentAt: state === "sent" && sentEvent ? istTime(sentEvent.at) : null,
      channel: reminder?.channel ?? null,
      error: state === "failed" ? sendFailureWords(reminder?.error) : null,
      inBankLine: null,
      subject: message.subject,
      text: message.text,
      whatsapp: whatsappLink(customer?.phone ?? null, message.text),
      mailto: `mailto:${customer?.email ?? ""}?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.text)}`,
      canCall: stage === 4 && customer?.consentCalls === true,
      document: stage === 5 ? "letter" : stage === 6 ? "case_file" : null,
    };
  };

  const out: FollowUp[] = [];
  const sentToday = input.reminders.filter((r) => r.status === "sent" && r.sentDate === today);
  for (const r of sentToday) {
    const invoice = input.invoices.find((i) => i.$id === r.invoiceId);
    if (invoice) out.push(item(invoice, r.stage, "sent", r));
  }
  const waiting = waitingInBank(input.bankCredits, input.invoices);
  // One line per credit, for the money as it came in, naming the Invoices it pays.
  for (const credit of input.bankCredits) {
    if (credit.matchStatus !== "suggested") continue;
    const paid = credit.allocations
      .map((a) => input.invoices.find((i) => i.$id === a.invoiceId))
      .filter((i): i is InvoiceRow => i !== undefined && waiting.has(i.$id));
    const [first] = paid;
    if (!first) continue;
    const inBankPaise = credit.amountPaise ?? sumPaise(credit.allocations.map((a) => a.amountPaise));
    const line = item(first, 0, "in_bank", undefined);
    out.push({
      ...line,
      number: paid.map((i) => i.number).join(", "),
      stageName: "",
      amountPaise: inBankPaise,
      subject: "",
      text: "",
      inBankLine: `${formatInr(inBankPaise)} from ${line.customerName} is in your bank.`,
    });
  }
  const steps = ladderDay({
    invoices: input.invoices.filter((i) => !waiting.has(i.$id)),
    promises: input.invoices.flatMap((i) => (input.promisesByInvoice.get(i.$id) ?? []).map((p) => ({ ...p, invoiceId: i.$id }))),
    today,
    autoSendStages: workspace.autoSendStages,
    sentToday: sentToday.map((r) => r.customerId),
  });
  for (const step of steps) {
    const invoice = input.invoices.find((i) => i.$id === step.invoiceId);
    if (!invoice) continue;
    const reminder = byKey.get(`${step.invoiceId}:${step.stage}`);
    const state: FollowUpState =
      reminder?.status === "failed"
        ? "failed"
        : step.send === "capped" || reminder?.status === "skipped_cap"
          ? "capped"
          : step.send === "owner" || reminder?.status === "skipped_stage_off"
            ? "ready"
            : "due";
    out.push(item(invoice, step.stage, state, reminder));
  }
  return out.sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state));
}
