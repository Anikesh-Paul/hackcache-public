// The five written reminders (heads-up, due today, overdue, firm, final
// before the letter), in the Customer's preferred language. The same words go
// out by email from the daily run and on WhatsApp from the Owner's phone.
import { daysBetween, formatDate, formatInr, hindiDate } from "@tagada/money";
import { spokenName } from "./call.ts";
import type { CustomerLang } from "./language.ts";
import type { DeductionClock } from "./msmed.ts";

/** One template per message stage, stage 1 first. Stage 6, the ODR case file, has none. */
export const REMINDER_TEMPLATES = ["heads_up", "due_today", "overdue", "firm", "final"] as const;

/** What each message is called on Owner screens and in the timeline, stage 1 first. */
export const REMINDER_NAMES = [
  "Friendly heads-up",
  "Due-date reminder",
  "Overdue reminder with pay link",
  "Firm reminder",
  "Final reminder",
] as const;

export type ReminderFacts = {
  stage: number;
  lang: CustomerLang;
  businessName: string;
  customerName: string;
  number: string;
  /** Still owed. */
  amountPaise: number;
  dueDate: string;
  /** The Demo date. */
  today: string;
  payUrl: string;
  /** Who the Customer can reply to: the Owner's email or phone. */
  contact: string;
  /** Section 43B(h), when the seller is covered (see `section43bh`). Named from the overdue reminder on. */
  deduction?: DeductionClock | null;
};

/** The first stage that names Section 43B(h): the friendly heads-up and the due-date reminder never do. */
const DEDUCTION_FROM_STAGE = 3;

type Words = { amount: string; date: string; late: number; f: ReminderFacts };

const EN: ((w: Words) => [subject: string, body: string])[] = [
  ({ amount, date, f }) => [
    `Coming up: Invoice ${f.number}, ${amount} due ${date}`,
    `Hello ${f.customerName}, a friendly reminder from ${f.businessName}: Invoice ${f.number} for ${amount} is due on ${date}. You can pay here: ${f.payUrl}`,
  ],
  // Sent late (an earlier try failed), it says when it was due, never "today".
  ({ amount, date, late, f }) =>
    late > 0
      ? [
          `Was due ${date}: Invoice ${f.number}, ${amount}`,
          `Hello ${f.customerName}, Invoice ${f.number} for ${amount} from ${f.businessName} was due on ${date}. You can pay here: ${f.payUrl}`,
        ]
      : [
          `Due today: Invoice ${f.number}, ${amount}`,
          `Hello ${f.customerName}, Invoice ${f.number} for ${amount} from ${f.businessName} is due today. You can pay here: ${f.payUrl}`,
        ],
  ({ amount, date, late, f }) => [
    `Overdue: Invoice ${f.number}, ${amount}`,
    `Hello ${f.customerName}, Invoice ${f.number} for ${amount} was due on ${date}, ${late} days ago. Please pay here, or tell us a date that works: ${f.payUrl}`,
  ],
  ({ amount, late, f }) => [
    `${late} days overdue: Invoice ${f.number}, ${amount}`,
    `Hello ${f.customerName}, Invoice ${f.number} for ${amount} is now ${late} days overdue. Please pay this week, or agree instalments with us here: ${f.payUrl}`,
  ],
  ({ amount, late, f }) => [
    `Final reminder: Invoice ${f.number}, ${amount}`,
    `Hello ${f.customerName}, Invoice ${f.number} for ${amount} is ${late} days overdue. If it is not paid within 7 days, we will have to send a Payment Demand Letter. You can pay here: ${f.payUrl}`,
  ],
];

