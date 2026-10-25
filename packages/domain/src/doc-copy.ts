// Words for the Payment Demand Letter and the ODR case file. English is the
// wording the existing pages print. Hindi and Bengali use the same glossary.
// Amounts in words: Hindi where money knows the words, English otherwise.
import { amountInWords, hindiRupees } from "@tagada/money";
import type { CustomerLang } from "./language.ts";

export type DocLang = CustomerLang;

type Kind = "Plan" | "Promise";

export type DocPhrases = {
  title: string;
  caseTitle: string;
  disclaimer: string;
  plan: string;
  promise: string;
  nothingDue: (name: string) => string;
  planBanner: (kind: Kind, name: string, what: "letter" | "case") => string;
  instalmentNote: (kind: Kind) => string;
  deadline: (amount: string, date: string) => string;
  upi: (vpa: string, amount: string) => string;
  noUpi: string;
  payLink: (url: string) => string;
  noPayLink: string;
  contact: (email: string) => string;
  signOff: (name: string) => string;
  interestTotal: (interest: string, principal: string) => string;
  interestAside: string;
  msmedLabel: string;
  msmedExplain: string;
  deductionHeading: string;
  deductionExplain: string;
  /** One Invoice: paid by `date`, the buyer may claim it in FY `year`; `sameYear` false once the Invoice's own year has passed. */
  deductionLine: (number: string, date: string, year: string, sameYear: boolean) => string;
  odrExplain: string;
  steps: readonly string[];
  bankHeading: string;
  bankNote: string;
  noInterestTrader: string;
  noInterestSize: string;
  noInterestNone: string;
  interestNote: (total: string) => string;
  restRate: (rate: string, days: number) => string;
  restSpan: (start: string, end: string) => string;
  restMonth: string;
  dateNotRecorded: string;
  noReminders: string;
  noTranscript: string;
  customerRole: string;
  stage: (name: string) => string;
  reminder: (stage: string, status: string, channel: string) => string;
  status: Record<"sent" | "retried" | "failed" | "queued" | "skipped_cap" | "ready", string>;
  channel: Record<"email" | "whatsapp_link" | "call", string>;
  /** The channel as a table cell: a noun, not "by email". */
  channelName: Record<"email" | "whatsapp_link" | "call", string>;
  udyamType: Record<"micro" | "small" | "medium", string>;
  payBy: (date: string) => string;
  scanOrOpen: string;
  headings: {
    notClaimed: string;
    to: string;
    invoices: string;
    issued: string;
    due: string;
    outstanding: string;
    howToPay: string;
    accountName: string;
    bank: string;
    accountNumber: string;
    ifsc: string;
    signatory: string;
    steps: string;
    forWhom: (name: string) => string;
    reminders: string;
    transcript: string;
    interest: string;
    reference: string;
    date: string;
    udyam: string;
    contact: string;
    number: string;
    total: string;
    amountDue: string;
    upi: string;
    notes: string;
    claimant: string;
    respondent: string;
    principal: string;
    interestSoFar: string;
    totalClaimed: string;
    period: string;
    rate: string;
    days: string;
    interestAmount: string;
    channel: string;
    stage: string;
    delivery: string;
    howToFile: string;
    said: string;
  };
  amountWords: (paise: number) => string;
};

