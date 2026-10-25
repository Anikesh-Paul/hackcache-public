import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowRight, Check } from "lucide-react";
import { formatDate } from "@tagada/money";
import { DEMO_TODAY } from "@tagada/seed";
import { useWorldState } from "./lib/world.tsx";
import { useVoiceStatus } from "./lib/voice-status.ts";
import { useTour } from "./tour.tsx";
import { PayLinkQr } from "./pay-qr.tsx";
import { CallPlayer } from "./sample-call.tsx";
import { Badge } from "./ui.tsx";
import { useT } from "./i18n/index.ts";

/** How long the cover takes to turn; the door lands on its screen just after. */
const TURN_MS = 1100;

type DoorKey = "tour" | "own" | "call" | "proof";
type Door = { key: DoorKey; ribbon: string };

// The order of the ribbons under the book; each door pulls its own.
const DOORS: Door[] = [
  { key: "tour", ribbon: "var(--bamboo)" },
  { key: "own", ribbon: "var(--bamboo-ink)" },
  { key: "call", ribbon: "var(--turmeric)" },
  { key: "proof", ribbon: "var(--ink-2)" },
];

/**
 * The judge's front door: the pitch, one tour to start with, the call that
 * makes Tagada different, two quieter ways in, and the closed khata. The
 * visitor's own Demo world opens silently while they read, so every door is
 * instant. On phones the book is hidden, so the doors are in the first screen.
 */
