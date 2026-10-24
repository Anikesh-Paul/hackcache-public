// The 2-minute guided tour (build plan §6.5): eight coach marks over the real
// app. Each step opens its own screen and, where the story needs it, puts the
// Demo world in the right state itself, and says so. The tour lives above the
// router's pages, so it carries on across the Owner's books, the call and the
// Customer's pay link. Going anywhere else folds it into a "Resume tour" chip.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { bankTxnId, planInWords } from "@tagada/domain";
import { addDays, formatDate, formatInr } from "@tagada/money";
import { GUPTA_PLAN, GUPTA_PROOF_DATE, GUPTA_PROOF_UTR } from "@tagada/seed";
import { confirmBank, importBank, runLadder } from "./lib/appwrite.ts";
import { pay } from "./lib/pay.ts";
import { PayLinkQr } from "./pay-qr.tsx";
import { ownerCopy } from "./i18n/owner.ts";
import { useLang } from "./lib/prefs.ts";
import { CallPlayer } from "./sample-call.tsx";

/** What the tour needs to know about the visitor's Demo world, read once on the landing page. */
export type TourStart = { workspaceId: string; invoiceId: string; token: string | null; today: string };

type TourState = TourStart & {
  step: number;
  /** What the tour did to the books, said on the step that did it. */
  plan: string | null;
  jumped: boolean;
  /** On the way to the step's screen. Otherwise, being anywhere else folds the tour into its chip. */
  arrive: boolean;
};

type Ctx = { start: (from: TourStart) => void; active: boolean };

const TourCtx = createContext<Ctx>({ start: () => {}, active: false });
const KEY = "tagada.tour";
const WEEK = 7;
const [FIRST] = GUPTA_PLAN;

function load(): TourState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TourState) : null;
  } catch {
    return null;
  }
}

function save(state: TourState | null) {
  try {
    if (state) sessionStorage.setItem(KEY, JSON.stringify(state));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Private windows can refuse storage; the tour still runs until a reload.
  }
}

type Step = {
  title: string;
  /** Where the step happens. */
  route: (s: TourState) => string;
  /** The element the coach mark rings; the step still reads without it. */
  target: string;
  body: (s: TourState) => ReactNode;
  /** Puts the books in the state the step talks about. Returns what changed. */
  enter?: (s: TourState) => Promise<Partial<TourState>>;
  extra?: (s: TourState) => ReactNode;
};

/** Gupta ji agrees, on his pay link, the Plan the sample call agreed, unless a Plan is already in place. */
async function agreePlan(s: TourState): Promise<Partial<TourState>> {
  if (!s.token) return {};
  const slip = await pay.slip(s.token);
  if (slip.state !== "owing") return {};
  await pay.plan(s.token, [...GUPTA_PLAN]);
  return { plan: planInWords(GUPTA_PLAN) };
}

/** The week's bank statement comes in, then the Demo date moves on a week and the daily Ladder runs for it, once per tour. */
async function aWeekLater(s: TourState): Promise<Partial<TourState>> {
  if (s.jumped) return {};
  await importBank({ sample: true });
  await runLadder(addDays(s.today, WEEK));
  return { jumped: true };
}

/** Gupta ji's first instalment, as the statement has it. */
function guptaCreditId(s: TourStart): string {
  return bankTxnId({ workspaceId: s.workspaceId, date: GUPTA_PROOF_DATE, amountPaise: FIRST.amountPaise, reference: GUPTA_PROOF_UTR });
}

/** The Owner's Confirm on Gupta ji's credit. A credit already confirmed is left as it is. */
async function confirmGupta(s: TourState): Promise<Partial<TourState>> {
  await confirmBank({ ids: [guptaCreditId(s)] });
  return {};
}