const en: DocPhrases = {
  title: "Payment Demand Letter",
  caseTitle: "ODR case file",
  disclaimer: "This is not a GST or legal notice.",
  plan: "Plan",
  promise: "Promise",
  nothingDue: (name) => `Nothing is past due for ${name}.`,
  planBanner: (kind, name, what) =>
    `A ${kind} is agreed with ${name}. This ${what === "letter" ? "letter" : "case file"} goes against it.`,
  instalmentNote: (kind) => `Instalments past their date under the agreed ${kind}`,
  deadline: (amount, date) => `Please pay ${amount} by ${date}.`,
  upi: (vpa, amount) => `UPI: ${vpa}, for ${amount}`,
  noUpi: "UPI: no UPI ID is saved in Settings.",
  payLink: (url) => `Pay link: ${url}`,
  noPayLink: "Pay link: this Invoice has no pay link yet.",
  contact: (email) => `Reply to ${email}`,
  signOff: (name) => `For ${name}`,
  interestTotal: (interest, principal) =>
    `Interest so far ${interest}, on ${principal} owed past the MSMED due date.`,
  interestAside: "This interest is not added to the amount demanded above.",
  msmedLabel: "general information, not legal advice",
  msmedExplain:
    "MSMED is the Micro, Small and Medium Enterprises Development Act. A micro or small supplier that is not a trader may charge compound interest on a late payment, with a new rest each month, at three times the RBI Bank Rate. The figure is worked out by Tagada's interest code.",
  deductionHeading: "Section 43B(h) of the Income Tax Act",
  deductionExplain:
    "A buyer may claim what they owe a micro or small enterprise as an expense in the year of the Invoice only if they pay by the date the MSMED Act allows (the agreed date, at most 45 days). Paid later, it may be claimed only in the year it is paid. Whether this applies depends on the buyer's own accounts.",
  deductionLine: (number, date, year, sameYear) =>
    sameYear ? `${number}: paid by ${date}, it may be claimed in FY ${year}.` : `${number}: now claimed in the year it is paid; paid by ${date}, FY ${year}.`,
  odrExplain:
    "ODR is online dispute resolution. The government's portal for delayed payments to micro and small businesses is odr.msme.gov.in.",
  steps: [
    "Print this page. It lists the Invoices, the interest workings, the Reminder history and the call transcript excerpt.",
    "Open odr.msme.gov.in and sign in with the supplier's Udyam details.",
    "File a delayed-payment case and upload this page with the Invoices.",
    "Keep a copy of the filing. Tagada prepares this page and does not file the case.",
  ],
  bankHeading: "Bank transfer",
  bankNote: "Pay by bank transfer to this account.",
  noInterestTrader: "No MSMED interest is claimed. This seller is a trader.",
  noInterestSize: "No MSMED interest is claimed. This seller is not a micro or small Udyam enterprise.",
  noInterestNone: "No MSMED interest is claimed. Nothing here is overdue and unpaid.",
  interestNote: (total) => `${total} This is general information, not legal advice.`,
  restRate: (rate, days) => `${rate} for ${days} days`,
  restSpan: (start, end) => `${start} to ${end}`,
  restMonth: "Month",
  dateNotRecorded: "Date not recorded",
  noReminders: "No Reminders are stored for these Invoices yet.",
  noTranscript: "No call transcript is stored for these Invoices yet.",
  customerRole: "Customer",
  stage: (name) => name,
  reminder: (stage, status, channel) => `${stage}, ${status} ${channel}`,
  status: {
    sent: "sent",
    retried: "sent after a retry",
    failed: "failed",
    queued: "waiting to send",
    skipped_cap: "held for tomorrow",
    ready: "ready for you to send",
  },
  channel: { email: "by email", whatsapp_link: "on WhatsApp", call: "by phone" },
  channelName: { email: "Email", whatsapp_link: "WhatsApp", call: "Phone call" },
  udyamType: { micro: "Micro enterprise", small: "Small enterprise", medium: "Medium enterprise" },
  payBy: (date) => `Please pay by ${date}`,
  scanOrOpen: "Scan with any UPI app, or open the pay link.",
  headings: {
    to: "To",
    invoices: "Invoices",
    issued: "Issued",
    due: "Due",
    outstanding: "Outstanding",
    howToPay: "How to pay",
    accountName: "Account name",
    bank: "Bank",
    accountNumber: "Account number",
    ifsc: "IFSC",
    signatory: "Authorised signatory",
    steps: "Steps",
    forWhom: (name) => `For ${name}.`,
    reminders: "Reminder history",
    transcript: "Call transcript excerpt",
    interest: "Interest workings",
    notClaimed: "Not claimed",
    reference: "Ref.",
    date: "Date",
    udyam: "Udyam",
    contact: "Contact",
    number: "Invoice no.",
    total: "Total",
    amountDue: "Amount due",
    upi: "Pay by UPI",
    notes: "Notes",
    claimant: "Claimant (supplier)",
    respondent: "Respondent (buyer)",
    principal: "Principal past due",
    interestSoFar: "Interest so far",
    totalClaimed: "Total claimed",
    period: "Period",
    rate: "Rate",
    days: "Days",
    interestAmount: "Interest",
    channel: "Channel",
    stage: "Ladder step",
    delivery: "Delivery",
    howToFile: "How to file on odr.msme.gov.in",
    said: "Said on the call",
  },
  amountWords: amountInWords,
};

