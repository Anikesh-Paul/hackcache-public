// The Customer's pay link, /pay/:token: a bill-book slip, Hindi first, for a
// 360 px phone. It talks only to the server with the pay token (lib/pay.ts).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useParams } from "react-router";
import { ArrowRight, Check, Clock, IndianRupee, Loader2, Upload, Volume2 } from "lucide-react";
import { formatDate, formatInr, sumPaise, upiPayUri, weekday } from "@tagada/money";
import { pay, PayError, type PayInstalment, type PaySlip } from "../lib/pay.ts";
import { Badge } from "../ui.tsx";
import { UpiQr } from "./TaxInvoice.tsx";

type Lang = "hi" | "bn" | "en";
const LANGS: { code: Lang; name: string }[] = [
  { code: "hi", name: "हिन्दी" },
  { code: "bn", name: "বাংলা" },
  { code: "en", name: "English" },
];

type Rule = PaySlip["rule"];

type Words = {
  hello: (name: string) => string;
  from: (business: string) => string;
  bill: string;
  issued: string;
  due: string;
  late: string;
  days: (n: number) => string;
  owed: string;
  listen: string;
  listenFailed: string;
  pay: (amount: string) => string;
  payNote: string;
  paid: string;
  paidNote: string;
  time: string;
  timeNote: string;
  dispute: string;
  pickTitle: string;
  pickRule: (rule: Rule) => string;
  instalments: (n: number) => string;
  talk: (business: string) => string;
  talkNote: string;
  choose: string;
  cancel: string;
  nth: (n: number) => string;
  total: string;
  planTitle: string;
  promiseTitle: string;
  planNote: string;
  askedTitle: string;
  askedNote: (business: string) => string;
  askedPlan: string;
  claimTitle: string;
  thanks: string;
  thanksNote: string;
  thanksShot: string;
  upload: string;
  uploadNote: string;
  sending: string;
  fileFailed: string;
  disputeTitle: string;
  disputeHint: string;
  send: string;
  disputedTitle: string;
  disputedNote: (business: string) => string;
  paidTitle: string;
  paidThanks: string;
  qr: string;
  foot: (business: string) => string;
  demoUpi: string;
  loading: string;
  invalid: string;
  expired: string;
  failed: string;
  weekdays: string[];
  months: string[];
};