const HI: ((w: Words) => [subject: string, body: string])[] = [
  ({ amount, f }) => [
    `याद दिलाना: बिल ${f.number}, ${amount}`,
    `नमस्ते ${spokenName(f.customerName)} जी, ${f.businessName} की ओर से याद दिला रहे हैं: बिल ${f.number} के ${amount} ${hindiDate(f.dueDate)} को देय हैं। यहाँ से भुगतान करें: ${f.payUrl}`,
  ],
  ({ amount, late, f }) =>
    late > 0
      ? [
          `देय तारीख बीती: बिल ${f.number}, ${amount}`,
          `नमस्ते ${spokenName(f.customerName)} जी, ${f.businessName} का बिल ${f.number} के ${amount} ${hindiDate(f.dueDate)} को देय थे। यहाँ से भुगतान करें: ${f.payUrl}`,
        ]
      : [
          `आज देय: बिल ${f.number}, ${amount}`,
          `नमस्ते ${spokenName(f.customerName)} जी, ${f.businessName} का बिल ${f.number} के ${amount} आज देय हैं। यहाँ से भुगतान करें: ${f.payUrl}`,
        ],
  ({ amount, late, f }) => [
    `बकाया: बिल ${f.number}, ${amount}`,
    `नमस्ते ${spokenName(f.customerName)} जी, बिल ${f.number} के ${amount} ${hindiDate(f.dueDate)} को देय थे, आज ${late} दिन हो गए। कृपया यहाँ से भुगतान करें, या कोई तारीख बता दें: ${f.payUrl}`,
  ],
  ({ amount, late, f }) => [
    `${late} दिन से बकाया: बिल ${f.number}, ${amount}`,
    `नमस्ते ${spokenName(f.customerName)} जी, बिल ${f.number} के ${amount} अब ${late} दिन से बकाया हैं। कृपया इस हफ़्ते भुगतान करें, या यहाँ किश्तें तय करें: ${f.payUrl}`,
  ],
  ({ amount, late, f }) => [
    `आख़िरी याद: बिल ${f.number}, ${amount}`,
    `नमस्ते ${spokenName(f.customerName)} जी, बिल ${f.number} के ${amount} ${late} दिन से बकाया हैं। 7 दिन में भुगतान न हुआ तो हमें Payment Demand Letter (भुगतान माँग पत्र) भेजना होगा। यहाँ से भुगतान करें: ${f.payUrl}`,
  ],
];

const BN: ((w: Words) => [subject: string, body: string])[] = [
  ({ amount, date, f }) => [
    `মনে করিয়ে দেওয়া: বিল ${f.number}, ${amount}`,
    `নমস্কার ${f.customerName}, ${f.businessName}-এর পক্ষ থেকে মনে করিয়ে দিচ্ছি: বিল ${f.number}-এর ${amount} ${date} তারিখে দেয়। এখানে পেমেন্ট করুন: ${f.payUrl}`,
  ],
  ({ amount, date, late, f }) =>
    late > 0
      ? [
          `দেয় তারিখ পেরিয়েছে: বিল ${f.number}, ${amount}`,
          `নমস্কার ${f.customerName}, ${f.businessName}-এর বিল ${f.number}-এর ${amount} ${date} তারিখে দেয় ছিল। এখানে পেমেন্ট করুন: ${f.payUrl}`,
        ]
      : [
          `আজ দেয়: বিল ${f.number}, ${amount}`,
          `নমস্কার ${f.customerName}, ${f.businessName}-এর বিল ${f.number}-এর ${amount} আজ দেয়। এখানে পেমেন্ট করুন: ${f.payUrl}`,
        ],
  ({ amount, date, late, f }) => [
    `বাকি: বিল ${f.number}, ${amount}`,
    `নমস্কার ${f.customerName}, বিল ${f.number}-এর ${amount} ${date} তারিখে দেয় ছিল, আজ ${late} দিন হয়ে গেল। এখানে পেমেন্ট করুন, বা একটা তারিখ জানান: ${f.payUrl}`,
  ],
  ({ amount, late, f }) => [
    `${late} দিন বাকি: বিল ${f.number}, ${amount}`,
    `নমস্কার ${f.customerName}, বিল ${f.number}-এর ${amount} এখন ${late} দিন বাকি। এই সপ্তাহে পেমেন্ট করুন, বা এখানে কিস্তি ঠিক করুন: ${f.payUrl}`,
  ],
  ({ amount, late, f }) => [
    `শেষ অনুরোধ: বিল ${f.number}, ${amount}`,
    `নমস্কার ${f.customerName}, বিল ${f.number}-এর ${amount} ${late} দিন বাকি। ৭ দিনের মধ্যে পেমেন্ট না হলে আমাদের Payment Demand Letter পাঠাতে হবে। এখানে পেমেন্ট করুন: ${f.payUrl}`,
  ],
];

const CONTACT: Record<CustomerLang, (f: ReminderFacts) => string> = {
  en: (f) => `Questions? Reply to this message or write to ${f.contact}. ${f.businessName}`,
  hi: (f) => `कोई सवाल? ${f.contact} पर लिखें। ${f.businessName}`,
  bn: (f) => `কোনো প্রশ্ন? ${f.contact}-এ লিখুন। ${f.businessName}`,
};