export function Landing() {
  const t = useT();
  const state = useWorldState();
  const tour = useTour();
  const navigate = useNavigate();
  const [opening, setOpening] = useState<number | null>(null);
  const [pulled, setPulled] = useState<number | null>(null);
  const voice = useVoiceStatus();
  // The door still opens the call screen, which plays the recorded call in place of a live one.
  const callsOff = voice !== null && voice.calls !== "ready";

  const world = state.status === "ready" ? state.world : null;
  // The hero Customer's open Invoice: the call the judge plays and the tour follows.
  const hero = world?.invoices.find(
    (i) => i.status !== "paid" && world.customers.get(i.customerId)?.name === "Gupta Traders",
  );
  // The tour tells the starting story. A world that has moved on starts it again from a fresh copy.
  const moved =
    !!world &&
    (world.workspace.today !== DEMO_TODAY ||
      !hero ||
      (world.promisesByInvoice.get(hero.$id) ?? []).some((p) => p.status === "approved"));
  const [restarting, setRestarting] = useState(false);

  // Once the fresh copy is open, the tour starts on it.
  useEffect(() => {
    if (restarting && state.status === "error") {
      setRestarting(false);
      setOpening(null);
      return;
    }
    if (!restarting || !world || !hero || moved) return;
    setRestarting(false);
    tour.start({ workspaceId: world.workspace.$id, invoiceId: hero.$id, token: hero.payToken ?? null, today: world.workspace.today });
  }, [restarting, state.status, world, hero, moved, tour]);

  const go = (key: DoorKey) => {
    if (key === "proof") return navigate("/proof");
    if (key === "own") return navigate("/app/invoices/new?try");
    if (!world || !hero) return;
    if (key === "call") return navigate(`/call/${hero.$id}`);
    if (moved) {
      setRestarting(true);
      void state.reset();
      return;
    }
    // Starting the tour takes the visitor to its first screen.
    tour.start({ workspaceId: world.workspace.$id, invoiceId: hero.$id, token: hero.payToken ?? null, today: world.workspace.today });
  };

  const open = (key: DoorKey) => {
    if (opening !== null) return;
    const index = DOORS.findIndex((door) => door.key === key);
    const book = document.querySelector(".khata-book")?.getBoundingClientRect();
    // The cover turns only where it can be seen (phones hide the book), and never for reduced motion.
    const seen = !!book && book.height > 0 && book.top < window.innerHeight - 80;
    if (!seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return go(key);
    setOpening(index);
    window.setTimeout(() => go(key), TURN_MS);
  };

  // The tour can start from a fresh copy; the call needs Gupta ji's open Invoice.
  const needsWorld = (key: DoorKey) =>
    (key === "tour" && !world) || (key === "own" && !world) || (key === "call" && !hero);
  /** What every door shares: it opens, it waits for the books, and it pulls its ribbon. */
  const door = (key: DoorKey) => {
    const index = DOORS.findIndex((d) => d.key === key);
    return {
      type: "button" as const,
      disabled: needsWorld(key) || opening !== null,
      onClick: () => open(key),
      onPointerEnter: () => setPulled(index),
      onPointerLeave: () => setPulled(null),
      onFocus: () => setPulled(index),
      onBlur: () => setPulled(null),
    };
  };

  return (
    <main lang={t.lang} className={`landing ${opening !== null ? "opening" : ""}`}>
      <div className="l-copy">
        <h1>{t.landing.headline()}</h1>
        <p className="src">{t.landing.source}</p>
        <p className="what">{t.landing.what}</p>

        <nav className="doors" aria-label={t.landing.waysIn}>
          <button {...door("tour")} className="door-main" aria-label={t.landing.tour} aria-describedby="door-tour">
            <span>
              <b>{t.landing.tour}</b>
              <small id="door-tour">{moved ? t.landing.eightStepsFresh : t.landing.eightSteps}</small>
            </span>
            <ArrowRight aria-hidden className="ar" />
          </button>

          <div className="door-call">
            <button {...door("call")} className="door-second" aria-label={t.landing.call} aria-describedby="door-call">
              <span>
                <span className="mark">{t.landing.different}</span>
                <b>{t.landing.call}</b>
                <small id="door-call">{callsOff ? t.landing.callsOff : t.landing.callWhat}</small>
              </span>
              <ArrowRight aria-hidden className="ar" />
            </button>
            <details className="l-hear">
              <summary>{t.landing.noMic}</summary>
              <CallPlayer />
              {hero?.payToken && <PayLinkQr token={hero.payToken} label={t.landing.qr} />}
            </details>
          </div>

          <p className="door-links">
            <button {...door("own")} className="linkbtn" aria-label={t.landing.own} title={t.landing.ownWhat}>
              {t.landing.own}
            </button>
            <button {...door("proof")} className="linkbtn" aria-label={t.landing.proof} title={t.landing.proofWhat}>
              {t.landing.proof}
            </button>
          </p>
        </nav>

        <div className="l-foot">
          <p role="status" aria-live="polite">
            {world ? (
              <>
                <span className="ready" title={t.landing.readyDetail(world.customers.size, world.invoices.length)}>
                  <Check aria-hidden size={16} /> {t.landing.ready}
                  <span className="sr-only">
                    {": "}
                    {t.landing.readyDetail(world.customers.size, world.invoices.length)}
                  </span>
                </span>{" "}
                <Link to="/app" className="linkbtn books">
                  {t.landing.openBooks}
                </Link>
              </>
            ) : state.status === "error" ? (
              <>
                {state.failed === "reset" ? t.shell.resetFailed : t.shell.openFailed}{" "}
                <button type="button" className="linkbtn" onClick={state.retry}>
                  {t.common.tryAgain}
                </button>
              </>
            ) : (
              t.landing.settingUp
            )}
          </p>
          <details className="l-real">
            <summary>{t.landing.whatsReal}</summary>
            <p>
              <Badge kind="real">{t.shell.real}</Badge> {t.landing.realNote}
            </p>
            <p>
              <Badge kind="sim">{t.shell.simulated}</Badge> {t.landing.simulatedNote}
            </p>
          </details>
        </div>
      </div>

      <div
        className={`khata-book ${opening !== null ? `open pull-${opening}` : pulled !== null ? `pull-${pulled}` : ""}`}
        aria-hidden
      >
        <div className="ribbons">
          {DOORS.map((d) => (
            <i key={d.key} style={{ background: d.ribbon }} />
          ))}
        </div>
        <div className="pg">
          <span className="d">{world ? formatDate(world.workspace.today, { year: true }) : t.landing.today}</span>
          <span className="o">{world?.workspace.businessName ?? "Tripura Bamboo Works"}</span>
          <span className="d">{t.landing.bookPage}</span>
          <span className="lines">
            <i style={{ width: "90%" }} />
            <i style={{ width: "72%" }} />
            <i style={{ width: "84%" }} />
            <i style={{ width: "60%" }} />
            <i style={{ width: "78%" }} />
          </span>
        </div>
        <div className="cov">
          <div className="f">
            <span className="title" lang="hi">
              तगादा
            </span>
            <span className="sub">Tagada</span>
            <span className="tag">bina jhagda</span>
            <span className="plate">
              <b>Tripura Bamboo Works</b>
              <br />
              Agartala, khata 2026-27
            </span>
          </div>
          <div className="b" />
        </div>
      </div>
    </main>
  );
}