const WORDS: Record<Lang, Words> = {
  hi: {
    hello: (name) => `नमस्ते, ${name}`,
    from: (business) => `${business} का संदेश`,
    bill: "बिल",
    issued: "जारी",
    due: "आखिरी तारीख",
    late: "देरी",
    days: (n) => `${n} दिन`,
    owed: "बकाया राशि",
    listen: "सुनें",
    listenFailed: "अभी सुनाया नहीं जा सका।",
    pay: (amount) => `UPI से ${amount} भरें`,
    payNote: "कोई भी UPI ऐप",
    paid: "मैंने भुगतान कर दिया है",
    paidNote: "स्क्रीनशॉट भेजें",
    time: "थोड़ा समय चाहिए",
    timeNote: "किश्तों में चुकाएं",
    dispute: "बिल में गड़बड़ी है? बताएं",
    pickTitle: "किश्तें चुनें",
    pickRule: (r) => `पहली किश्त कम से कम ${r.minFirstPct}%, ${r.firstWithinDays} दिन में; बाकी ${r.restWithinDays} दिन में।`,
    instalments: (n) => `${n} किश्तें`,
    talk: (business) => `${business} से बात करनी है`,
    talkNote: "वे आपसे संपर्क करेंगे",
    choose: "यह तय करें",
    cancel: "रहने दें",
    nth: (n) => ["पहली किश्त", "दूसरी किश्त", "तीसरी किश्त"][n] ?? `किश्त ${n + 1}`,
    total: "कुल",
    planTitle: "आपकी किश्तें",
    promiseTitle: "आपका वादा",
    planNote: "किश्तें समय पर आती रहें तो कोई याद नहीं भेजी जाएगी।",
    askedTitle: "आपका अनुरोध भेज दिया गया है",
    askedNote: (business) => `${business} जवाब देंगे। चाहें तो तब तक UPI से भर भी सकते हैं।`,
    askedPlan: "आपने ये किश्तें मांगी हैं",
    claimTitle: "भुगतान: बैंक से पुष्टि का इंतज़ार",
    thanks: "धन्यवाद",
    thanksNote: "हम बैंक में पुष्टि होते ही आपको बताएंगे।",
    thanksShot: "स्क्रीनशॉट मिल गया। बैंक में पुष्टि होते ही हम आपको बताएंगे।",
    upload: "UPI स्क्रीनशॉट भेजें",
    uploadNote: "JPG, PNG या WebP, 5 MB तक",
    sending: "भेजा जा रहा है…",
    fileFailed: "यह फ़ाइल नहीं जा सकी। JPG, PNG या WebP फ़ोटो भेजें, 5 MB तक।",
    disputeTitle: "बिल में क्या गड़बड़ है?",
    disputeHint: "जैसे: 2 कुर्सियां टूटी हुई आईं",
    send: "भेजें",
    disputedTitle: "आपकी बात पहुंच गई",
    disputedNote: (business) => `${business} इसे देखेंगे। तब तक कोई याद नहीं भेजी जाएगी।`,
    paidTitle: "यह बिल पूरा भर दिया गया है",
    paidThanks: "धन्यवाद!",
    qr: "किसी भी UPI ऐप से स्कैन करें",
    foot: (business) => `यह संदेश ${business} ने Tagada से भेजा है।`,
    demoUpi: "डेमो UPI ID, इससे कोई पैसा नहीं जाता।",
    loading: "बिल खोला जा रहा है…",
    invalid: "यह लिंक सही नहीं है। जिसने भेजा, उनसे नया लिंक मांगें।",
    expired: "यह लिंक पुराना हो गया है। जिसने भेजा, उनसे नया लिंक मांगें।",
    failed: "अभी कुछ गड़बड़ हुई। थोड़ी देर बाद फिर कोशिश करें।",
    weekdays: ["रवि", "सोम", "मंगल", "बुध", "गुरु", "शुक्र", "शनि"],
    months: ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"],
  },
  bn: {
    hello: (name) => `নমস্কার, ${name}`,
    from: (business) => `${business}-এর অনুস্মারক`,
    bill: "বিল",
    issued: "জারি",
    due: "শেষ তারিখ",
    late: "দেরি",
    days: (n) => `${n} দিন`,
    owed: "বকেয়া টাকা",
    listen: "হিন্দিতে শুনুন",
    listenFailed: "এখন শোনানো গেল না।",
    pay: (amount) => `UPI দিয়ে ${amount} দিন`,
    payNote: "যেকোনো UPI অ্যাপ",
    paid: "আমি পেমেন্ট করে দিয়েছি",
    paidNote: "স্ক্রিনশট পাঠান",
    time: "একটু সময় দরকার",
    timeNote: "কিস্তিতে দিন",
    dispute: "বিলে কোনো ভুল আছে? জানান",
    pickTitle: "কিস্তি বেছে নিন",
    pickRule: (r) =>
      `প্রথম কিস্তি অন্তত ${r.minFirstPct}%, ${r.firstWithinDays} দিনের মধ্যে; বাকিটা ${r.restWithinDays} দিনের মধ্যে।`,
    instalments: (n) => `${n}টি কিস্তি`,
    talk: (business) => `${business}-এর সঙ্গে কথা বলতে চাই`,
    talkNote: "ওঁরা আপনার সঙ্গে যোগাযোগ করবেন",
    choose: "এটা ঠিক করুন",
    cancel: "থাক",
    nth: (n) => ["প্রথম কিস্তি", "দ্বিতীয় কিস্তি", "তৃতীয় কিস্তি"][n] ?? `কিস্তি ${n + 1}`,
    total: "মোট",
    planTitle: "আপনার কিস্তি",
    promiseTitle: "আপনার কথা দেওয়া পেমেন্ট",
    planNote: "সময়মতো কিস্তি এলে কোনো অনুস্মারক পাঠানো হবে না।",
    askedTitle: "আপনার অনুরোধ পাঠানো হয়েছে",
    askedNote: (business) => `${business} উত্তর দেবেন। চাইলে এর মধ্যে UPI দিয়েও দিতে পারেন।`,
    askedPlan: "আপনি এই কিস্তি চেয়েছেন",
    claimTitle: "পেমেন্ট: ব্যাংকের নিশ্চিতকরণের অপেক্ষা",
    thanks: "ধন্যবাদ",
    thanksNote: "ব্যাংকে নিশ্চিত হলেই আপনাকে জানাব।",
    thanksShot: "স্ক্রিনশট পেয়েছি। ব্যাংকে নিশ্চিত হলেই আপনাকে জানাব।",
    upload: "UPI স্ক্রিনশট পাঠান",
    uploadNote: "JPG, PNG বা WebP, 5 MB পর্যন্ত",
    sending: "পাঠানো হচ্ছে…",
    fileFailed: "এই ফাইলটি পাঠানো গেল না। JPG, PNG বা WebP ছবি পাঠান, 5 MB পর্যন্ত।",
    disputeTitle: "বিলে কী ভুল আছে?",
    disputeHint: "যেমন: 2টি চেয়ার ভাঙা এসেছে",
    send: "পাঠান",
    disputedTitle: "আপনার কথা পৌঁছেছে",
    disputedNote: (business) => `${business} দেখবেন। ততদিন কোনো অনুস্মারক পাঠানো হবে না।`,
    paidTitle: "এই বিল পুরো মিটে গেছে",
    paidThanks: "ধন্যবাদ!",
    qr: "যেকোনো UPI অ্যাপ দিয়ে স্ক্যান করুন",
    foot: (business) => `${business} এই বার্তাটি Tagada দিয়ে পাঠিয়েছে।`,
    demoUpi: "ডেমো UPI ID, এতে কোনো টাকা যায় না।",
    loading: "বিল খোলা হচ্ছে…",
    invalid: "এই লিঙ্কটি ঠিক নয়। যিনি পাঠিয়েছেন, তাঁর কাছে নতুন লিঙ্ক চান।",
    expired: "এই লিঙ্কের মেয়াদ শেষ। যিনি পাঠিয়েছেন, তাঁর কাছে নতুন লিঙ্ক চান।",
    failed: "এখন কিছু সমস্যা হয়েছে। একটু পরে আবার চেষ্টা করুন।",
    weekdays: ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহস্পতি", "শুক্র", "শনি"],
    months: ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"],
  },
  en: {
    hello: (name) => `Namaste, ${name}`,
    from: (business) => `A message from ${business}`,
    bill: "Invoice",
    issued: "issued",
    due: "Last date",
    late: "Late by",
    days: (n) => `${n} ${n === 1 ? "day" : "days"}`,
    owed: "Amount due",
    listen: "Listen in Hindi",
    listenFailed: "It could not be played just now.",
    pay: (amount) => `Pay ${amount} by UPI`,
    payNote: "Any UPI app",
    paid: "I've already paid",
    paidNote: "Send a screenshot",
    time: "I need some time",
    timeNote: "Pay in instalments",
    dispute: "Something wrong with the bill? Tell us",
    pickTitle: "Pick your instalments",
    pickRule: (r) =>
      `The first is at least ${r.minFirstPct}%, within ${r.firstWithinDays} days; the rest within ${r.restWithinDays} days.`,
    instalments: (n) => `${n} instalments`,
    talk: (business) => `I'd like to talk to ${business}`,
    talkNote: "They will get in touch",
    choose: "Agree to this",
    cancel: "Not now",
    nth: (n) => ["First instalment", "Second instalment", "Third instalment"][n] ?? `Instalment ${n + 1}`,
    total: "Total",
    planTitle: "Your instalments",
    promiseTitle: "Your promised payment",
    planNote: "While the instalments arrive on time, no reminders are sent.",
    askedTitle: "Your request has been sent",
    askedNote: (business) => `${business} will reply. You can still pay by UPI meanwhile.`,
    askedPlan: "The instalments you asked for",
    claimTitle: "Your payment: waiting for the bank to confirm",
    thanks: "Thank you",
    thanksNote: "We'll let you know as soon as the bank confirms it.",
    thanksShot: "Screenshot received. We'll let you know as soon as the bank confirms it.",
    upload: "Send the UPI screenshot",
    uploadNote: "JPG, PNG or WebP, up to 5 MB",
    sending: "Sending…",
    fileFailed: "That file could not be sent. Send a JPG, PNG or WebP photo, up to 5 MB.",
    disputeTitle: "What is wrong with the bill?",
    disputeHint: "For example: 2 chairs arrived broken",
    send: "Send",
    disputedTitle: "Your message has reached them",
    disputedNote: (business) => `${business} will look into it. No reminders are sent meanwhile.`,
    paidTitle: "This bill is paid in full",
    paidThanks: "Thank you!",
    qr: "Scan with any UPI app",
    foot: (business) => `Sent by ${business} using Tagada.`,
    demoUpi: "A demo UPI ID: no money moves.",
    loading: "Opening the bill…",
    invalid: "This link is not right. Ask whoever sent it for a new one.",
    expired: "This link has expired. Ask whoever sent it for a new one.",
    failed: "Something went wrong just now. Please try again in a moment.",
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    months: [],
  },
};