const hi: DocPhrases = {
  title: "बकाया भुगतान के लिए पत्र",
  caseTitle: "ओडीआर केस फ़ाइल",
  disclaimer: "यह जीएसटी या कानूनी नोटिस नहीं है।",
  plan: "किश्त योजना",
  promise: "वादा",
  nothingDue: (name) => `${name} का कोई भी बिल आखिरी तारीख के बाद बकाया नहीं है।`,
  planBanner: (kind, name, what) =>
    `${name} के साथ ${kind === "Plan" ? "एक किश्त योजना" : "एक वादा"} तय है। यह ${what === "letter" ? "पत्र" : "केस फ़ाइल"} उसी के हिसाब से बना है।`,
  instalmentNote: (kind) => `तय ${kind === "Plan" ? "किश्त योजना" : "वादे"} की वे किश्तें जिनकी तारीख निकल चुकी है`,
  deadline: (amount, date) => `कृपया ${amount} का भुगतान ${date} तक करें।`,
  upi: (vpa, amount) => `UPI: ${vpa}, ${amount} के लिए`,
  noUpi: "UPI: सेटिंग्स में कोई UPI ID सहेजा नहीं है।",
  payLink: (url) => `भुगतान लिंक: ${url}`,
  noPayLink: "भुगतान लिंक: इस बिल का लिंक अभी नहीं बना।",
  contact: (email) => `जवाब यहाँ भेजें: ${email}`,
  signOff: (name) => `${name} की ओर से`,
  interestTotal: (interest, principal) =>
    `अब तक ब्याज ${interest}, MSMED की आखिरी तारीख के बाद बकाया ${principal} पर।`,
  interestAside: "यह ब्याज ऊपर मांगी गई राशि में नहीं जोड़ा गया है।",
  msmedLabel: "सामान्य जानकारी, कानूनी सलाह नहीं",
  msmedExplain:
    "MSMED का मतलब है सूक्ष्म, लघु और मध्यम उद्यम विकास अधिनियम। जो सूक्ष्म या लघु आपूर्तिकर्ता व्यापारी नहीं है, वह देर से हुए भुगतान पर आरबीआई बैंक दर के तीन गुना पर चक्रवृद्धि ब्याज ले सकता है, जिसमें हर महीने ब्याज मूलधन में जुड़ता है। यह आंकड़ा Tagada के ब्याज कोड ने निकाला है।",
  deductionHeading: "आयकर अधिनियम की धारा 43B(h)",
  deductionExplain:
    "खरीदार किसी सूक्ष्म या लघु उद्यम को देय राशि बिल वाले साल के खर्च में तभी दिखा सकता है जब भुगतान MSMED अधिनियम की तय तारीख तक हो (तय तारीख, ज़्यादा से ज़्यादा 45 दिन)। बाद में भुगतान हुआ तो यह खर्च उसी साल में गिना जा सकता है जिस साल भुगतान हो। यह खरीदार के अपने हिसाब-किताब पर निर्भर है।",
  deductionLine: (number, date, year, sameYear) =>
    sameYear
      ? `${number}: ${date} तक भुगतान हुआ तो FY ${year} में खर्च दिखाया जा सकता है।`
      : `${number}: अब भुगतान वाले साल में गिना जाएगा; ${date} तक भुगतान हुआ तो FY ${year}।`,
  odrExplain:
    "ODR ऑनलाइन विवाद समाधान है। सूक्ष्म और लघु कारोबार के देर से भुगतान के लिए सरकार का पोर्टल odr.msme.gov.in है।",
  steps: [
    "यह पन्ना छापें। इसमें बिल, ब्याज का हिसाब, अनुस्मारक और कॉल का अंश है।",
    "odr.msme.gov.in खोलें और आपूर्तिकर्ता के उद्यम पंजीकरण से साइन इन करें।",
    "देर से भुगतान का मामला दर्ज करें और यह पन्ना बिलों के साथ अपलोड करें।",
    "दाखिल करने की एक प्रति रखें। Tagada यह पन्ना तैयार करता है, मामला दर्ज नहीं करता।",
  ],
  bankHeading: "बैंक ट्रांसफ़र",
  bankNote: "इस खाते में बैंक ट्रांसफ़र से भुगतान करें।",
  noInterestTrader: "MSMED ब्याज नहीं मांगा गया। यह विक्रेता व्यापारी है।",
  noInterestSize: "MSMED ब्याज नहीं मांगा गया। यह विक्रेता उद्यम में दर्ज सूक्ष्म या लघु उद्यम नहीं है।",
  noInterestNone: "MSMED ब्याज नहीं मांगा गया। यहाँ ऐसा कोई बिल नहीं है जिसकी तारीख निकल चुकी हो और भुगतान बाकी हो।",
  interestNote: (total) => `${total} यह सामान्य जानकारी है, कानूनी सलाह नहीं।`,
  restRate: (rate, days) => `${rate}, ${days} दिन`,
  restSpan: (start, end) => `${start} से ${end}`,
  restMonth: "महीना",
  dateNotRecorded: "तारीख दर्ज नहीं",
  noReminders: "इन बिलों के लिए अभी कोई अनुस्मारक दर्ज नहीं है।",
  noTranscript: "इन बिलों के लिए अभी कोई कॉल अंश दर्ज नहीं है।",
  customerRole: "ग्राहक",
  stage: (name) =>
    (
      {
        "Friendly heads-up": "हल्का अनुस्मारक",
        "Due-date reminder": "आखिरी तारीख का अनुस्मारक",
        "Overdue reminder with pay link": "बकाया का अनुस्मारक, भुगतान लिंक के साथ",
        "Reminder call": "अनुस्मारक कॉल",
        "Payment Demand Letter": "बकाया भुगतान के लिए पत्र",
        "ODR case file": "ओडीआर केस फ़ाइल",
      } as Record<string, string>
    )[name] ?? name,
  reminder: (stage, status, channel) => `${stage}, ${channel} ${status}`,
  status: {
    sent: "भेज दिया गया",
    retried: "दोबारा कोशिश के बाद भेजा गया",
    failed: "नहीं गया",
    queued: "भेजने की प्रतीक्षा",
    skipped_cap: "कल के लिए रोका गया",
    ready: "आपके भेजने के लिए तैयार",
  },
  channel: { email: "ईमेल से", whatsapp_link: "WhatsApp पर", call: "फ़ोन से" },
  channelName: { email: "ईमेल", whatsapp_link: "WhatsApp", call: "फ़ोन कॉल" },
  udyamType: { micro: "सूक्ष्म उद्यम", small: "लघु उद्यम", medium: "मध्यम उद्यम" },
  payBy: (date) => `कृपया ${date} तक भुगतान करें`,
  scanOrOpen: "किसी भी UPI ऐप से स्कैन करें, या भुगतान लिंक खोलें।",
  headings: {
    to: "प्रति",
    invoices: "बिल",
    issued: "जारी",
    due: "आखिरी तारीख",
    outstanding: "बकाया",
    howToPay: "भुगतान कैसे करें",
    accountName: "खाते का नाम",
    bank: "बैंक",
    accountNumber: "खाता संख्या",
    ifsc: "IFSC",
    signatory: "अधिकृत हस्ताक्षरकर्ता",
    steps: "कदम",
    forWhom: (name) => `${name} के लिए।`,
    reminders: "अनुस्मारक का इतिहास",
    transcript: "कॉल का अंश",
    interest: "ब्याज का हिसाब",
    notClaimed: "नहीं मांगा गया",
    reference: "संदर्भ",
    date: "तारीख",
    udyam: "उद्यम",
    contact: "संपर्क",
    number: "बिल संख्या",
    total: "कुल",
    amountDue: "देय राशि",
    upi: "UPI से भुगतान",
    notes: "टिप्पणियाँ",
    claimant: "दावेदार (आपूर्तिकर्ता)",
    respondent: "प्रतिवादी (खरीदार)",
    principal: "तारीख के बाद बकाया मूलधन",
    interestSoFar: "अब तक ब्याज",
    totalClaimed: "कुल दावा",
    period: "अवधि",
    rate: "दर",
    days: "दिन",
    interestAmount: "ब्याज",
    channel: "माध्यम",
    stage: "सीढ़ी का कदम",
    delivery: "स्थिति",
    howToFile: "odr.msme.gov.in पर कैसे दाखिल करें",
    said: "कॉल पर कहा गया",
  },
  amountWords: hindiRupees,
};

