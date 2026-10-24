import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowRight, Check } from "lucide-react";
import { formatDate } from "@tagada/money";
import { DEMO_TODAY } from "@tagada/seed";
import { useWorldState } from "./lib/world.tsx";
import { useTour } from "./tour.tsx";
import { PayLinkQr } from "./pay-qr.tsx";
import { CallPlayer } from "./sample-call.tsx";
import { Badge } from "./ui.tsx";
import { ownerCopy } from "./i18n/owner.ts";
import { useLang } from "./lib/prefs.ts";

/** How long the cover takes to turn; the door lands on its screen just after. */
const TURN_MS = 1100;

type Door = { key: "tour" | "call" | "proof"; ribbon: string; title: string; what: string };

const DOORS: Door[] = [
  { key: "tour", ribbon: "var(--bamboo)", title: "Start the 2-minute tour", what: "Eight steps, and the app moves for you" },
  { key: "call", ribbon: "var(--turmeric)", title: "Be Gupta ji: take the call", what: "You play the Customer, in Hindi or English" },
  { key: "proof", ribbon: "var(--ink-2)", title: "See the proof", what: "The brief's test cases, worked out live" },
];

/**
 * The judge's front door: the pitch, three doors, and the closed khata. The
 * visitor's own Demo world opens silently while they read, so every door is
 * instant. On phones the pitch and the doors come first; the book follows.
 */
export function Landing() {
  const { lang } = useLang();
  const copy = ownerCopy(lang);
  const state = useWorldState();
  const tour = useTour();
  const navigate = useNavigate();
  const [opening, setOpening] = useState<number | null>(null);
  const [pulled, setPulled] = useState<number | null>(null);

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

  const go = (door: Door) => {
    if (door.key === "proof") return navigate("/proof");
    if (!world || !hero) return;
    if (door.key === "call") return navigate(`/call/${hero.$id}`);
    if (moved) {
      setRestarting(true);
      void state.reset();
      return;
    }
    // Starting the tour takes the visitor to its first screen.
    tour.start({ workspaceId: world.workspace.$id, invoiceId: hero.$id, token: hero.payToken ?? null, today: world.workspace.today });
  };

  const open = (door: Door, index: number) => {
    if (opening !== null) return;
    const book = document.querySelector(".khata-book");
    const seen = book ? book.getBoundingClientRect().top < window.innerHeight - 80 : false;
    // The cover turns only where it can be seen, and never for reduced motion.
    if (!seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return go(door);
    setOpening(index);
    window.setTimeout(() => go(door), TURN_MS);
  };

  // The tour can start from a fresh copy; the call needs Gupta ji's open Invoice.
  const needsWorld = (door: Door) => (door.key === "tour" && !world) || (door.key === "call" && !hero);
  const what = (door: Door) =>
    door.key === "tour" ? (moved ? copy.eightStepsFresh : copy.eightSteps) : door.what;

  return (
    <main className={`landing ${opening !== null ? "opening" : ""}`}>
      <div className="l-copy">
        <h1>
          India's micro and small businesses are waiting on <em>₹8.1 lakh crore</em> of late payments.
        </h1>
        <p className="src">Economic Survey 2025-26, Box VIII.11</p>
        <p className="what">
          Tagada chases what they are owed, politely and in Hindi, and tells the owner whether salary day is safe.
        </p>

        <nav className="doors" aria-label="Ways in">
          {DOORS.map((door, i) => (
            <button
              key={door.key}
              type="button"
              className="door"
              aria-label={door.title}
              aria-describedby={`door-${door.key}`}
              disabled={needsWorld(door) || opening !== null}
              onClick={() => open(door, i)}
              onPointerEnter={() => setPulled(i)}
              onPointerLeave={() => setPulled(null)}
              onFocus={() => setPulled(i)}
              onBlur={() => setPulled(null)}
            >
              <span className="rib" style={{ background: door.ribbon }} aria-hidden />
              <span>
                <b>{door.title}</b>
                <small id={`door-${door.key}`}>{what(door)}</small>
              </span>
              <ArrowRight aria-hidden className="ar" />
            </button>
          ))}
        </nav>

        <section className="l-hear" aria-labelledby="hear-call">
          <h2 id="hear-call" className="text-[15px] font-semibold">
            No microphone? Gupta ji's call
          </h2>
          <CallPlayer />
          {hero?.payToken && <PayLinkQr token={hero.payToken} label="Open Gupta ji's pay link on your phone" />}
        </section>

        <div className="l-foot">
          <p role="status" aria-live="polite">
            {world ? (
              <span className="ready">
                <Check aria-hidden size={16} /> Your own private copy of the books is open: {world.customers.size}{" "}
                Customers, {world.invoices.length} Invoices. Nothing you do changes anyone else's.
              </span>
            ) : state.status === "error" ? (
              <>
                {state.message}{" "}
                <button type="button" className="linkbtn" onClick={state.retry}>
                  Try again
                </button>
              </>
            ) : (
              "Setting up your own private copy of the books…"
            )}
          </p>
          {world && (
            <p>
              <Link to="/app">Or open the books yourself</Link>
            </p>
          )}
          <p>
            <Badge kind="real">Real</Badge> GST and interest maths, the AI call, the daily Ladder workflow, reminder
            emails and bank matching.
          </p>
          <p>
            <Badge kind="sim">Simulated</Badge> The bank feed, the UPI ID, WhatsApp sending and the history before
            today.
          </p>
        </div>
      </div>

      <div
        className={`khata-book ${opening !== null ? `open pull-${opening}` : pulled !== null ? `pull-${pulled}` : ""}`}
        aria-hidden
      >
        <div className="ribbons">
          {DOORS.map((door) => (
            <i key={door.key} style={{ background: door.ribbon }} />
          ))}
        </div>
        <div className="pg">
          <span className="d">{world ? formatDate(world.workspace.today, { year: true }) : "Today"}</span>
          <span className="o">{world?.workspace.businessName ?? "Tripura Bamboo Works"}</span>
          <span className="d">Today's page of the books</span>
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