const STEPS: Step[] = [
  {
    title: "Is salary day safe?",
    route: () => "/app",
    target: '[data-tour="headline"]',
    body: () => (
      <>
        Today adds up the bank balance and the payments due in, less rent, suppliers and salaries, up to salary day. The
        nine pay packets are the nine people paid that day. Press <b>Why?</b> to see every number.
      </>
    ),
  },
  {
    title: "Chase these first",
    route: () => "/app",
    target: '[data-tour="chase"]',
    body: () => (
      <>
        Unpaid Invoices, ranked by what is owed, how late it is and how this Customer usually pays. Gupta Traders owes
        ₹1,18,000, 38 days late. <b>Why?</b> shows how each row is ranked.
      </>
    ),
  },
  {
    title: "Before the call",
    route: (s) => `/call/${s.invoiceId}`,
    target: '[data-tour="guard"]',
    body: () => (
      <>
        Before Munim, the AI agent, rings anyone, Tagada checks consent, calling hours and your Plan rule. Munim says
        it is an AI in its first line. Code checks the Plan rule, not the AI.
      </>
    ),
  },
  {
    title: "Be Gupta ji: take the call",
    route: (s) => `/call/${s.invoiceId}`,
    target: '[data-tour="start"]',
    body: () => (
      <>
        Press <b>Start call</b> and answer as Gupta ji, in Hindi or English. Offer ₹40,000 on Friday and hear Munim
        ask for more. No microphone, or no time? Hear or read the call below, then press <b>Next</b>: the tour records
        the Plan it agreed.
      </>
    ),
    extra: () => <CallPlayer />,
  },
  {
    title: "Salary covered",
    route: () => "/app",
    target: '[data-tour="headline"]',
    enter: agreePlan,
    body: (s) => (
      <>
        {s.plan ? (
          <>
            The tour recorded the Plan the call agreed, on Gupta ji's pay link, as he could himself: {s.plan}. It is
            inside your rule, so it is agreed and the Ladder pauses for him.
          </>
        ) : (
          <>Once a Plan from Gupta ji is agreed, the Ladder pauses for him.</>
        )}{" "}
        His first {formatInr(FIRST.amountPaise)} lands before salary day, so the pay packets fill and the headline turns
        to <b>Salary covered</b>.
      </>
    ),
  },
  {
    title: "Gupta ji's pay link",
    route: (s) => (s.token ? `/pay/${s.token}` : `/app/invoices/${s.invoiceId}`),
    target: '[data-tour="paid"]',
    body: () => (
      <>
        This is what Gupta ji sees, in Hindi, with no login. He can pay by UPI, pick a Plan, raise a Dispute, or say{" "}
        <span lang="hi">मैंने भुगतान कर दिया है</span> (I have already paid) and add a screenshot. Nothing counts as
        paid until the bank statement shows it.
      </>
    ),
    extra: (s) => (s.token ? <PayLinkQr token={s.token} label="Open this pay link on your phone" /> : null),
  },
  {
    title: "A week later: the money is in",
    route: () => "/app/bank",
    target: `[data-utr="${GUPTA_PROOF_UTR}"]`,
    enter: aWeekLater,
    body: (s) => (
      <>
        The tour imported the week's bank statement, then moved the Demo date on to{" "}
        {formatDate(addDays(s.today, WEEK))} and ran the daily Ladder for it: the same workflow the 10:00 cron starts.
        Gupta ji's {formatInr(FIRST.amountPaise)} came in on {formatDate(GUPTA_PROOF_DATE)}, and it is matched to his
        Invoice. Nothing is paid until you confirm it: press <b>Confirm</b>, or <b>Next</b> and the tour confirms it.
      </>
    ),
  },
  {
    title: "Salary covered ✓",
    route: () => "/app",
    target: '[data-tour="headline"]',
    enter: confirmGupta,
    body: () => (
      <>
        Gupta ji kept the Plan's first instalment, and the week's other payments came in, so the salaries are covered
        with money to spare. The Automation log shows every run of the Ladder, with its retries.
      </>
    ),
    extra: () => (
      <p className="mt-2">
        <Link to="/app/automation" className="linkbtn">
          Automation log
        </Link>
      </p>
    ),
  },
];

/** Wraps every page, so the tour can follow the visitor from the books to the pay link and back. */
export function TourRoot() {
  const [state, setState] = useState<TourState | null>(() => load());
  const start = useCallback((from: TourStart) => {
    const next = { ...from, step: 0, plan: null, jumped: false, arrive: true };
    save(next);
    setState(next);
  }, []);
  const update = useCallback((next: TourState | null) => {
    save(next);
    setState(next);
  }, []);
  return (
    <TourCtx.Provider value={{ start, active: state !== null }}>
      <Outlet />
      {state && <Coach state={state} onChange={update} />}
    </TourCtx.Provider>
  );
}

export function useTour(): Ctx {
  return useContext(TourCtx);
}

/**
 * Finds the step's element once its screen has loaded, and keeps a ring around
 * it. "Loaded" is when the element holds still between two looks; it is
 * measured again on every scroll, resize and change of layout.
 */