/** "शुक्र, 6 नवंबर" in the page's language. Latin digits on every page, so each page keeps one digit system. */
function dateIn(lang: Lang, iso: string): string {
  if (lang === "en") return formatDate(iso);
  const t = WORDS[lang];
  const [, month, day] = iso.split("-").map(Number);
  return `${t.weekdays[weekday(iso) ?? 0]}, ${day} ${t.months[(month ?? 1) - 1]}`;
}

function startLang(slip: PaySlip): Lang {
  return slip.customer.lang === "bn" || slip.customer.lang === "en" ? slip.customer.lang : "hi";
}

type Load = { status: "loading" } | { status: "failed"; code: string } | { status: "ready"; slip: PaySlip };

export function PayLink() {
  const { token = "" } = useParams();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [lang, setLang] = useState<Lang>("hi");
  /** The state the Customer just moved the slip into: its stamp lands once. */
  const [justDone, setJustDone] = useState<PaySlip["state"] | null>(null);

  useEffect(() => {
    let live = true;
    pay.slip(token).then(
      (slip) => {
        if (!live) return;
        setLang(startLang(slip));
        setLoad({ status: "ready", slip });
      },
      (e: unknown) => live && setLoad({ status: "failed", code: e instanceof PayError ? e.code : "pay_unavailable" }),
    );
    return () => {
      live = false;
    };
  }, [token]);

  useEffect(() => {
    document.title = load.status === "ready" ? `${load.slip.from.businessName}: ${load.slip.invoice.number}` : "Tagada";
  }, [load]);

  const t = WORDS[lang];
  return (
    <div className="paydesk" lang={lang}>
      <div className="paytop">
        <span className="flex items-baseline gap-2">
          <span lang="hi" className="text-xl font-bold">
            तगादा
          </span>
          <span className="text-[13px] text-ink-2">Tagada</span>
        </span>
        <div role="group" aria-label="भाषा / Language" className="seg">
          {LANGS.map((l) => (
            <button key={l.code} type="button" lang={l.code} aria-pressed={lang === l.code} onClick={() => setLang(l.code)}>
              {l.name}
            </button>
          ))}
        </div>
      </div>
      {load.status === "ready" ? (
        <Slip
          token={token}
          slip={load.slip}
          lang={lang}
          justDone={justDone}
          onChange={(slip) => {
            setJustDone(slip.state === load.slip.state ? justDone : slip.state);
            setLoad({ status: "ready", slip });
          }}
        />
      ) : (
        <article className="slip" aria-live="polite">
          <div className="px-5 sm:px-8">
            {load.status === "loading" ? (
              <p className="text-ink-2">{t.loading}</p>
            ) : (
              <p className="text-lg">
                {load.code === "link_expired" ? t.expired : load.code === "invalid_link" ? t.invalid : t.failed}
              </p>
            )}
          </div>
        </article>
      )}
    </div>
  );
}

