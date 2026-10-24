// The 2-minute guided tour (build plan §6.5): seven coach marks over the real
// app. Each step opens its own screen and, where the story needs it, puts the
// Demo world in the right state itself, and says so. The tour lives above the
// router's pages, so it carries on across the Owner's books, the call and the
// Customer's pay link.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { planInWords } from "@tagada/domain";
import { addDays, formatDate } from "@tagada/money";
import { runLadder } from "./lib/appwrite.ts";
import { pay } from "./lib/pay.ts";
import { SAMPLE } from "./screens/Call.tsx";

/** What the tour needs to know about the visitor's Demo world, read once on the landing page. */
export type TourStart = { invoiceId: string; token: string | null; today: string };

type TourState = TourStart & {
  step: number;
  /** What the tour did to the books, said on the step that did it. */
  plan: string | null;
  jumped: boolean;
};

type Ctx = { start: (from: TourStart) => void; active: boolean };

const TourCtx = createContext<Ctx>({ start: () => {}, active: false });
const KEY = "tagada.tour";
const WEEK = 7;

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

/** Gupta ji agrees the first Plan his pay link offers, unless a Plan is already in place. */
async function agreePlan(s: TourState): Promise<Partial<TourState>> {
  if (!s.token) return {};
  const slip = await pay.slip(s.token);
  if (slip.state !== "owing") return {};
  const [first] = slip.choices;
  if (!first) return {};
  await pay.plan(s.token, first);
  return { plan: planInWords(first) };
}

/** The Demo date moves on a week, and the daily Ladder runs for it, once per tour. */
async function aWeekLater(s: TourState): Promise<Partial<TourState>> {
  if (s.jumped) return {};
  await runLadder(addDays(s.today, WEEK));
  return { jumped: true };
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
        ask for more. No microphone, or no time? Press <b>Next</b>: the tour agrees a Plan for Gupta ji.
      </>
    ),
    extra: () => <SampleCall />,
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
            The tour chose a Plan on Gupta ji's pay link, as he could himself: {s.plan}. It is inside your rule, so it
            is agreed and the Ladder pauses.
          </>
        ) : (
          <>Once a Plan from Gupta ji is agreed, the Ladder pauses for him.</>
        )}{" "}
        His first instalment lands before salary day, so the pay packets fill and the headline turns to{" "}
        <b>Salary covered</b>.
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
  },
  {
    title: "A week later",
    route: () => "/app/automation",
    target: 'section[aria-label="Automation log"]',
    enter: aWeekLater,
    body: (s) => (
      <>
        The tour moved the Demo date on to {formatDate(addDays(s.today, WEEK))} and ran the daily Ladder for it: the
        same workflow the 10:00 cron starts. The log shows every run, with retries. From an Invoice you can print the
        Payment Demand Letter and the ODR case file.
      </>
    ),
    extra: (s) => (
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <Link to={`/print/letter/${s.invoiceId}`} className="linkbtn">
          Payment Demand Letter
        </Link>
        <Link to={`/print/case/${s.invoiceId}`} className="linkbtn">
          ODR case file
        </Link>
      </p>
    ),
  },
];

/** Wraps every page, so the tour can follow the visitor from the books to the pay link and back. */
export function TourRoot() {
  const [state, setState] = useState<TourState | null>(() => load());
  const start = useCallback((from: TourStart) => {
    const next = { ...from, step: 0, plan: null, jumped: false };
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

function SampleCall() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button type="button" className="linkbtn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? "Hide the sample call" : "Read a sample call"}
      </button>
      {open && (
        <ol className="tour-sample">
          {SAMPLE.map((line) => (
            <li key={line.en}>
              <b>{line.who}</b> {line.hi && <span lang="hi">{line.hi} </span>}
              <span className="text-ink-2">{line.en}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Finds the step's element once its screen has loaded, and keeps a ring around it. */
function useRing(selector: string, path: string) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    let found: Element | null = null;
    let scrolled = false;
    const tick = () => {
      if (!found || !found.isConnected) found = document.querySelector(selector);
      if (found && !scrolled) {
        scrolled = true;
        const top = found.getBoundingClientRect().top + window.scrollY - 88;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
      }
      setRect(found ? found.getBoundingClientRect() : null);
    };
    tick();
    const timer = window.setInterval(tick, 200);
    window.addEventListener("scroll", tick, { passive: true });
    window.addEventListener("resize", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("scroll", tick);
      window.removeEventListener("resize", tick);
    };
  }, [selector, path]);
  return rect;
}

function Coach({ state, onChange }: { state: TourState; onChange: (next: TourState | null) => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const step = STEPS[state.step] ?? STEPS[0]!;
  const route = step.route(state);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const rect = useRing(step.target, pathname);
  const last = state.step === STEPS.length - 1;

  // Each step opens its own screen.
  useEffect(() => {
    if (pathname !== route) navigate(route);
  }, [route]);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [state.step]);

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
    onChange({ ...state, ...changes, step: index });
  };

  const end = () => onChange(null);

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
          <p className="text-xs text-ink-2">
            Tour, step {state.step + 1} of {STEPS.length}
          </p>
          <button type="button" className="tour-x" onClick={end} aria-label="End the tour">
            <X size={16} aria-hidden />
          </button>
        </div>
        <h2 id="tour-title" ref={heading} tabIndex={-1} className="text-lg leading-snug font-semibold">
          {step.title}
        </h2>
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
              <ArrowLeft aria-hidden /> Back
            </button>
          )}
          {last ? (
            <Link to="/proof" className="btn primary" onClick={end}>
              See the proof <ArrowRight aria-hidden />
            </Link>
          ) : (
            <button type="button" className="btn primary" disabled={busy} onClick={() => go(state.step + 1)}>
              {busy ? "Working…" : "Next"} {!busy && <ArrowRight aria-hidden />}
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
