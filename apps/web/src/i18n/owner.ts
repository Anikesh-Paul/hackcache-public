// Owner-screen words that the header language switches. Product words stay
// consistent: Customer ग्राहक/গ্রাহক, Invoice बिल/বিল, Plan योजना/পরিকল্পনা,
// Promise वादा/প্রতিশ্রুতি, Dispute आपत्ति/আপত্তি.
import type { Lang } from "../lib/prefs.ts";

export type OwnerCopy = {
  salaryCovered: string;
  salaryToday: string;
  salaryTomorrow: string;
  salaryIn: (days: number) => string;
  eightSteps: string;
  eightStepsFresh: string;
  aiCalls: string;
  expectedSales: (from: string, weekly: string) => string;
  resumeTour: (step: number, total: number) => string;
  tourProgress: (step: number, total: number) => string;
  next: string;
  back: string;
  endTour: string;
  seeProof: string;
  openInBank: string;
  openInvoice: string;
  approve: string;
  decline: string;
  markRead: string;
  assign: string;
  showSuggestion: string;
  keepAdvance: (amount: string, name: string) => string;
  scan: string;
  sampleCall: string;
  hideSample: string;
  tourTitles: readonly string[];
};

const en: OwnerCopy = {
  salaryCovered: "Salary covered",
  salaryToday: "Salary day today",
  salaryTomorrow: "Salary day tomorrow",
  salaryIn: (days) => `Salary day in ${days} days`,
  eightSteps: "Eight steps, and the app moves for you",
  eightStepsFresh: "Eight steps, from a fresh copy of the books",
  aiCalls: "AI calls",
  expectedSales: (from, weekly) => `From ${from}, with ${weekly} a week of expected new sales, from your last 3 months.`,
  resumeTour: (step, total) => `Resume tour (step ${step} of ${total})`,
  tourProgress: (step, total) => `step ${step} of ${total}`,
  next: "Next",
  back: "Back",
  endTour: "End the tour",
  seeProof: "See the proof",
  openInBank: "Open in Bank",
  openInvoice: "Open Invoice",
  approve: "Approve",
  decline: "Decline",
  markRead: "Mark as read",
  assign: "Assign to a Customer",
  showSuggestion: "Show the suggestion",
  keepAdvance: (amount, name) => `Keep ${amount} as an advance for ${name}`,
  scan: "scan it with the camera.",
  sampleCall: "Read a sample call",
  hideSample: "Hide the sample call",
  tourTitles: [
    "Is salary day safe?",
    "Chase these first",
    "Before the call",
    "Be Gupta ji: take the call",
    "Salary covered",
    "Gupta ji's pay link",
    "A week later: the money is in",
    "Salary covered ✓",
  ],
};

const hi: OwnerCopy = {
  salaryCovered: "वेतन का इंतज़ाम हो गया",
  salaryToday: "वेतन का दिन आज",
  salaryTomorrow: "वेतन का दिन कल",
  salaryIn: (days) => `वेतन का दिन ${days} दिन में`,
  eightSteps: "आठ कदम, और ऐप खुद आगे बढ़ता है",
  eightStepsFresh: "आठ कदम, खातों की नई प्रति से",
  aiCalls: "एआई कॉल",
  expectedSales: (from, weekly) => `${from} से, पिछले 3 महीनों की बिक्री के हिसाब से हर हफ्ते ${weekly} की अपेक्षित नई बिक्री।`,
  resumeTour: (step, total) => `यात्रा फिर शुरू करें (कदम ${step} / ${total})`,
  tourProgress: (step, total) => `कदम ${step} / ${total}`,
  next: "आगे",
  back: "पीछे",
  endTour: "यात्रा समाप्त करें",
  seeProof: "प्रमाण देखें",
  openInBank: "बैंक में खोलें",
  openInvoice: "बिल खोलें",
  approve: "मंज़ूर करें",
  decline: "अस्वीकार करें",
  markRead: "पढ़ लिया",
  assign: "किसी ग्राहक को दें",
  showSuggestion: "सुझाव दिखाएं",
  keepAdvance: (amount, name) => `${amount} ${name} के अग्रिम के रूप में रखें`,
  scan: "कैमरे से स्कैन करें।",
  sampleCall: "एक नमूना कॉल पढ़ें",
  hideSample: "नमूना कॉल छिपाएं",
  tourTitles: [
    "क्या वेतन का दिन सुरक्षित है?",
    "पहले इन्हें याद दिलाएं",
    "कॉल से पहले",
    "गुप्ता जी बनें: कॉल लें",
    "वेतन का इंतज़ाम हो गया",
    "गुप्ता जी का भुगतान लिंक",
    "एक हफ्ते बाद: पैसा आ गया",
    "वेतन का इंतज़ाम हो गया ✓",
  ],
};

const bn: OwnerCopy = {
  salaryCovered: "বেতনের টাকা জোগাড়",
  salaryToday: "বেতনের দিন আজ",
  salaryTomorrow: "বেতনের দিন কাল",
  salaryIn: (days) => `বেতনের দিন ${days} দিনে`,
  eightSteps: "আটটি ধাপ, আর অ্যাপ নিজে এগোয়",
  eightStepsFresh: "আটটি ধাপ, খাতার নতুন কপি থেকে",
  aiCalls: "এআই কল",
  expectedSales: (from, weekly) => `${from} থেকে, গত ৩ মাসের বিক্রির হিসাবে সপ্তাহে ${weekly} প্রত্যাশিত নতুন বিক্রি।`,
  resumeTour: (step, total) => `ভ্রমণ আবার শুরু (ধাপ ${step} / ${total})`,
  tourProgress: (step, total) => `ধাপ ${step} / ${total}`,
  next: "পরের",
  back: "আগের",
  endTour: "ভ্রমণ শেষ",
  seeProof: "প্রমাণ দেখুন",
  openInBank: "ব্যাংকে খুলুন",
  openInvoice: "বিল খুলুন",
  approve: "মঞ্জুর",
  decline: "নামঞ্জুর",
  markRead: "পড়া হয়েছে",
  assign: "একজন গ্রাহককে দিন",
  showSuggestion: "পরামর্শ দেখান",
  keepAdvance: (amount, name) => `${amount} ${name}-এর অগ্রিম হিসেবে রাখুন`,
  scan: "ক্যামেরা দিয়ে স্ক্যান করুন।",
  sampleCall: "একটি নমুনা কল পড়ুন",
  hideSample: "নমুনা কল লুকান",
  tourTitles: [
    "বেতনের দিন কি নিরাপদ?",
    "আগে এদের মনে করান",
    "কলের আগে",
    "গুপ্তাজি হোন: কল নিন",
    "বেতনের টাকা জোগাড়",
    "গুপ্তাজির পেমেন্ট লিঙ্ক",
    "এক সপ্তাহ পর: টাকা এসেছে",
    "বেতনের টাকা জোগাড় ✓",
  ],
};

export const OWNER: Record<Lang, OwnerCopy> = { en, hi, bn };

export function ownerCopy(lang: Lang): OwnerCopy {
  return OWNER[lang];
}

/** The salary headline. English matches salaryDayIn and "Salary covered". */
export function salaryHeadline(daysAway: number | null, covered: boolean, lang: Lang): string {
  const t = OWNER[lang];
  if (covered || daysAway === null) return t.salaryCovered;
  if (daysAway <= 0) return t.salaryToday;
  if (daysAway === 1) return t.salaryTomorrow;
  return t.salaryIn(daysAway);
}
