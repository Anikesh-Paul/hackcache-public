// The Owner's screens in English. Hindi (hi.tsx) and Bengali (bn.tsx) have the
// same keys; a test fails if one is missing. Product words follow glossary.ts.
// Customer names, business names, UTRs, GSTINs and UPI IDs stay as they are.
import type { ReactNode } from "react";
import type { CallBlock, ChaseWhy, Dso, ForwardRow, GradeFacts, Instalment, MatchKind, PlanIssue, ProofResultKind } from "@tagada/domain";
import { formatDate, formatInr } from "@tagada/money";
import type { FollowUpState } from "../lib/follow-ups.ts";
import type { Lang } from "../lib/prefs.ts";

type DateOptions = { weekday?: boolean; year?: boolean };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const date = (iso: string, options?: DateOptions) => formatDate(iso, options);

function habit(avg: number | null): string {
  if (avg === null) return "no Invoice paid yet";
  if (avg === 0) return "pays on time";
  if (avg < 0) return `usually pays ${plural(-avg, "day", "days")} early`;
  return `usually pays ${plural(avg, "day", "days")} late`;
}

export const en = {
  lang: "en" as Lang,
  date,
  /** "1 day", "8 days". */
  days: (n: number) => plural(n, "day", "days"),
  /** An amount in words: Hindi where money has the words, English otherwise. */
  amountWords: (_paise: number, english: string) => english,
  common: {
    why: "Why?",
    hide: "Hide",
    tryAgain: "Try again",
    cancel: "Cancel",
    open: "Open",
    saving: "Saving…",
    loading: "Loading…",
    customer: "Customer",
    aCustomer: "A Customer",
    reloadToRetry: "Reload the page to try again.",
    couldNotBeDone: "That could not be done.",
    /** A server error the client already put in words: English shows it, the other languages say it plainly. */
    saveError: (message: string) => message,
    callWithAi: "Call with AI",
    demandLetter: "Payment Demand Letter",
    caseFile: "ODR case file",
    invoices: (n: number) => plural(n, "Invoice", "Invoices"),
    daysLate: (n: number) => `${plural(n, "day", "days")} late`,
    notDueYet: "not due yet",
  },
  shell: {
    demoDate: "Demo date",
    dateTitle: "Every screen uses this date, not the clock",
    prevDay: "Previous day: run the Ladder for it",
    nextDay: "Next day: run the Ladder for it",
    running: (when: string) => `Running the daily Ladder for ${when}…`,
    ran: (when: string, r: { sent: number; retried: number; failed: number; skippedDuplicate: number; skippedInBank?: number; ready: number }) =>
      `The daily Ladder ran for ${when}: ${plural(r.sent, "email", "emails")} sent` +
      (r.retried ? ` (${r.retried} after a retry)` : "") +
      (r.failed ? `, ${r.failed} failed` : "") +
      (r.skippedDuplicate ? `, ${r.skippedDuplicate} already sent, skipped` : "") +
      (r.skippedInBank ? `, ${r.skippedInBank} not chased: money in the bank, waiting for you to confirm` : "") +
      `, ${r.ready} ready for you.`,
    runFailed: "The daily Ladder could not run. The Demo date may not have moved; try again.",
    log: "Automation log",
    reset: "Reset demo",
    inbox: (n: number) => (n === 0 ? "Inbox, nothing new" : `Inbox, ${n} new`),
    confirmReset: "Reset the demo? Anything you changed is deleted and the starting story comes back.",
    language: "Language",
    light: "Switch to light mode",
    dark: "Switch to dark mode",
    main: "Main",
    tabs: {
      today: "Today",
      invoices: "Invoices",
      customers: "Customers",
      bank: "Bank",
      inbox: "Inbox",
      automation: "Automation",
      settings: "Settings",
    },
    real: "Real",
    realNote: "GST and interest maths, and your own private copy of the books.",
    simulated: "Simulated",
    simulatedNote: "The bank feed, the UPI ID and the history before today.",
    opening: "Opening your books…",
    openFailed: "Your Demo world could not be opened.",
    resetFailed: "The demo could not be reset.",
  },
  status: {
    paid: "Paid",
    cancelled: "Cancelled",
    disputed: "Disputed",
    promised: "Promised",
    dueToday: "Due today",
    dueOn: (when: string) => `Due ${when}`,
  },
  notFound: {
    invoice: "Invoice",
    customer: "Customer",
    title: (what: string) => `No such ${what} in your books`,
    body: "It may belong to another Demo world, or the demo was reset.",
    all: "See every Invoice",
    label: (what: string) => `${what} not found`,
    page: "Page not found",
    noPage: "There is no page at this address.",
    landing: "Landing page",
  },
  salary: {
    covered: "Salary covered",
    today: "Salary day today",
    tomorrow: "Salary day tomorrow",
    in: (days: number) => `Salary day in ${days} days`,
    coveredTick: "Salary covered ✓",
    of: (when: string, amount: string) => `${when}: salaries of ${amount}.`,
    shortBy: (amount: string) => `${amount} short on salary day`,
    spare: (amount: string) => `Salary covered, ${amount} spare`,
  },
  packets: {
    allFull: (n: number) => `All ${n} pay packets are full`,
    toSpare: (amount: string) => `, with ${amount} to spare`,
    fills: (amount: string) => `${amount} fills`,
    someFull: (full: number, n: number) => `${full} of ${n} pay packets`,
    partOf: (ordinal: number) =>
      ` and part of the ${["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth"][ordinal - 1] ?? `${ordinal}th`}`,
    each: (amount: string) => `About ${amount} each.`,
    aria: (full: number, n: number) => `${full} of ${n} pay packets full`,
    figureShort: "short on salary day",
    figureSpare: "spare after salaries",
  },
  forecast: {
    title: "Next 13 weeks",
    cashAtWeekEnd: "cash at week end",
    expectedSales: (from: string, weekly: string) =>
      `From ${from}, with ${weekly} a week of expected new sales, from your last 3 months.`,
    enough: "Enough cash",
    short: "Short",
    seeEveryWeek: "Why? See every week",
    explain:
      "Coming in: each open Invoice on its due date plus that Customer's usual delay, or on the date they promised. Expected new sales: a week's share of what you invoiced in the last 3 months, from the day an Invoice raised today would usually be paid. Going out: salaries, rent, power and raw bamboo. The salary-day headline counts only what is in your books now.",
    salaryMark: "salary",
    shortMark: " short",
    chartLabel: (n: number, weeks: string) => `Cash at the end of each of the next ${n} weeks. ${weeks}.`,
    weekSays: (start: string, salary: boolean, cash: string) => `Week of ${start}${salary ? ", salaries" : ""}: ${cash}`,
    shortAmount: (amount: string) => `${amount} short`,
    caption: "Cash forecast, week by week",
    weekOf: "Week of",
    comingIn: "Coming in",
    goingOut: "Going out",
    salaries: " salaries",
    newSales: (amount: string) => ` with ${amount} expected new sales`,
  },
  today: {
    adding: "Adding up your books…",
    unreadable: "Your books could not be read. Reload to try again.",
    money: "Money",
    work: "Today's work",
    noSalary: "No salary day in the next 13 weeks",
    addSalaries: "Add salaries in Settings to see whether they are covered.",
    bringIn: (amount: string, when: string) => `Bring in ${amount} before ${when} and salaries are covered.`,
    coveredBy: (when: string) => `Salaries on ${when} are covered by what is in the bank and what is due before then.`,
    inBankToday: "In the bank today",
    shortOnDay: "Short on salary day",
    spareOnDay: "Spare on salary day",
    expectedNote:
      "Expected from Customers means each open Invoice on its due date plus that Customer's usual delay, or on the date they promised. Invoices later than usual, disputed, or already in the bank are not counted.",
    promisedDate: "the date they promised",
    usualDelay: "due date plus their usual delay",
    position: "Your position",
    receivables: "Total receivables",
    receivablesSub: (n: number) => `${plural(n, "Invoice", "Invoices")} not yet paid`,
    receivablesWhy: (inBank: string, disputed: string | null, bank: ReactNode) => (
      <>
        Everything still owed on Invoices that are not marked paid. {inBank} of it is already in the bank, waiting for
        you to confirm it on the {bank} page{disputed && <>, and {disputed} is held up by a Dispute</>}.
      </>
    ),
    overdue: "Overdue",
    overdueSub: (n: number) => `${plural(n, "Invoice", "Invoices")} past their due date`,
    overdueWhy: "The part of total receivables on Invoices whose due date has passed, including any with a Promise or a Dispute.",
    expected: "Expected collections",
    by: (when: string) => `by ${when}`,
    expectedWhy:
      "What the next 30 days should bring in: each open Invoice on its due date plus that Customer's usual delay, or on the date they promised.",
    upcoming: "Upcoming expenses",
    upcomingWhy: "Salaries, rent and suppliers due in the next 30 days.",
    onDate: (what: string, amount: string, when: string) => `${what} ${amount} on ${when}`,
    ageingTitle: "How old the money owed is",
    ageingNote: "Days past the due date. Tap a group to see its Invoices.",
    daysPastDue: " days past due",
    chaseTitle: "Chase these first",
    owed: "owed",
    nothingToChase: "Nothing to chase: every unpaid Invoice is promised, disputed or on its way.",
    orderWhy: "How is this order worked out?",
    chaseWhy:
      "Each unpaid Invoice scores the part of the salary-day gap its payment would close (once salaries are covered, its whole amount), times how reliably the Customer pays (Grade A 3, B 2, C 1), divided by the effort (a call 2, a reminder 1). Lateness adds to it: every 30 days late adds the score once more, so 60 days late counts three times. Invoices with a Promise, a Dispute, money already in the bank, or a payment already expected before salary day are left out, and so are Invoices not yet due while any Invoice is overdue.",
    chaseReason: (why: ChaseWhy, toCome: number, gapClosed: number) => {
      const what =
        why.gap === "none"
          ? `Brings in ${formatInr(toCome)}`
          : why.gap === "all"
            ? "Closes the whole salary gap"
            : `Closes ${formatInr(gapClosed)} of the ${formatInr(why.gapPaise)} salary gap`;
      const last =
        why.reminderAgoDays === null
          ? "no reminder yet"
          : why.reminderAgoDays === 0
            ? "reminded today"
            : `no reminder in ${plural(why.reminderAgoDays, "day", "days")}`;
      return `${what}. ${capital(habit(why.avgDelayDays))}; ${last}.`;
    },
    daysToGetPaid: "Days to get paid",
    nonePaid: "No Invoice was paid in the last 6 months.",
    youWait: (days: number) => (
      <>
        You wait <b>{days} days</b> on average to get paid.
      </>
    ),
    ifKept: (days: number, kept: number) =>
      kept === days ? (
        <> If today's promises are kept, that stays at {days}.</>
      ) : (
        <>
          {" "}
          If today's promises are kept, that {kept < days ? "drops" : "rises"} to <b>{kept}</b>.
        </>
      ),
    daysWhy: (count: number) => `Days from the Invoice date to the day it was paid, averaged over the ${count} Invoices paid in the last 6 months.`,
    daysWhyKept: (n: number) =>
      ` The second figure adds the ${n} unpaid ${n === 1 ? "Invoice" : "Invoices"} with a Promise or Plan, as if each is paid on its last promised date.`,
    aiCalls: "AI calls",
    costSecured: (cost: string, secured: string) => (
      <>
        Cost <b>{cost}</b>, secured <b>{secured}</b>.
      </>
    ),
    callsWhy: (n: number) =>
      `${plural(n, "call", "calls")}, priced by how long each one ran. Secured is what the Plans and Promises agreed on a call add up to, while they stand.`,
    inboxEmpty: "Replies from the pay link land here: paid claims, Disputes, Plans and screenshots.",
  },
  impact: {
    title: "What Tagada changed",
    since: (when: string) => `Since ${when}, when Tagada started chasing.`,
    dso: "Days to get paid",
    dsoSub: "days of sales still owed (DSO)",
    dsoWhy: (before: Dso, after: Dso) =>
      [before, after]
        .map((d, n) =>
          d.days === null
            ? `${n === 0 ? "Before" : "Now"}: nothing was invoiced from ${date(d.from)} to ${date(d.date)}.`
            : `${n === 0 ? `On the evening of ${date(d.date)}, before Tagada started` : `On ${date(d.date)}`}, ${formatInr(d.owedPaise)} was owed against ${formatInr(d.salesPaise)} invoiced from ${date(d.from)}: ${formatInr(d.owedPaise)} ÷ ${formatInr(d.salesPaise)} × ${d.windowDays} = ${d.days} days.`,
        )
        .join(" "),
    dsoNote: "Owed means every Invoice not yet paid, by the books; money waiting in the Bank counts once you confirm it.",
    forward: "Money brought forward",
    forwardSub: (monthEnd: string) => `paid or promised by ${monthEnd}`,
    forwardNone: "Nothing yet: no payment or Plan since then on an Invoice that, by its Customer's habit, would have come later.",
    forwardWhy:
      "Paid since Tagada started, or promised in a Plan agreed since then, inside this month, on Invoices that by the Customer's habit would have come later: their usual day, the due date plus how late they usually pay, falls after this month or had already gone by unpaid.",
    forwardRow: (r: ForwardRow, since: string) =>
      `${r.customerName}, ${r.number}: ${formatInr(r.countedPaise)} (${[r.paidPaise > 0 && `paid ${formatInr(r.paidPaise)}`, r.promisedPaise > 0 && `promised ${formatInr(r.promisedPaise)}`].filter(Boolean).join(", ")}). ${capital(habit(r.avgDelayDays))}, so the usual day was ${date(r.usualDate)}${r.why === "passed" ? `, already gone by on ${since}` : ", after this month"}.`,
    forwardTotal: (total: string) => `In all, ${total}.`,
    hours: "Hours of chasing saved",
    hoursSub: (minutes: number) => `at ${minutes} minutes a chase`,
    time: (minutes: number) => {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      if (h === 0) return `${m} min`;
      return m === 0 ? plural(h, "hour", "hours") : `${h} h ${m} min`;
    },
    hoursWhy: (reminders: number, calls: number, per: number, minutes: number) =>
      `${plural(reminders, "Reminder", "Reminders")} the Ladder sent and ${plural(calls, "call", "calls")} Munim made: ${reminders + calls} × ${per} minutes = ${minutes} minutes. ${per} minutes is what one chase takes by hand: finding the bill, writing the message or dialling, and noting the answer.`,
    cost: "Cost per ₹100 collected",
    costSub: (cost: string, collected: string) => `${cost} spent, ${collected} collected`,
    perHundred: (paise: number | null) =>
      paise === null ? "Nothing collected yet" : paise === 0 ? "Under 1 paisa" : paise < 100 ? `${paise} paise` : formatInr(paise),
    costWhy: (emails: number, emailCost: string, calls: number, callCost: string, cost: string, collected: string, per: string) =>
      `${plural(emails, "email", "emails")} at ₹35.20 per 1,000: ${emailCost}. ${plural(calls, "AI call", "AI calls")}, priced by how long each ran: ${callCost}. ${cost} spent to collect ${collected}: ${cost} ÷ ${collected} × ₹100 = ${per}.`,
  },
  followUps: {
    title: "Today's follow-ups",
    reading: "Reading the Ladder…",
    unreadable: "The follow-ups could not be read. Reload the page to try again.",
    none: "Nothing for the Ladder today.",
    word: {
      sent: (at: string | null) => (at ? `Sent ${at}` : "Sent"),
      failed: () => "Not sent",
      in_bank: () => "In your bank",
      ready: () => "Ready to send",
      capped: () => "Tomorrow",
      due: () => "Goes at 10:00",
    } satisfies Record<FollowUpState, (at: string | null) => string>,
    explain: {
      sentEmail: "Emailed by the daily run.",
      sentByYou: "You sent it.",
      inBank: "No reminder goes while it waits for you to confirm it.",
      off: "Switched off in Settings, so it waits for you.",
      yours: "This step is always yours to take.",
      capped: (name: string) => `${name} already had a message today; one a day at most.`,
      due: "The daily run emails it at 10:00.",
    },
    inBankLine: (amount: string, name: string) => `${amount} from ${name} is in your bank.`,
    confirmIt: "Confirm it",
    stageFor: (stage: string) => `${stage} for`,
    message: "The message",
    email: "Email",
    noted: "Sent, but it could not be noted here. Tap again to note it.",
  },
  ladder: {
    title: "The Ladder",
    neverRepeats: "never repeats a step",
    stagesLabel: "Ladder stages, first at the bottom",
    nextToday: "next, today",
    done: " (done)",
    stages: [
      { name: "Friendly heads-up", how: "Email or WhatsApp, before the due date" },
      { name: "Due-date reminder", how: "Email or WhatsApp, on the due date" },
      { name: "Overdue reminder with pay link", how: "WhatsApp or email with the pay link" },
      { name: "Reminder call", how: "Call with AI, only with consent" },
      { name: "Payment Demand Letter", how: "You send it; never automatic" },
      { name: "ODR case file", how: "For the MSME online dispute resolution (ODR) portal" },
    ],
    reminderNames: ["Friendly heads-up", "Due-date reminder", "Overdue reminder with pay link", "Firm reminder", "Final reminder"],
    reminder: "Reminder",
    paidStopped: "Paid, so the Ladder has stopped.",
    cancelledStopped: "Cancelled, so the Ladder has stopped. Nothing more is sent.",
    pausedDispute: "Paused: Dispute",
    untilResolved: "Nothing is sent until you resolve it.",
    paused: (plan: boolean) => `Paused: ${plan ? "Plan agreed" : "Promise"}`,
    climbsAgain: "If the money doesn't arrive by its date, the Ladder climbs again.",
    notDue: "Not due yet, so nothing has been sent.",
  },
  invoices: {
    title: "Invoices",
    newInvoice: "New invoice",
    count: (n: number) => `${plural(n, "Invoice", "Invoices")} this financial year. Amounts are what is still owed.`,
    show: "Show",
    filters: { all: "All", overdue: "Overdue", promised: "Promised", disputed: "Disputed", paid: "Paid" },
    ageTitle: (label: string) => `${label} days past due`,
    every: "Every Invoice",
    due: "due",
    owed: "owed",
    noneOn: (filter: string | null, when: string) => `No ${filter ? `${filter.toLowerCase()} ` : ""}Invoices on ${when}.`,
    unknownCustomer: "Unknown Customer",
    paid: "paid",
    cancelled: "cancelled",
    paidTotal: "Paid",
    stillOwed: "Still owed",
  },
  invoice: {
    label: "Invoice",
    madeTitle: "Saved. Now be the Customer",
    madeSteps: (name: string) => [
      `Open the pay link as ${name}.`,
      "Say it is paid, ask for more time, or raise a dispute.",
      `Or press Call with AI and play ${name}: before the due date, Munim makes a friendly heads-up call.`,
      "Come back: the bell shows what they did, and this Invoice's timeline has it too.",
    ],
    nextSteps: "Next steps",
    details: "Details",
    sameState: "Same state, so CGST and SGST.",
    otherState: "Another state, so IGST.",
    issuedDue: (issued: string, due: string) => `Issued ${issued}, due ${due}.`,
    paidInFull: (amount: string) => `paid in full, ${amount}`,
    owedAfter: (amount: string) => `owed, after ${amount} paid`,
    owedNothingPaid: "owed, nothing paid yet",
    theCustomer: "the Customer",
    happened: "What has happened",
    seeded: "seeded history",
    timelineFailed: "The timeline could not be loaded. Reload the page to try again.",
    timelineLoading: "Loading the timeline…",
    showTranscript: "Show transcript",
    hideTranscript: "Hide transcript",
    transcriptLoading: "Loading the transcript…",
    transcriptFailed: "The transcript could not be read. Try again.",
    transcriptNone: "No transcript is stored for this call yet. It arrives about a minute after the call ends.",
    onInvoice: "On the invoice",
    qty: "qty",
    taxable: "taxable",
    linesFailed: "The lines could not be loaded. Reload the page to try again.",
    linesLoading: "Loading the lines…",
    each: (amount: string) => `${amount} each`,
    discount: (pct: number) => `, less ${pct}% discount`,
    gst: (pct: number) => `. GST ${pct}%.`,
    taxableValue: "Taxable value",
    roundOff: "Round-off",
    total: "Total",
    totalsDiffer: "The saved totals differ from the engine's; the engine's are shown.",
    actors: { owner: "You", customer: "Customer", workflow: "Daily run", ai: "AI" },
    meterTitle: "MSMED interest so far",
    computed: "computed",
    meterLine: (after: string, before: string, change: string, from: string) =>
      `${after} a year (${before} before ${change}), compounded monthly, from ${from}.`,
    meterWhy: (oldRate: string, newRate: string, change: string, principal: string) =>
      `The MSMED Act lets a micro or small manufacturer charge a late buyer compound interest, with monthly rests, at three times the RBI Bank Rate (§16). It runs from the day after the due date, or 45 days after the Invoice date if the agreed terms are longer (§15). The Bank Rate went from ${oldRate} to ${newRate} on ${change}, so each day earns the rate in force that day. On ${principal} owed:`,
    month: "Month",
    rate: "Rate",
    interest: "Interest",
    span: (from: string, to: string) => `${from} to ${to}`,
    daysAt: (days: number, rate: string) => `${days} days at ${rate}`,
    notAdvice: "General information, not legal advice.",
    deductionTitle: "Section 43B(h)",
    deductionLine: (date: string, year: string, sameYear: boolean) =>
      sameYear
        ? `Paid by ${date}, the buyer may claim this bill as an expense in FY ${year}.`
        : `The buyer may now claim this bill only in the year it is paid: paid by ${date}, FY ${year}.`,
    deductionWhy: (appointed: string) =>
      `Section 43B(h) of the Income Tax Act lets a buyer claim what they owe a micro or small enterprise as an expense in the year of the Invoice only if they pay by the MSMED Act's appointed day, here ${appointed}: the due date, or 45 days after the Invoice date if the agreed terms are longer (§15). Paid later, the claim moves to the year it is paid. That gives the buyer their own reason to pay on time. The reminders from the overdue one on, the Payment Demand Letter and the call say so, as "may": it depends on the buyer's own accounts.`,
    whatYouCanDo: "What you can do",
    copied: "Pay link copied",
    copy: "Copy pay link",
    copyBlocked: "Copying was blocked. The link is",
    openAs: (name: string) => `Open pay link as ${name}`,
    noPayLink: "This Demo world was made before pay links existed. Reset demo to give every Invoice one.",
    odrExplain:
      "ODR is online dispute resolution. The government's portal for delayed payments to micro and small businesses is odr.msme.gov.in.",
    printTax: "Print Tax Invoice",
    duplicate: "Duplicate this invoice",
    markDisputed: "Mark as disputed",
    disputeAsk: "What does the Customer say is wrong?",
    disputeFailed: "It could not be saved. Try again.",
    disputeNote: "Nothing more is sent to the Customer until you resolve it.",
    cancelledLine: "cancelled; nothing is owed",
    recordPayment: "Record a payment",
    amountReceived: "Amount received (₹)",
    receivedOn: "Received on",
    payMode: "How it was paid",
    payModeNames: { cash: "Cash", cheque: "Cheque", upi: "UPI", bank_transfer: "Bank transfer" },
    payModes: { cash: "in cash", cheque: "by cheque", upi: "by UPI", bank_transfer: "by bank transfer" },
    payReference: "Cheque number or UTR (optional)",
    savePayment: "Save payment",
    amountHint: "Enter the amount in rupees, such as 5,000.",
    amountOver: (owed: string) => `That is more than is owed. At most ${owed}.`,
    dateHint: "Use a date from the issue date to the Demo date.",
    paymentNote: "Today counts it as cash in hand from that day. Covering the balance marks the Invoice paid and stops the Ladder.",
    paymentFailed: "The payment could not be saved. Try again.",
    paymentErrors: {
      more_than_owed: "That is more than is still owed.",
      invalid_amount: "Check the amount.",
      invalid_date: "Use a date from the issue date to the Demo date.",
      not_open: "Nothing is owed on this Invoice now.",
    } as Record<string, string>,
    edit: "Edit invoice",
    cancelInvoice: "Cancel invoice",
    cancelAsk: "Why is it cancelled?",
    cancelNote: (number: string) =>
      `Under GST a saved Invoice is cancelled, not deleted: ${number} stays used, and the next Invoice takes the next number. It drops out of what you are owed, and the Ladder stops.`,
    keepInvoice: "Keep it",
    cancelFailed: "It could not be cancelled. Try again.",
    cancelErrors: {
      has_payments: "Money has been paid against it. Issue a credit note instead.",
      already_cancelled: "It is already cancelled.",
    } as Record<string, string>,
    cannotCancel: "Money has been paid against this Invoice, so it cannot be edited or cancelled. A credit note would correct it.",
  },
  proof: {
    labels: { found: "Matched ✓", not_found_yet: "Not found yet", amount_mismatch: "Amount differs" } satisfies Record<ProofResultKind, string>,
  },
  newInvoice: {
    label: "New invoice",
    title: "New invoice",
    crumbNew: "new",
    editTitle: "Edit invoice",
    crumbEdit: "edit",
    saveChanges: "Save changes",
    editIntro: (number: string) =>
      `Change the lines and the due date. ${number}, its Customer and its issue date stay. On save, the server works the totals out again.`,
    notEditable: "Only an unpaid Invoice with nothing paid against it can be edited. Record a payment, or a credit note, instead.",
    backToInvoice: (number: string) => `Back to ${number}`,
    dueDate: "Due date",
    dueFromCredit: (days: number) => `Set by their ${plural(days, "day's", "days'")} credit. Change it if you like.`,
    save: "Save invoice",
    previewOnly: "Preview only",
    intro: "Totals update as you type. On save, the server works them out again and gives the Invoice the next number.",
    previewAs: "Preview as",
    modes: { regular: "Regular", composition: "Composition seller", unregistered: "Unregistered" },
    ownRegistration: (name: string) => `${name}, on its own registration.`,
    sampleSeller: (composition: boolean) =>
      `A sample seller in Agartala${composition ? ", who charges no GST" : ", with no GSTIN"}. This preview is not saved.`,
    customer: "Customer",
    choose: "Choose a Customer",
    addNew: "Add a new Customer",
    name: "Name",
    state: "State",
    chooseState: "Choose a state",
    creditDays: "Credit days",
    language: "Preferred language",
    address: "Address",
    line: (n: number) => `Line ${n}`,
    description: "Description",
    hsn: "HSN or SAC",
    quantity: "Quantity",
    unit: "Unit",
    rate: "Rate (₹)",
    discount: "Discount %",
    gstRate: "GST rate",
    removeLine: "Remove line",
    addLine: "Add a line",
    finishLines: "Finish every line you started, or clear it. The fields marked in red say what each needs.",
    tryTitle: "Make your own invoice",
    trySteps: [
      "Choose a Customer, or add a new one: your own name works.",
      "Fill in a line. The HSN comes filled in for bamboo basketwork; change it if you like.",
      "Save. Today counts the new Invoice at once: what you are owed, its age and the 13-week cash.",
    ],
    lineHints: {
      description: "Add a description.",
      hsn: "Enter an HSN or SAC code of 4 to 8 digits, such as 4602.",
      qty: "Use a number above 0, such as 3 or 2.5, with at most three decimals.",
      rate: "Enter the rate in rupees, such as 1,500.50.",
      discount: "Use a whole number from 0 to 100.",
    },
    toSave: "To save this Invoice:",
    blockers: {
      customer: "Choose a Customer, or add a new one.",
      name: "Add the Customer's name.",
      gstin: "Fix the Customer's GSTIN, or leave it empty if they have none.",
      state: "Choose the Customer's state. With a GSTIN, it must match its first two digits.",
      creditDays: "Credit days must be a whole number from 0 to 365.",
      email: "Fix the email address, or leave it empty.",
      phone: "Fix the mobile number (10 digits), or leave it empty.",
      line: "Fill in at least one line.",
      dueDate: "Choose a due date from the issue date to a year after it.",
    },
    compositionSample: "A composition seller sells only inside their own state, so this preview bills a sample Customer in Agartala.",
    sample: "This preview bills a sample Customer in Agartala.",
    printPreview: "Print preview",
    previewEmpty: "Choose a Customer and add a line. The Invoice appears here as you type.",
    saveFailed: "The Invoice could not be saved. Try again.",
    gstinOptional: "GSTIN (leave empty if they have none)",
    gstinCheck: "The check digit does not match. Check the GSTIN.",
    gstinShape: "A GSTIN is 15 letters and digits.",
    errors: {
      invalid_gstin: "That GSTIN check digit does not match.",
      invalid_line: "Check the lines. Each needs a description, an HSN of 4 to 8 digits, a quantity, a rate and a listed GST rate.",
      invalid_customer: "Check the new Customer's name, state and credit days.",
      invalid_email: "Check the email address.",
      invalid_phone: "Check the mobile number: 10 digits, starting 6 to 9.",
      not_editable: "This Invoice has money paid against it, or is cancelled, so it cannot be edited.",
      invalid_due_date: "Choose a due date from the issue date to a year after it.",
      not_found: "That Invoice is not in this Demo world.",
      invalid_body: "The Invoice could not be read. Try again.",
      unknown_customer: "That Customer is not in this Demo world.",
      composition_interstate: "A composition seller cannot bill a Customer in another state.",
      world_not_ready: "Your books are still opening. Try again in a moment.",
      number_taken: "Other Invoices were saved at the same moment. Save again for the next number.",
      unauthorized: "The session expired. Reload the page.",
    } as Record<string, string>,
  },
  customers: {
    title: "Customers",
    intro: (n: number) => `${plural(n, "Customer", "Customers")}. A grade is how they have paid, with the reason.`,
    gradeWhy:
      "A means they are 7 days late or less on average, and raised no Dispute in the last 6 months. C means they are more than 30 days late on average, broke a Promise in the last three months, or still have an Invoice open three months or more past its due date. Everyone else is B. The average uses Invoices already paid, not one that is only overdue today.",
    every: "Every Customer",
    place: "place",
    owed: "owed",
    reading: "Reading payment history…",
    unavailable: "Grade unavailable",
    credit: (days: number) => `${days} days' credit.`,
    grade: (letter: string, facts: GradeFacts) => {
      const parts = [habit(facts.avgDelayDays)];
      if (facts.threeMonthsOpen) parts.push("an Invoice is three months or more past due");
      else if (facts.worstLateDays > 0) {
        const late = plural(facts.worstLateDays, "day", "days");
        parts.push(facts.overdueCount === 1 ? `this one is ${late} late` : `one is ${late} late`);
      }
      if (facts.brokenOn) parts.push(`a Promise was broken on ${formatDate(facts.brokenOn, { weekday: false })}`);
      if (facts.disputed) parts.push("a Dispute in the last 6 months");
      return `Grade ${letter}. ${capital(parts.join("; "))}`;
    },
    delay: (days: number) =>
      days === 0
        ? "Pays on time, on average"
        : days < 0
          ? `Usually ${plural(-days, "day", "days")} early`
          : `Average ${plural(days, "day", "days")} late`,
  },
  customer: {
    language: (name: string) => `Reminders and the pay link use ${name}.`,
    onPaid: ", on Invoices already paid.",
    stillOwed: "still owed",
    issued: "issued",
    noInvoices: "No Invoices yet.",
    payments: "Payments",
    readingPayments: "Reading payments…",
    noPayments: "No payments confirmed yet.",
    advance: "Advance",
    readingAdvance: "Reading the advance…",
    noAdvance: "No advance kept yet.",
    reminders: "Reminders",
    readingReminders: "Reading reminders…",
    noReminders: "No Reminders yet.",
    reminderBy: (stage: string, channel: string) => `${stage} by ${channel}`,
    channels: { email: "email", whatsapp_link: "WhatsApp", call: "call" },
    calls: "Calls",
    noCalls: "No calls yet.",
    call: "Call",
    seconds: (n: number) => `, ${n} seconds`,
    email: (address: string) => `Email: ${address}.`,
    phone: (number: string) => `Mobile: ${number}.`,
    callsAllowed: "Agreed to calls from the AI agent.",
    callsNotAllowed: "Has not agreed to calls from the AI agent.",
    notSet: "Not set",
  },
  customerForm: {
    add: "Add Customer",
    edit: "Edit details",
    addTitle: "Add a Customer",
    editTitle: "Edit Customer",
    crumbNew: "new",
    crumbEdit: "edit",
    intro: "Your own name and email work. Reminders and the pay link use their preferred language.",
    save: "Save Customer",
    email: "Email (optional)",
    phone: "Mobile (optional)",
    emailHint: "An email address looks like name@example.com.",
    phoneHint: "Use a 10-digit Indian mobile, such as 98300 12345.",
    consent: "They agreed to calls from the AI agent",
    consentNote: "Without it, Call with AI stays off for them. The date you tick it is kept.",
    stateLocked: "They have Invoices, so the state stays: it is the place of supply on those Invoices.",
    toSave: "To save this Customer:",
    emailOwn: "Reminder emails the Ladder sends go to this address, up to 10 for your books.",
    emailInbox: (inbox: string) =>
      `This server sends every reminder email to the Demo inbox (${inbox}), not to this address. Follow-ups you send from your own mail use it.`,
    emailOff: "This server cannot send email yet. Follow-ups you send from your own mail use this address.",
    saveFailed: "The Customer could not be saved. Try again.",
    errors: {
      invalid_customer: "Check the name, state, credit days and language.",
      invalid_gstin: "That GSTIN check digit does not match.",
      invalid_email: "Check the email address.",
      invalid_phone: "Check the mobile number: 10 digits, starting 6 to 9.",
      state_locked: "They have Invoices, so their state cannot change.",
      not_found: "That Customer is not in this Demo world.",
      world_not_ready: "Your books are still opening. Try again in a moment.",
      unauthorized: "The session expired. Reload the page.",
    } as Record<string, string>,
  },
  bank: {
    title: "Bank",
    intro: "Each credit has a suggestion. Nothing is marked paid until you confirm it.",
    tdsAsk: "What is TDS?",
    tdsWhy:
      "TDS is tax deducted at source. Some Customers must keep back a set share of a payment and pay that share to the tax department in the supplier's name. Possible TDS means the amount kept back is exactly 0.1%, 1%, 2% or 10% of the taxable value. A large buyer of goods can deduct 0.1%. Work is 1% for an individual or HUF and 2% for a company; on an Invoice with an installation line, that is a share of the installation line only. 10% is the rate for professional or technical fees. Confirming a possible TDS covers the Invoice; that amount was kept back, not left owed.",
    simulated: "Simulated bank feed",
    importSample: "Import sample statement",
    confirmAllExact: "Confirm all exact",
    confirmedExact: (n: number) => `Confirmed ${n} exact.`,
    nothingToConfirm: "Nothing to confirm.",
    imported: (already: number, added: number) => `${already} already imported, ${added} new`,
    /** The server's note when a suggestion changed since import. */
    changed: (message: string) => message,
    drop: "Drop a CSV here, or choose a file.",
    columns: "Columns: date, narration, utr, amount. A sample file is",
    csvLabel: "Bank statement CSV",
    credits: "Credits",
    date: "date",
    amount: "amount",
    reading: "Reading the statement…",
    unreadable: "The statement could not be read.",
    none: "No credits yet.",
    kinds: {
      exact: "Exact",
      part: "Part",
      multi: "Multi-invoice",
      overpay: "Overpaid",
      unknown: "Unknown deposit",
      tds: "Possible TDS",
    } satisfies Record<MatchKind, string>,
    matchStatus: { confirmed: "Confirmed", suggested: "Suggested", unmatched: "Unmatched" },
    assignedTo: (name: string) => `Assigned to ${name}`,
    confirmedPayment: "Confirmed as a payment.",
    noSuggestion: "No Invoice suggested.",
    keptTds: (amount: string) => `, and ${amount} kept back as TDS`,
    confirm: "Confirm",
    confirmed: "Confirmed.",
    assign: "Assign to a Customer",
    choose: "Choose a Customer",
    showSuggestion: "Show the suggestion",
    keepAdvance: (amount: string, name: string) => `Keep ${amount} as an advance for ${name}`,
    advanceKept: (amount: string, name: string) => `${amount} kept as an advance for ${name}.`,
    /** The matcher's own note in English; the other languages say what the kind means. */
    matchNote: (_kind: MatchKind, note: string) => note,
    proofs: "Payment proofs",
    proofsFailed: "Payment proofs could not be read.",
    noProofs: "No screenshot to check yet.",
    none_: "none",
    nothingRead: "Nothing read off the screenshot yet.",
    checkedAgainst: "Checked against",
    shotFailed: "The screenshot could not be loaded.",
    shotLoading: "Loading the screenshot…",
    enlarge: "Enlarge the screenshot",
    shotAlt: "UPI screenshot",
  },
  inbox: {
    title: "Inbox",
    intro:
      "What your Customers did on their pay link: paid claims, screenshots, Plans and Disputes. New ones appear here the moment they happen.",
    latest: "Latest first",
    failed: "The Inbox could not be loaded. Reload the page to try again.",
    loading: "Loading the Inbox…",
    empty: "Nothing yet. Open an Invoice, copy its pay link and open it on your phone: what you do there shows up here.",
    kinds: {
      paid_claim: "Says already paid",
      proof_uploaded: "Sent a UPI screenshot",
      plan_accepted: "Plan agreed",
      needs_decision: "Needs your decision",
      dispute: "Dispute",
    },
    new: "New",
    loadingWhat: "Loading what happened…",
    openInBank: "Open in Bank",
    openInvoice: "Open Invoice",
    approve: "Approve",
    decline: "Decline",
    approved: "Approved.",
    declined: "Declined.",
    markRead: "Mark as read",
    markFailed: "That could not be marked as read.",
  },
  automation: {
    label: "Automation log",
    title: "Automation",
    intro:
      "Every day at 10:00 the Ladder runs for your Demo date. Each Reminder has one key, made from its Invoice and its step, and the run creates that key before it sends. A second run, or a retry, finds the key already there, so nothing is ever sent twice.",
    retried: "Retried sends",
    noRetry: "No send has needed a retry.",
    runs: "Daily runs",
    loadingRuns: "Loading the runs…",
    runsFailed: "The runs could not be read. Reload the page to try again.",
    showAll: (n: number) => `Show all ${n} runs`,
    at: (time: string) => `at ${time}`,
    runLine: (r: { scanned: number; sent: number; duplicate: number; retried: number; failed: number }) =>
      `${r.scanned} Invoices scanned, ${r.sent} sent, ${r.duplicate} skipped as duplicate, ${r.retried} retried, ${r.failed} failed`,
    inBank: (n: number) => `, ${n} not chased: money in the bank, waiting for you to confirm`,
    nothingOnRun: "Nothing to send on this run.",
    reminderFor: (stage: string, name: string) => `${stage} for ${name}`,
    key: "Key",
    serviceSaid: "What the email service said",
    status: {
      queued: "sending",
      sent: "sent",
      failed: "failed",
      retried: "retried",
      skipped_cap: "rolled to tomorrow (one a day)",
      skipped_stage_off: "ready for the Owner",
    },
    story: {
      retriedSent: (tries: number) => `failed → retried → sent (${tries} tries)`,
      repeat: "not sent: refused as a repeat",
      failedTimes: (tries: number) => `failed ${tries} times`,
    },
    sendFailed: "The email could not be sent; the next run tries again.",
    repeatRefused: "The email service had already taken this email once, so it is not sent again.",
    sentMail: "Sent mail",
    sentMailNote:
      "A copy of every reminder email the daily run really sent. In this demo they all go to the one Demo inbox, so no real Customer is emailed.",
    noMail: "No email yet. Step the Demo date forward (› in the header) and the daily run sends what is due.",
    to: (when: string, to: string) => `${when}, to ${to}`,
    from: (from: string, number: string, name: string) => `From ${from}, about Invoice ${number} for ${name}`,
  },
  settings: {
    title: "Settings",
    intro: "Your business, your Plan rule and what the Ladder may send on its own.",
    business: "Your business",
    businessName: "Business name",
    address: "Address",
    registration: "GST registration",
    registrations: {
      regular: { name: "Regular GST", note: "Tax Invoice, with GST" },
      composition: { name: "Composition", note: "Bill of Supply, no GST charged" },
      unregistered: { name: "Not registered", note: "Invoice, no GST" },
    },
    turnover: "Aggregate turnover this year, ₹",
    eInvoiceAbove: "Above ₹5 crore: your Invoices carry the e-invoicing note.",
    eInvoiceBelow: "Up to ₹5 crore: no e-invoicing note.",
    planRule: "Your Plan rule",
    firstAtLeast: "First instalment at least",
    percentWithin: "% within",
    daysRestWithin: "days, the rest within",
    daysEnd: "days.",
    firstPct: "First instalment, percent",
    firstDays: "First instalment within days",
    restDays: "Rest within days",
    ruleNote: "Call with AI and the pay link only offer Plans inside this rule; anything else needs your decision.",
    autoSend: "Auto-send stages",
    autoSendLegend: "Ladder messages the daily run sends without asking",
    on: "On: the 10:00 run emails it.",
    off: "Off: it waits in Today's follow-ups as Ready to send.",
    never: "Never sent automatically: you send it.",
    always: "Always yours to take.",
    email: "Email",
    yourEmail: "Your email (Customers' replies come here)",
    demoInbox: "Demo inbox",
    reading: "Reading…",
    unreadable: "Could not be read. Reload to try again.",
    noEmail:
      "Email is not set up on this server yet, so reminder emails show as failed. They need RESEND_API_KEY and DEMO_INBOX_EMAIL.",
    fromNote: (name: string) =>
      `Reminder emails go from “${name} via Tagada”. In this demo every one is delivered to this one inbox, never to a Customer.`,
    language: "Language",
    yourLanguage: "Your language",
    save: "Save settings",
    saved: "Saved.",
    notSaved: "Not saved. Try again.",
    yourData: "Your data",
    dataNote:
      "Your books are kept in Appwrite, in Singapore, readable by this browser's session alone. Deleting your workspace removes every Customer, Invoice, payment, call record, message and UPI screenshot in it, then opens a fresh copy of the demo books.",
    deleteWorkspace: "Delete my workspace",
    confirmDelete: "Delete everything in your workspace? This cannot be undone.",
    yesDelete: "Yes, delete it",
    keep: "Keep it",
    deleting: "Deleting…",
    notDeleted: "Your workspace could not be deleted. Try again.",
    problems: {
      businessName: "Give your business a name.",
      address: "The address is too long.",
      registrationType: "Choose how you are registered.",
      aggregateTurnoverPaise: "Write the turnover in rupees, like 1,80,00,000.",
      planRule: "The rest must be due after the first instalment; the first instalment is 1% to 100%.",
      autoSendStages: "Only the three messages can go out on their own.",
      ownerEmail: "That email address does not look right.",
      lang: "Choose a language.",
    } as Record<string, string>,
  },
  call: {
    label: "Call with AI",
    noInvoice: "There is no such Invoice in your books.",
    openInvoices: "Open the Invoices",
    back: (number: string) => `‹ Back to ${number}`,
    title: (name: string) => `Call with AI: ${name}`,
    books: "Your books, live",
    booksFailed: "Your books could not be read.",
    decide: "Decide",
    beforeCall: "Before the call",
    consented: (name: string, when: string) => `${name} agreed to reminder calls on ${when}.`,
    notConsented: (name: string) => `${name} has not agreed to reminder calls.`,
    inside: (clock: string) => `Now ${clock}, inside calling hours (10 AM to 6 PM).`,
    outside: (clock: string) => `Now ${clock}, outside calling hours (10 AM to 6 PM).`,
    saysAi: "Munim says it is an AI in its first line.",
    noThreats: "No threats, and no talk of courts, the police or credit scores.",
    rule: (pct: number, first: number, rest: number) =>
      `Your rule: a first instalment of at least ${pct}% within ${first} days, the rest within ${rest} days. Code checks it, not the AI.`,
    yes: "Yes",
    no: "No",
    beCustomer: "Be the Customer",
    play: (name: string) => `Play ${name} ji. Pick how you will answer; your books change with what you say.`,
    personas: {
      cooperative: { title: "Cooperative", what: "Pays the whole bill on one date." },
      short: { title: "Short on cash", what: "Offers too little; the agent counters with your rule." },
      dispute: { title: "Disputes the bill", what: "Says the bill is wrong; the Ladder pauses." },
    },
    blocked: {
      nothing_owed: () => "Nothing is owed on this Invoice.",
      disputed: () => "This Invoice is disputed. Calls stop until you resolve the Dispute.",
      no_consent: (name: string) => `${name} has not agreed to reminder calls. Send a reminder or the pay link instead.`,
      outside_hours: (_name: string, clock: string) => `It is ${clock} by the Demo date clock. Calls are made only between 10 AM and 6 PM.`,
    } satisfies Record<CallBlock, (name: string, clock: string) => string>,
    setClock: "Set the clock to 11 AM",
    clockFailed: "The clock could not be set. Try again.",
    courtesy: (due: string) => `Not due until ${due}: Munim makes a friendly heads-up call, not a reminder of a late bill.`,
    offLabel: "Calls off",
    off: {
      call_unavailable: "Live calls are off on this server right now. Listen to a recorded call instead.",
      daily_cap: "Today's live calls are used up for everyone. Listen to a recorded call instead, or try a live one tomorrow.",
      limit_reached: "This Demo world has used its live calls. Listen to a recorded call instead, or read an earlier call's transcript on the Invoice.",
    },
    start: "Start call",
    mic: (name: string) => `The browser asks for your microphone. Munim speaks Hindi; answer as ${name} ji would.`,
    failedLabel: { mic_denied: "Microphone", no_answer: "No answer", other: "Not now" },
    readSample: "Read a sample call instead",
    hideSample: "Hide the sample call",
    sampleNote: "A sample of how the call goes, written out. Not a recording.",
    connecting: "Connecting…",
    speaking: "Munim is speaking",
    listening: "Listening…",
    endedAfter: (time: string) => `Call ended after ${time}`,
    ended: "Call ended",
    callLabel: "Call",
    gloss: "English gloss",
    endCall: "End call",
    glossFailed: "The English gloss is not available right now.",
    transcript: "Call transcript",
    ruleCheck: "Rule check",
    cost: "Cost",
    costLine: (about: boolean, cost: string, first: string | null) =>
      `This call cost ${about ? "about " : ""}${cost}${first ? `; ${first}` : ""}.`,
    firstDue: (amount: string, when: string) => `${amount} due ${when}`,
    creditsAbout: (time: string, perMinute: number) => `${time} at about ${perMinute} ElevenLabs credits a minute; the exact count follows.`,
    creditsExact: (n: number) => `${n} ElevenLabs credits, as ElevenLabs counted them.`,
    alreadyPaid: (reference: string | null) =>
      `Says the bill is already paid${reference ? ` (reference ${reference})` : ""}. The bank statement will show it.`,
    dispute: (notes: string) => `Raised a Dispute: "${notes}". The Ladder is paused until you resolve it.`,
    callback: (when: string | null) => `Asked to be called back${when ? ` on ${when}` : ""}.`,
    noCommit: "Did not commit to a date. The Ladder carries on.",
    recorded: "What the call recorded",
    planAgreed: "Plan agreed",
    promiseMade: "Promise made",
    needsDecision: "Needs your decision",
    approve: "Approve",
    counter: "Counter",
    decline: "Decline",
    approveNote: (when: string) => `Approving pauses the Ladder till ${when}. If a date is missed, the Ladder starts again on its own.`,
    approvedNote: (when: string, plan: boolean) =>
      `Approved. The Ladder is paused till ${when} and the pay link shows the ${plan ? "Plan" : "Promise"}.`,
    whatsapp: "Send the Hindi confirmation on WhatsApp",
    undo: "Undo",
    countered: (plan: string) => `You countered with ${plan}. The pay link offers it.`,
    declinedNote: "Declined. The Ladder carries on.",
    notSaved: "That did not save. Try again.",
    plan: (plan: readonly Instalment[]) =>
      plan.map((i) => `${formatInr(i.amountPaise)} by ${formatDate(i.date)}`).join(", then "),
    /** Why an offer is outside the Plan rule. */
    issue: (i: PlanIssue) =>
      i.kind === "first_short"
        ? `The first instalment, ${formatInr(i.amountPaise)}, is below your ${i.pct}% rule (${formatInr(i.minPaise)}).`
        : `The ${i.kind === "first_late" ? "first" : "last"} instalment is due on ${formatDate(i.date)}, after your ${i.days} days (${formatDate(i.by)}).`,
  },
  sample: {
    read: "Read a sample call",
    hide: "Hide the sample call",
    who: { munim: "Munim", customer: "Gupta ji", check: "Rule check" },
    listen: "Listen to the recorded call",
    recorded: "A recorded call with Munim, unedited. Hindi, with English captions.",
    checkLow: "₹40,000 by Fri 6 Nov: below your 50% rule (₹59,000), so the agent will counter",
    checkOk: (plan: string) => `${plan}: inside your rule`,
  },
  /** Stored history, worded again. English shows the stored sentence itself, so these are its plain forms. */
  history: {
    sent: (amount: string | null) => `Invoice sent${amount ? `, ${amount}` : ""}`,
    reminder: (stage: string, email: boolean) => `${stage} sent ${email ? "by email" : "on WhatsApp"}`,
    payment: (amount: string | null) => `Payment${amount ? ` of ${amount}` : ""} confirmed against the bank statement`,
    advance: (amount: string | null) => `${amount ?? "The extra"} kept as an advance`,
    paidClaim: "Said on the pay link that the bill is already paid",
    proofUploaded: "Sent a UPI screenshot on the pay link",
    proofMatched: "The UTR on the screenshot is in the bank statement. Matched ✓.",
    talkRequested: "Asked on the pay link to talk to you about more time",
    planAccepted: (plan: string | null) => `Chose a Plan on the pay link${plan ? `: ${plan}` : ""}. The Ladder is paused.`,
    planRequested: (plan: string | null) => `Asked on the pay link for a Plan${plan ? `: ${plan}` : ""}. It needs your decision.`,
    planApproved: (plan: string | null) => `You approved ${plan ?? "the Plan"}. The Ladder is paused and the pay link shows it.`,
    planUndone: (plan: string | null) => `You undid the approval of ${plan ?? "the Plan"}. It waits for your decision again.`,
    planDeclined: (plan: string | null) => `You declined ${plan ?? "the Plan"}. The Ladder carries on.`,
    promise: "Made a Promise on the pay link",
    promiseBroken: "A promised payment did not arrive by its date. The Ladder resumes.",
    dispute: (reason: string | null) => `Raised a Dispute${reason ? `: "${reason}"` : ""}. The Ladder is paused until you resolve it.`,
    consent: "Agreed to reminder calls, 10 AM to 6 PM, on the pay link",
    linkOpened: "Opened the pay link",
    call: "Call with AI. The transcript is kept with this Invoice.",
    paymentByHand: (amount: string | null, how: string, date: string | null) =>
      `You recorded ${amount ?? "a payment"} received ${how}${date ? ` on ${date}` : ""}`,
    cancelled: (reason: string | null) =>
      `You cancelled this Invoice${reason ? `: "${reason}"` : ""}. Its number stays used, and nothing more is sent.`,
    edited: (from: string | null, to: string | null, due: string | null) =>
      `You corrected this Invoice${from && to && from !== to ? `: total ${from} → ${to}` : ""}${due ? `; due ${due}` : ""}.`,
  },
  landing: {
    eightSteps: "Eight steps, and the app moves for you",
    eightStepsFresh: "Eight steps, from a fresh copy of the books",
  },
  tour: {
    progress: (step: number, total: number) => `step ${step} of ${total}`,
    resume: (step: number, total: number) => `Resume tour (step ${step} of ${total})`,
    next: "Next",
    back: "Back",
    end: "End the tour",
    seeProof: "See the proof",
    failed: "The tour could not change the books for this step. The screen still shows what is there.",
    changing: "Changing the books for the next step…",
    scan: "scan it with the camera.",
    qrLabel: "Open this pay link on your phone",
    qr: (label: string) => `QR code: ${label}`,
    steps: {
      salary: {
        title: "Is salary day safe?",
        body: () => (
          <>
            Today adds up the bank balance and the payments due in, less rent, suppliers and salaries, up to salary day.
            The nine pay packets are the nine people paid that day. Press <b>Why?</b> to see every number.
          </>
        ),
      },
      chase: {
        title: "Chase these first",
        body: () => (
          <>
            Unpaid Invoices, ranked by what is owed, how late it is and how this Customer usually pays. Gupta Traders
            owes ₹1,18,000, 38 days late. <b>Why?</b> shows how each row is ranked.
          </>
        ),
      },
      guard: {
        title: "Before the call",
        body: () => (
          <>
            Before Munim, the AI agent, rings anyone, Tagada checks consent, calling hours and your Plan rule. Munim says
            it is an AI in its first line. Code checks the Plan rule, not the AI.
          </>
        ),
      },
      call: {
        title: "Be Gupta ji: take the call",
        body: () => (
          <>
            Press <b>Start call</b> and answer as Gupta ji, in Hindi or English. Offer ₹40,000 on Friday and hear Munim
            ask for more. No microphone, or no time? Hear or read the call below, then press <b>Next</b>: the tour
            records the Plan it agreed.
          </>
        ),
      },
      covered: {
        title: "Salary covered",
        body: (plan: string | null, first: string) => (
          <>
            {plan ? (
              <>
                The tour recorded the Plan the call agreed, on Gupta ji's pay link, as he could himself: {plan}. It is
                inside your rule, so it is agreed and the Ladder pauses for him.
              </>
            ) : (
              <>Once a Plan from Gupta ji is agreed, the Ladder pauses for him.</>
            )}{" "}
            His first {first} lands before salary day, so the pay packets fill and the headline turns to{" "}
            <b>Salary covered</b>.
          </>
        ),
      },
      paylink: {
        title: "Gupta ji's pay link",
        body: () => (
          <>
            This is what Gupta ji sees, in Hindi, with no login. He can pay by UPI, pick a Plan, raise a Dispute, or say{" "}
            <span lang="hi">मैंने भुगतान कर दिया है</span> (I have already paid) and add a screenshot. Nothing counts as
            paid until the bank statement shows it.
          </>
        ),
      },
      week: {
        title: "A week later: the money is in",
        body: (weekDate: string, first: string, came: string) => (
          <>
            The tour imported the week's bank statement, then moved the Demo date on to {weekDate} and ran the daily
            Ladder for it: the same workflow the 10:00 cron starts. Gupta ji's {first} came in on {came}, and it is
            matched to his Invoice. Nothing is paid until you confirm it: press <b>Confirm</b>, or <b>Next</b> and the
            tour confirms it.
          </>
        ),
      },
      done: {
        title: "Salary covered ✓",
        body: () => (
          <>
            Gupta ji kept the Plan's first instalment, and the week's other payments came in, so the salaries are
            covered with money to spare. <b>What Tagada changed</b> adds up the week in four numbers; press <b>Why?</b>{" "}
            on any of them. The Automation log shows every run of the Ladder, with its retries.
          </>
        ),
      },
    },
  },
  print: {
    back: "Back to the Invoice",
    print: "Print or save as PDF",
    english: "English copy",
    customer: "Customer's language",
    caseFailed: "The case file could not be loaded. Reload the page to try again.",
    caseLoading: "Loading the case file…",
    upiNote: "Simulated UPI ID: no one is paid",
    bankNote: "Sample account for this Demo world. No one is paid.",
    invoiceLoading: "Loading the Invoice…",
  },
  duplicate: {
    title: "Duplicate this invoice",
    crumb: "duplicate",
    preview: (name: string, credit: number) =>
      `A preview of the same lines for ${name}, dated today with ${credit} days' credit. Nothing is saved until you open it in the new-invoice form.`,
    open: "Open in the new invoice form",
  },
  proofPage: {
    title: "Every rupee, checked",
    intro:
      "The brief's money cases, and the domain cases for the Ladder, matching, the Plan rule, Grade, Section 43B(h), Ageing, the chase order, the letter and the forecast headline. Computed in this browser from the same packages the app uses.",
    built: (commit: ReactNode) => (
      <>
        Built from {commit}. Each case links to the test that locks it, at that commit.
      </>
    ),
    msmed:
      "MSMED is the Micro, Small and Medium Enterprises Development Act. A micro or small supplier that is not a trader may charge compound interest on a late payment, with interest added to the amount owed each month, at three times the RBI Bank Rate. The figure is worked out by Tagada's interest code.",
    tds:
      "TDS is tax deducted at source. Some Customers must keep back a set share of a payment and pay that share to the tax department in the supplier's name. Possible TDS means the amount kept back is exactly 0.1%, 1%, 2% or 10% of the taxable value.",
    passed: (passed: number, total: number, time: string) => `${passed} of ${total} passed in ${time}`,
    again: "Run again",
    expected: "Expected",
    got: "Got",
    pass: "✓ Pass",
    fail: "✗ Fail",
    note: "The cases themselves stay in English: they are the inputs and outputs the tests check, word for word.",
  },
};

export type Copy = typeof en;