function useRing(selector: string, on: boolean) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    setRect(null);
    if (!on) return;
    let settled = false;
    let last = "";
    let drawn = "";
    const measure = () => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      if (!box || box.width === 0 || box.height === 0) {
        settled = false;
        last = "";
        drawn = "";
        setRect(null);
        return;
      }
      // Where it sits on the page, not in the window, so scrolling does not count as moving.
      const where = [box.top + window.scrollY, box.left, box.width, box.height].map(Math.round).join();
      const seen = [box.top, box.left, box.width, box.height].map(Math.round).join();
      if (!settled) {
        if (where !== last) {
          last = where;
          return;
        }
        settled = true;
        const top = box.top + window.scrollY - 88;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
      }
      // A new box only when it moved, so the coach is not drawn again four times a second.
      if (seen !== drawn) {
        drawn = seen;
        setRect(box);
      }
    };
    measure();
    const timer = window.setInterval(measure, 250);
    const layout = new ResizeObserver(measure);
    layout.observe(document.body);
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(timer);
      layout.disconnect();
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [selector, on]);
  return rect;
}

function Coach({ state, onChange }: { state: TourState; onChange: (next: TourState | null) => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { lang } = useLang();
  const t = ownerCopy(lang);
  const step = STEPS[state.step] ?? STEPS[0]!;
  const route = step.route(state);
  const here = pathname === route;
  const folded = !here && !state.arrive;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const rect = useRing(step.target, here);
  const last = state.step === STEPS.length - 1;

  // A start, a step or a resume opens the step's screen; once there, leaving it folds the tour.
  useEffect(() => {
    if (!state.arrive) return;
    if (here) onChange({ ...state, arrive: false });
    else navigate(route);
  }, [state, here, route]);

  useEffect(() => {
    if (!folded) heading.current?.focus({ preventScroll: true });
  }, [state.step, folded]);

  const go = async (index: number) => {
    setError(null);
    const next = STEPS[index];
    if (!next) return;
    let changes: Partial<TourState> = {};
    if (next.enter && index > state.step) {
      setBusy(true);
      try {
        changes = await next.enter(state);
      } catch (e) {
        console.error("tour step failed", e);
        setError("The tour could not change the books for this step. The screen still shows what is there.");
      } finally {
        setBusy(false);
      }
    }
    onChange({ ...state, ...changes, step: index, arrive: true });
  };

  const end = () => onChange(null);
  const progress = t.tourProgress(state.step + 1, STEPS.length);

  if (folded) {
    return (
      <div className="tour-chip no-print">
        <button type="button" className="btn primary" onClick={() => onChange({ ...state, arrive: true })}>
          {t.resumeTour(state.step + 1, STEPS.length)}
        </button>
        <button type="button" className="tour-x" onClick={end} aria-label={t.endTour}>
          <X size={16} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <>
      {rect && (
        <div
          aria-hidden
          className="tour-ring"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}
      <section
        className="tour no-print"
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        onKeyDown={(e) => e.key === "Escape" && end()}
      >
        <div className="flex items-start gap-2">
          <p className="text-xs text-ink-2">{progress}</p>
          <button type="button" className="tour-x" onClick={end} aria-label={t.endTour}>
            <X size={16} aria-hidden />
          </button>
        </div>
        <h2 id="tour-title" ref={heading} tabIndex={-1} className="text-lg leading-snug font-semibold">
          {t.tourTitles[state.step] ?? step.title}
        </h2>
        {/* Only the body scrolls, so Back and Next stay in view under a long sample call. */}
        <div className="tour-body mt-1 text-[14.5px]">
          <p>{step.body(state)}</p>
          {step.extra?.(state)}
          {error && (
            <p role="alert" className="mt-2 text-sindoor">
              {error}
            </p>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="tour-dots" aria-hidden>
            {STEPS.map((s, i) => (
              <i key={s.title} className={i === state.step ? "on" : i < state.step ? "done" : ""} />
            ))}
          </span>
          <span className="flex-1" />
          {state.step > 0 && (
            <button type="button" className="btn secondary" disabled={busy} onClick={() => go(state.step - 1)}>
              <ArrowLeft aria-hidden /> {t.back}
            </button>
          )}
          {last ? (
            <Link to="/proof" className="btn primary" onClick={end}>
              {t.seeProof} <ArrowRight aria-hidden />
            </Link>
          ) : (
            <button type="button" className="btn primary" disabled={busy} onClick={() => go(state.step + 1)}>
              {busy ? "…" : t.next} {!busy && <ArrowRight aria-hidden />}
            </button>
          )}
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {busy ? "Changing the books for the next step…" : ""}
        </p>
      </section>
    </>
  );
}