function Slip({
  token,
  slip,
  lang,
  justDone,
  onChange,
}: {
  token: string;
  slip: PaySlip;
  lang: Lang;
  justDone: PaySlip["state"] | null;
  onChange: (slip: PaySlip) => void;
}) {
  const t = WORDS[lang];
  const business = slip.from.businessName;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"plan" | "dispute" | null>(null);

  const run = async (action: () => Promise<PaySlip>) => {
    setBusy(true);
    setError(null);
    try {
      onChange(await action());
      setPanel(null);
    } catch (e) {
      // Already done, perhaps in another tab: show what the server has now instead of an error.
      const moved = e instanceof PayError && e.code.startsWith("already_");
      setError(moved ? null : t.failed);
      if (moved) await pay.slip(token).then(onChange, () => {});
    } finally {
      setBusy(false);
    }
  };

  const nextInstalment = slip.state === "plan" ? slip.plan?.[0] : undefined;
  const upiAmount = nextInstalment?.amountPaise ?? slip.invoice.balancePaise;
  const upi =
    slip.from.upiVpa && upiAmount > 0
      ? upiPayUri({ vpa: slip.from.upiVpa, payeeName: business, amountPaise: upiAmount, note: `${t.bill} ${slip.invoice.number}` })
      : null;
  const canPay = slip.state === "owing" || slip.state === "plan" || slip.state === "asked";

  return (
    <article className="slip">
      <div className="inner">
        <div className="min-w-0">
          <div className="px-ln">
            <h1 className="hello">{t.hello(slip.customer.name)}</h1>
            <p className="mt-0.5 text-ink-2">{t.from(business)}</p>
            <p className="mt-3 text-[13px] text-ink-2">
              {t.bill} <span className="mono">{slip.invoice.number}</span>, {t.issued} {dateIn(lang, slip.invoice.issueDate)}
              {slip.from.gstin && (
                <>
                  <br />
                  {business}, GSTIN <span className="mono">{slip.from.gstin}</span>
                </>
              )}
            </p>
            <ReadAloud token={token} slip={slip} t={t} />
          </div>

          <Standing slip={slip} lang={lang} justDone={justDone} />

          {canPay && (
            <div className="opts px-ln">
              {upi && (
                <a className="opt main" href={upi}>
                  <span className="oi">
                    <IndianRupee aria-hidden />
                  </span>
                  <span>
                    {t.pay(formatInr(upiAmount))}
                    <small>{t.payNote}</small>
                  </span>
                  <ArrowRight aria-hidden className="ar" />
                </a>
              )}
              <button type="button" className="opt" disabled={busy} onClick={() => run(() => pay.paid(token))} data-tour="paid">
                <span className="oi">
                  <Upload aria-hidden />
                </span>
                <span>
                  {t.paid}
                  <small>{t.paidNote}</small>
                </span>
                <ArrowRight aria-hidden className="ar" />
              </button>
              {slip.state === "owing" && slip.choices.length > 0 && (
                <button
                  type="button"
                  className="opt"
                  aria-expanded={panel === "plan"}
                  aria-controls="plan-picker"
                  onClick={() => setPanel(panel === "plan" ? null : "plan")}
                >
                  <span className="oi">
                    <Clock aria-hidden />
                  </span>
                  <span>
                    {t.time}
                    <small>{t.timeNote}</small>
                  </span>
                  <ArrowRight aria-hidden className="ar" />
                </button>
              )}
              {panel === "plan" && (
                <PlanPicker
                  slip={slip}
                  lang={lang}
                  busy={busy}
                  onCancel={() => setPanel(null)}
                  onPick={(instalments) => run(() => pay.plan(token, instalments))}
                  onTalk={() => run(() => pay.talkToOwner(token))}
                />
              )}
            </div>
          )}

          {slip.state === "paid_claim" && !slip.screenshotSent && !slip.inBank && (
            <ScreenshotUpload t={t} busy={busy} onFile={(file) => run(() => pay.screenshot(token, file))} />
          )}

          {(canPay || slip.state === "paid_claim") && (
            <div className="px-ln mt-5">
              {panel === "dispute" ? (
                <DisputeForm t={t} busy={busy} onCancel={() => setPanel(null)} onSend={(reason) => run(() => pay.dispute(token, reason))} />
              ) : (
                <button
                  type="button"
                  className="linkbtn min-h-11 text-[15px]"
                  onClick={() => setPanel("dispute")}
                >
                  {t.dispute}
                </button>
              )}
            </div>
          )}

          <p className="px-ln mt-3 min-h-6 text-[15px] text-sindoor" role="alert">
            {error}
          </p>
        </div>

        {upi && canPay && (
          <aside className="max-md:hidden">
            <UpiQr uri={upi} label={`${t.qr}: ${formatInr(upiAmount)}`} className="aspect-square w-full rounded-lg border border-rule" />
            <p className="mt-2 text-center text-[13px] text-ink-2">
              {t.qr}
              <br />
              <span className="mono">{slip.from.upiVpa}</span>
            </p>
          </aside>
        )}

        <div className="foot">
          {t.foot(business)}
          {upi && (
            <span className="mt-1 flex flex-wrap items-center gap-2">
              <Badge kind="sim">demo</Badge> <span className="mono">{slip.from.upiVpa}</span> {t.demoUpi}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/** What is owed, or, once the Customer has acted, what they agreed: never both (§6.7 fix 12). */
function Standing({ slip, lang, justDone }: { slip: PaySlip; lang: Lang; justDone: PaySlip["state"] | null }) {
  const t = WORDS[lang];
  const business = slip.from.businessName;
  switch (slip.state) {
    case "owing":
    case "asked":
      return (
        <>
          {slip.state === "asked" && (
            <Note title={t.askedTitle} land={justDone === "asked"}>
              {t.askedNote(business)}
            </Note>
          )}
          {slip.state === "asked" && slip.plan ? (
            <Instalments title={t.askedPlan} plan={slip.plan} lang={lang} />
          ) : (
            <div className="owed">
              <Line label={t.due} value={dateIn(lang, slip.invoice.dueDate)} />
              {slip.state === "owing" && slip.invoice.daysLate > 0 && (
                <Line label={t.late} value={t.days(slip.invoice.daysLate)} />
              )}
              <div className="ln big">
                <div className="m" />
                <div className="p">{t.owed}</div>
                <div className="a">
                  <span className="dbl">{formatInr(slip.invoice.balancePaise)}</span>
                </div>
              </div>
            </div>
          )}
        </>
      );
    case "plan":
      return (
        <>
          <Instalments
            title={(slip.plan?.length ?? 0) > 1 ? t.planTitle : t.promiseTitle}
            plan={slip.plan ?? []}
            lang={lang}
          />
          <p className="px-ln mt-2 text-[14px] text-ink-2">{t.planNote}</p>
        </>
      );
    case "paid_claim":
      return (
        <div className="px-ln mt-6">
          <h2 className="text-lg font-semibold">{t.claimTitle}</h2>
          <div className="thanks">
            {/* Money that reached the bank on its own was never claimed here, so there is nothing to thank for. */}
            {!slip.inBank && (
              <span className={`stamp ok ${justDone === "paid_claim" ? "land" : ""}`}>
                <Check aria-hidden /> {t.thanks}
              </span>
            )}
            <p>{slip.screenshotSent ? t.thanksShot : t.thanksNote}</p>
          </div>
        </div>
      );
    case "disputed":
      return (
        <Note title={t.disputedTitle} land={justDone === "disputed"}>
          {t.disputedNote(business)}
        </Note>
      );
    case "paid":
      return (
        <Note title={t.paidTitle} land={false}>
          {t.paidThanks}
        </Note>
      );
  }
}

function Note({ title, land, children }: { title: string; land: boolean; children: ReactNode }) {
  return (
    <div className={`px-ln mt-6 ${land ? "write-in" : ""}`} role="status">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 max-w-[42ch] text-[16px]">{children}</p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="ln">
      <div className="m" />
      <div className="p">{label}</div>
      <div className="a">{value}</div>
    </div>
  );
}

function Instalments({ title, plan, lang }: { title: string; plan: readonly PayInstalment[]; lang: Lang }) {
  const t = WORDS[lang];
  return (
    <div className="plan">
      <div className="ln wide head-line">
        <div className="m" />
        <div className="p font-semibold">{title}</div>
      </div>
      {plan.map((instalment, n) => (
        <div key={instalment.date} className="ln">
          <div className="m" />
          <div className="p">
            {plan.length > 1 ? t.nth(n) : t.due}
            <small>{dateIn(lang, instalment.date)}</small>
          </div>
          <div className="a">{formatInr(instalment.amountPaise)}</div>
        </div>
      ))}
      {plan.length > 1 && (
        <div className="ln total">
          <div className="m" />
          <div className="p font-semibold">{t.total}</div>
          <div className="a font-semibold">
            <span className="dbl">{formatInr(sumPaise(plan.map((i) => i.amountPaise)))}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanPicker({
  slip,
  lang,
  busy,
  onPick,
  onTalk,
  onCancel,
}: {
  slip: PaySlip;
  lang: Lang;
  busy: boolean;
  onPick: (instalments: PayInstalment[]) => void;
  onTalk: () => void;
  onCancel: () => void;
}) {
  const t = WORDS[lang];
  const [choice, setChoice] = useState<number | "talk">(0);
  const submit = () => {
    if (choice === "talk") return onTalk();
    const picked = slip.choices[choice];
    if (picked) onPick(picked);
  };
  return (
    <fieldset id="plan-picker" className="picker">
      <legend className="text-[17px] font-semibold">{t.pickTitle}</legend>
      <p className="text-[14px] text-ink-2">{t.pickRule(slip.rule)}</p>
      <div className="mt-3 grid gap-2">
        {slip.choices.map((plan, n) => (
          <label key={plan.map((i) => i.date).join()} className="choice">
            <input type="radio" name="plan" checked={choice === n} onChange={() => setChoice(n)} />
            <span>
              <b>{t.instalments(plan.length)}</b>
              {plan.map((i, k) => (
                <small key={i.date}>
                  {t.nth(k)}: {formatInr(i.amountPaise)}, {dateIn(lang, i.date)}
                </small>
              ))}
            </span>
          </label>
        ))}
        <label className="choice">
          <input type="radio" name="plan" checked={choice === "talk"} onChange={() => setChoice("talk")} />
          <span>
            <b>{t.talk(slip.from.businessName)}</b>
            <small>{t.talkNote}</small>
          </span>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn primary" disabled={busy} onClick={submit}>
          {busy && <Loader2 aria-hidden className="animate-spin" />} {t.choose}
        </button>
        <button type="button" className="btn secondary" onClick={onCancel}>
          {t.cancel}
        </button>
      </div>
    </fieldset>
  );
}

function DisputeForm({
  t,
  busy,
  onSend,
  onCancel,
}: {
  t: Words;
  busy: boolean;
  onSend: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (reason.trim()) onSend(reason.trim());
      }}
    >
      <label htmlFor="dispute-reason" className="block text-[17px] font-semibold">
        {t.disputeTitle}
      </label>
      <textarea
        id="dispute-reason"
        ref={ref}
        rows={3}
        maxLength={500}
        value={reason}
        placeholder={t.disputeHint}
        onChange={(e) => setReason(e.target.value)}
        className="mt-2 w-full rounded-md border border-rule-strong bg-paper p-3 text-[16px]"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="submit" className="btn primary" disabled={busy || !reason.trim()}>
          {t.send}
        </button>
        <button type="button" className="btn secondary" onClick={onCancel}>
          {t.cancel}
        </button>
      </div>
    </form>
  );
}

function ScreenshotUpload({ t, busy, onFile }: { t: Words; busy: boolean; onFile: (file: File) => void }) {
  const [bad, setBad] = useState(false);
  return (
    <div className="px-ln mt-5">
      <label className={`opt upload ${busy ? "opacity-60" : ""}`}>
        <span className="oi">{busy ? <Loader2 aria-hidden className="animate-spin" /> : <Upload aria-hidden />}</span>
        <span>
          {busy ? t.sending : t.upload}
          <small>{t.uploadNote}</small>
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= 5 * 1024 * 1024;
            setBad(!ok);
            if (ok) onFile(file);
          }}
        />
      </label>
      {bad && (
        <p className="mt-2 text-[15px] text-sindoor" role="alert">
          {t.fileFailed}
        </p>
      )}
    </div>
  );
}

/** The slip read aloud in Hindi, spoken once on the server and kept in Storage. */
function ReadAloud({ token, slip, t }: { token: string; slip: PaySlip; t: Words }) {
  const [state, setState] = useState<"idle" | "playing" | "failed">("idle");
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => audio.current?.pause(), []);
  // A new state means new words: drop the old clip.
  useEffect(() => {
    audio.current?.pause();
    audio.current = null;
    setState("idle");
  }, [slip.state, slip.screenshotSent]);
  const play = async () => {
    if (state === "playing") {
      audio.current?.pause();
      setState("idle");
      return;
    }
    audio.current ??= new Audio(`${pay.audioUrl(token)}?v=${slip.state}${slip.screenshotSent ? "s" : ""}`);
    audio.current.onended = () => setState("idle");
    setState("playing");
    try {
      await audio.current.play();
    } catch {
      audio.current = null;
      setState("failed");
    }
  };
  return (
    <p className="mt-3 flex flex-wrap items-center gap-3">
      <button type="button" className="btn secondary" aria-pressed={state === "playing"} onClick={play}>
        <Volume2 aria-hidden /> {t.listen}
      </button>
      {state === "failed" && (
        <span className="text-[14px] text-ink-2" role="status">
          {t.listenFailed}
        </span>
      )}
    </p>
  );
}