// "May": whether a buyer can deduct the bill at all depends on their own books, which Tagada does not know.
const DEDUCTION: Record<CustomerLang, (d: DeductionClock) => string> = {
  en: (d) =>
    d.sameYear
      ? `Paid by ${formatDate(d.claimBy, { weekday: false, year: true })}, you may claim this bill as an expense in FY ${d.claimYear}. Paid later, Section 43B(h) of the Income Tax Act moves the claim to the year it is paid.`
      : `Under Section 43B(h) of the Income Tax Act, this bill may now be claimed as an expense only in the year it is paid: paid by ${formatDate(d.claimBy, { weekday: false, year: true })}, that is FY ${d.claimYear}.`,
  hi: (d) =>
    d.sameYear
      ? `${hindiDate(d.claimBy)} तक भुगतान होने पर आप यह बिल FY ${d.claimYear} के खर्च में दिखा सकते हैं। बाद में भुगतान हुआ तो आयकर अधिनियम की धारा 43B(h) के तहत यह खर्च उसी साल में गिना जाएगा जिस साल भुगतान होगा।`
      : `आयकर अधिनियम की धारा 43B(h) के तहत यह बिल अब उसी साल के खर्च में गिना जा सकता है जिस साल इसका भुगतान हो: ${hindiDate(d.claimBy)} तक भुगतान हुआ तो FY ${d.claimYear} में।`,
  bn: (d) =>
    d.sameYear
      ? `${formatDate(d.claimBy, { weekday: false, year: true })}-এর মধ্যে পেমেন্ট হলে আপনি এই বিল FY ${d.claimYear}-এর খরচে দেখাতে পারেন। পরে পেমেন্ট হলে আয়কর আইনের ধারা 43B(h) অনুযায়ী খরচটি যে বছরে পেমেন্ট হবে সেই বছরে গণ্য হবে।`
      : `আয়কর আইনের ধারা 43B(h) অনুযায়ী এই বিল এখন শুধু যে বছরে পেমেন্ট হবে সেই বছরের খরচে গণ্য হতে পারে: ${formatDate(d.claimBy, { weekday: false, year: true })}-এর মধ্যে পেমেন্ট হলে FY ${d.claimYear}-এ।`,
};

/** The Section 43B(h) sentence the reminders carry, for Munim to say too. */
export function deductionWords(lang: CustomerLang, clock: DeductionClock): string {
  return DEDUCTION[lang](clock);
}

/**
 * The same fact for Munim to say aloud, in Hindi: the date in words and no
 * year digits, since Munim never reads digits out.
 */
export function deductionSpoken(clock: DeductionClock): string {
  return clock.sameYear
    ? `${hindiDate(clock.claimBy)} तक भुगतान हो जाए तो आप यह बिल उसी वित्त वर्ष के खर्च में दिखा सकते हैं जिसका यह बिल है। बाद में भुगतान होने पर आयकर की धारा 43B(h) के तहत यह खर्च भुगतान वाले साल में गिना जाता है।`
    : `आयकर की धारा 43B(h) के तहत यह बिल अब उसी साल के खर्च में गिना जा सकता है जिस साल इसका भुगतान हो। ${hindiDate(clock.claimBy)} तक भुगतान हो जाए तो इसी वित्त वर्ष में।`;
}

const BY_LANG: Record<CustomerLang, typeof EN> = { en: EN, hi: HI, bn: BN };

/** The reminder for one Ladder stage (1 to 5): an email subject, and the text for email and WhatsApp alike. */
export function reminderMessage(f: ReminderFacts): { subject: string; text: string } {
  const template = BY_LANG[f.lang][f.stage - 1];
  if (!template) throw new Error(`no reminder for stage ${f.stage}`);
  const [subject, body] = template({
    amount: formatInr(f.amountPaise),
    date: formatDate(f.dueDate, { weekday: false }),
    late: Math.max(0, daysBetween(f.dueDate, f.today)),
    f,
  });
  const deduction = f.deduction && f.stage >= DEDUCTION_FROM_STAGE ? `\n\n${deductionWords(f.lang, f.deduction)}` : "";
  return { subject, text: `${body}${deduction}\n\n${CONTACT[f.lang](f)}` };
}
