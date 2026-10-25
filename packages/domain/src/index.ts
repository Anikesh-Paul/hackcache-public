export { CUSTOMER_LANGS, isCustomerLang } from "./language.ts";
export type { CustomerLang } from "./language.ts";

export { GRADE_WHY, grade, gradeCustomer, paymentHabit } from "./grade.ts";
export type { CustomerGrade, GradeFacts, GradeInput, GradeLetter, HistoryEvent, HistoryInvoice, HistoryPromise } from "./grade.ts";

export { INVOICE_FILTERS, invoiceStanding, isClosed, isInvoiceFilter, matchesFilter } from "./invoice.ts";
export type { InvoiceFacts, InvoiceFilter, InvoiceStanding, InvoiceState, PromiseFacts } from "./invoice.ts";

export {
  AUTO_SEND_SWITCHES,
  DEFAULT_AUTO_SEND,
  LADDER_STAGES,
  ladderDay,
  ladderRungs,
  nextAction,
  promiseBroken,
  stageName,
} from "./ladder.ts";
export type { LadderInvoice, LadderStage, LadderStep, NextAction, Rung } from "./ladder.ts";

export { suggestedInBank, waitingInBank } from "./in-bank.ts";
export type { BankSuggestion } from "./in-bank.ts";

export { DEFAULT_PLAN_RULE, planIssueReason, planRule } from "./plan-rule.ts";
export type { Instalment, PlanIssue, PlanOffer, PlanRule, PlanVerdict } from "./plan-rule.ts";

export { appointedDay, msmedInterest, MSMED_MAX_CREDIT_DAYS, section43bh } from "./msmed.ts";
export type { DeductionClock, MsmedMeter, SellerFacts } from "./msmed.ts";

export {
  AGEING_BUCKETS,
  CHASE_WHY,
  FORECAST_WEEKS,
  ageingBucket,
  expectedNewSales,
  payPackets,
  salaryDayIn,
  todayBook,
} from "./today.ts";
export type {
  AgeingBucket,
  AgeingKey,
  BookCredit,
  BookCustomer,
  BookInput,
  BookInvoice,
  BookPromise,
  NewSales,
  CashItem,
  ChaseRow,
  ChaseWhy,
  Counted,
  DaysToGetPaid,
  ExpectedReceipt,
  ForecastWeek,
  Outflow,
  PayPackets,
  Receivable,
  SalaryDay,
  Totals,
  TodayBook,
} from "./today.ts";

export { MINUTES_PER_CHASE, dsoOn, impact } from "./impact.ts";
export type { Dso, ForwardRow, Impact, ImpactEvent, ImpactInput, ImpactPromise } from "./impact.ts";

export {
  CALLING_HOURS,
  CALL_OUTCOMES,
  DEMO_CLOCK,
  MUNIM_FIRST_MESSAGE,
  callCalendar,
  callConfirmation,
  callDay,
  callGuard,
  checkOutcome,
  indianMobile,
  munimFirstLine,
  planInWords,
  proposePlan,
  spokenName,
  stripTags,
  whatsappLink,
} from "./call.ts";
export type { CallBlock, CallContext, CallGuard, CallGuardInput, CallOutcome, OutcomeCheck, RuleCheck, Said } from "./call.ts";

export {
  MATCH_LABEL,
  bankTxnId,
  importCount,
  importSummary,
  invoicesForMatch,
  matchCredit,
  matchForCustomer,
  matcherBrief,
  rematchCredit,
  overpayPaise,
  parseStatement,
} from "./matcher.ts";
export type {
  AssignedCustomer,
  Match,
  MatchAllocation,
  MatchCredit,
  MatchInvoice,
  MatchKind,
  MatchLine,
  BriefRow,
  ParsedStatement,
} from "./matcher.ts";

export { PROOF_LABEL, checkProof, proofBankLine, proofFromModel } from "./proof-check.ts";
export type { ProofCredit, ProofExtract, ProofResultKind, ProofView } from "./proof-check.ts";

export { REMINDER_NAMES, REMINDER_TEMPLATES, deductionSpoken, deductionWords, reminderMessage } from "./templates.ts";
export type { ReminderFacts } from "./templates.ts";

export { REPEAT_REFUSED, REPEAT_REFUSED_WORDS, SEND_FAILED_WORDS, isRepeatRefused, sendFailureWords } from "./send-failure.ts";

export {
  LETTER_DISCLAIMER,
  LETTER_TITLE,
  MSMED_BOX_LABEL,
  MSMED_EXPLAIN,
  ODR_EXPLAIN,
  ODR_STEPS,
  SAMPLE_BANK,
  SAMPLE_UDYAM,
  TDS_EXPLAIN,
  callTurns,
  caseText,
  demandLetter,
  documentReference,
  udyamNumber,
  letterText,
  odrCaseFile,
  transcriptExcerpt,
} from "./documents.ts";
export type {
  CallTurn,
  CaseFile,
  CaseReminderLine,
  CaseReminderRow,
  CaseTurn,
  DemandLetter,
  DocumentCall,
  DocumentCustomer,
  DocumentInvoice,
  DocumentPromise,
  DocumentReminder,
  DocumentSeller,
  InterestRow,
  LetterInvoiceLine,
  Letterhead,
} from "./documents.ts";

export { runDomainCases } from "./proof-cases.ts";
export { DOC_PHRASES, docPhrases, type DocLang, type DocPhrases } from "./doc-copy.ts";