const bn: DocPhrases = {
  title: "বকেয়া পরিশোধের চিঠি",
  caseTitle: "ওডিআর কেস ফাইল",
  disclaimer: "এটি কোনো জিএসটি বা আইনি নোটিশ নয়।",
  plan: "কিস্তির পরিকল্পনা",
  promise: "প্রতিশ্রুতি",
  nothingDue: (name) => `${name}-এর কোনো বিলের শেষ তারিখ পেরিয়ে টাকা বাকি নেই।`,
  planBanner: (kind, name, what) =>
    `${name}-এর সঙ্গে ${kind === "Plan" ? "একটি কিস্তির পরিকল্পনা" : "একটি প্রতিশ্রুতি"} ঠিক হয়েছে। এই ${what === "letter" ? "চিঠি" : "কেস ফাইল"} সেই অনুযায়ী তৈরি।`,
  instalmentNote: (kind) =>
    `ঠিক করা ${kind === "Plan" ? "কিস্তির পরিকল্পনার" : "প্রতিশ্রুতির"} যে কিস্তিগুলোর তারিখ পেরিয়ে গেছে`,
  deadline: (amount, date) => `অনুগ্রহ করে ${amount} ${date}-এর মধ্যে দিন।`,
  upi: (vpa, amount) => `UPI: ${vpa}, ${amount}-এর জন্য`,
  noUpi: "UPI: সেটিংসে কোনো UPI ID সেভ নেই।",
  payLink: (url) => `পেমেন্ট লিঙ্ক: ${url}`,
  noPayLink: "পেমেন্ট লিঙ্ক: এই বিলের লিঙ্ক এখনও নেই।",
  contact: (email) => `উত্তর পাঠান: ${email}`,
  signOff: (name) => `${name}-এর পক্ষ থেকে`,
  interestTotal: (interest, principal) =>
    `এখন পর্যন্ত সুদ ${interest}, MSMED-এর শেষ তারিখের পর বকেয়া ${principal}-এর উপর।`,
  interestAside: "এই সুদ উপরের দাবিকৃত টাকার সঙ্গে যোগ হয়নি।",
  msmedLabel: "সাধারণ তথ্য, আইনি পরামর্শ নয়",
  msmedExplain:
    "MSMED মানে ক্ষুদ্র, ছোট ও মাঝারি উদ্যোগ উন্নয়ন আইন। যে ক্ষুদ্র বা ছোট সরবরাহকারী ব্যবসায়ী নন, তিনি দেরিতে পাওয়া টাকার উপর আরবিআই ব্যাংক রেটের তিন গুণ হারে চক্রবৃদ্ধি সুদ নিতে পারেন, যেখানে প্রতি মাসে সুদ আসলের সঙ্গে যোগ হয়। অঙ্কটি Tagada-র সুদের কোড হিসাব করেছে।",
  deductionHeading: "আয়কর আইনের ধারা 43B(h)",
  deductionExplain:
    "ক্রেতা কোনো ক্ষুদ্র বা ছোট উদ্যোগের বকেয়া টাকা বিলের বছরের খরচে তখনই দেখাতে পারেন, যখন MSMED আইনের নির্দিষ্ট তারিখের মধ্যে পেমেন্ট হয় (ঠিক করা তারিখ, বড়জোর 45 দিন)। পরে পেমেন্ট হলে খরচটি যে বছরে পেমেন্ট হবে সেই বছরে গণ্য হতে পারে। এটা ক্রেতার নিজের হিসাবের ওপর নির্ভর করে।",
  deductionLine: (number, date, year, sameYear) =>
    sameYear
      ? `${number}: ${date}-এর মধ্যে পেমেন্ট হলে FY ${year}-এর খরচে দেখানো যায়।`
      : `${number}: এখন পেমেন্টের বছরে গণ্য হবে; ${date}-এর মধ্যে পেমেন্ট হলে FY ${year}।`,
  odrExplain:
    "ODR হল অনলাইন বিরোধ নিষ্পত্তি। ক্ষুদ্র ও ছোট ব্যবসার দেরিতে পেমেন্টের জন্য সরকারের পোর্টাল odr.msme.gov.in।",
  steps: [
    "এই পাতা ছাপুন। এতে বিল, সুদের হিসাব, অনুস্মারক এবং কলের অংশ আছে।",
    "odr.msme.gov.in খুলুন এবং সরবরাহকারীর উদ্যম নিবন্ধন দিয়ে সাইন ইন করুন।",
    "দেরিতে পেমেন্টের মামলা দাখিল করুন এবং এই পাতা বিলের সঙ্গে আপলোড করুন।",
    "দাখিলের একটি কপি রাখুন। Tagada এই পাতা তৈরি করে, মামলা দাখিল করে না।",
  ],
  bankHeading: "ব্যাংক ট্রান্সফার",
  bankNote: "এই অ্যাকাউন্টে ব্যাংক ট্রান্সফারে টাকা দিন।",
  noInterestTrader: "MSMED সুদ চাওয়া হয়নি। এই বিক্রেতা ব্যবসায়ী।",
  noInterestSize: "MSMED সুদ চাওয়া হয়নি। এই বিক্রেতা উদ্যমে নথিভুক্ত ক্ষুদ্র বা ছোট উদ্যোগ নন।",
  noInterestNone: "MSMED সুদ চাওয়া হয়নি। এখানে এমন কোনো বিল নেই যার তারিখ পেরিয়েছে আর টাকা বাকি।",
  interestNote: (total) => `${total} এটি সাধারণ তথ্য, আইনি পরামর্শ নয়।`,
  restRate: (rate, days) => `${rate}, ${days} দিন`,
  restSpan: (start, end) => `${start} থেকে ${end}`,
  restMonth: "মাস",
  dateNotRecorded: "তারিখ লেখা নেই",
  noReminders: "এই বিলগুলোর জন্য এখনও কোনো অনুস্মারক নেই।",
  noTranscript: "এই বিলগুলোর জন্য এখনও কোনো কলের অংশ নেই।",
  customerRole: "গ্রাহক",
  stage: (name) =>
    (
      {
        "Friendly heads-up": "হালকা অনুস্মারক",
        "Due-date reminder": "শেষ তারিখের অনুস্মারক",
        "Overdue reminder with pay link": "বকেয়ার অনুস্মারক, পেমেন্ট লিঙ্কসহ",
        "Reminder call": "অনুস্মারক কল",
        "Payment Demand Letter": "বকেয়া পরিশোধের চিঠি",
        "ODR case file": "ওডিআর কেস ফাইল",
      } as Record<string, string>
    )[name] ?? name,
  reminder: (stage, status, channel) => `${stage}, ${channel} ${status}`,
  status: {
    sent: "পাঠানো হয়েছে",
    retried: "আবার চেষ্টার পর পাঠানো হয়েছে",
    failed: "যায়নি",
    queued: "পাঠানোর অপেক্ষায়",
    skipped_cap: "কালকের জন্য রাখা হয়েছে",
    ready: "আপনার পাঠানোর জন্য তৈরি",
  },
  channel: { email: "ইমেলে", whatsapp_link: "WhatsApp-এ", call: "ফোনে" },
  channelName: { email: "ইমেল", whatsapp_link: "WhatsApp", call: "ফোন কল" },
  udyamType: { micro: "ক্ষুদ্র উদ্যোগ", small: "ছোট উদ্যোগ", medium: "মাঝারি উদ্যোগ" },
  payBy: (date) => `অনুগ্রহ করে ${date}-এর মধ্যে দিন`,
  scanOrOpen: "যেকোনো UPI অ্যাপে স্ক্যান করুন, বা পেমেন্ট লিঙ্ক খুলুন।",
  headings: {
    to: "প্রতি",
    invoices: "বিল",
    issued: "জারি",
    due: "শেষ তারিখ",
    outstanding: "বকেয়া",
    howToPay: "কীভাবে দেবেন",
    accountName: "অ্যাকাউন্টের নাম",
    bank: "ব্যাংক",
    accountNumber: "অ্যাকাউন্ট নম্বর",
    ifsc: "IFSC",
    signatory: "অনুমোদিত স্বাক্ষরকারী",
    steps: "ধাপ",
    forWhom: (name) => `${name}-এর জন্য।`,
    reminders: "অনুস্মারকের ইতিহাস",
    transcript: "কলের অংশ",
    interest: "সুদের হিসাব",
    notClaimed: "চাওয়া হয়নি",
    reference: "সূত্র",
    date: "তারিখ",
    udyam: "উদ্যম",
    contact: "যোগাযোগ",
    number: "বিল নম্বর",
    total: "মোট",
    amountDue: "দেয় টাকা",
    upi: "UPI-তে দিন",
    notes: "টীকা",
    claimant: "দাবিদার (সরবরাহকারী)",
    respondent: "বিবাদী (ক্রেতা)",
    principal: "তারিখ পেরোনো আসল",
    interestSoFar: "এখন পর্যন্ত সুদ",
    totalClaimed: "মোট দাবি",
    period: "সময়কাল",
    rate: "হার",
    days: "দিন",
    interestAmount: "সুদ",
    channel: "মাধ্যম",
    stage: "সিঁড়ির ধাপ",
    delivery: "অবস্থা",
    howToFile: "odr.msme.gov.in-এ কীভাবে দাখিল করবেন",
    said: "কলে যা বলা হয়েছে",
  },
  amountWords: amountInWords,
};

export const DOC_PHRASES = { en, hi, bn } satisfies Record<DocLang, DocPhrases>;

export function docPhrases(lang: DocLang | null | undefined): DocPhrases {
  return lang === "hi" || lang === "bn" ? DOC_PHRASES[lang] : en;
}
