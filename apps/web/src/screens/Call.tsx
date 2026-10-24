import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { Check, Languages, MessageCircle, Mic, PhoneOff, Phone, Undo2, X } from "lucide-react";
import {
  DEMO_CLOCK,
  callConfirmation,
  callGuard,
  planInWords,
  planRule,
  spokenName,
  whatsappLink,
  type BookPromise,
  type CallOutcome,
  type Instalment,
} from "@tagada/domain";
import { callCostPaise, callCredits, formatDate, formatInr } from "@tagada/money";
import { WorldGate } from "../AppShell.tsx";
import { PayPackets, SalaryFigure } from "../books.tsx";
import { decidePromise, glossOf, useCall, type Decision, type Line, type Recorded } from "../lib/call.ts";
import { clockOf, personas, type PersonaKey } from "../lib/call-script.ts";
import { useTodayBook } from "../lib/today.ts";
import { useWorld, useWorldState, viewOf } from "../lib/world.tsx";
import { Head, Ln, Paper } from "../ui.tsx";
import { SAMPLE } from "../sample-call.tsx";

/** /call/:invoiceId, "Be Gupta ji": the call, with the Owner's books live beside it. */
export function CallScreen() {
  return (
    <WorldGate>
      <CallPage />
    </WorldGate>
  );
}

type Decided = { status: "approved" | "declined"; counter: Instalment[] | null; action: Decision };

const planOf = (o: CallOutcome | undefined): Instalment[] | null =>
  o && (o.kind === "plan" || o.kind === "plan_needs_owner" || o.kind === "promise") ? o.instalments : null;

const words = planInWords;

/** The credits ElevenLabs reported for this call, once its webhook is in. */
function creditsOf(events: ReturnType<typeof useWorldState>["events"], callId: string | null): number | null {
  if (!callId || !Array.isArray(events)) return null;
  for (const e of events) {
    if (e.type !== "call" || !e.payload) continue;
    const p = JSON.parse(e.payload) as { callId?: string; credits?: number | null };
    if (p.callId === callId && typeof p.credits === "number") return p.credits;
  }
  return null;
}

function CallPage() {
  const { invoiceId = "" } = useParams();
  const world = useWorld();
  const { events } = useWorldState();
  const invoice = world.invoices.find((i) => i.$id === invoiceId);
  const call = useCall(invoiceId);
  const [decided, setDecided] = useState<Decided | null>(null);
  const plan = planOf(call.recorded?.outcome);
  const approved = decided?.status === "approved";
  const optimistic = useMemo<BookPromise | null>(
    () => (approved && plan ? { invoiceId, status: "approved", instalments: plan } : null),
    [approved, plan, invoiceId],
  );
  const book = useTodayBook(optimistic);

  if (!invoice) {
    return (
      <Paper label="Call with AI">
        <Ln>
          <p>There is no such Invoice in your books.</p>
          <Link to="/app/invoices" className="btn secondary mt-3">
            Open the Invoices
          </Link>
        </Ln>
      </Paper>
    );
  }
  const view = viewOf(world, invoice);
  const customer = view.customer;
  const name = customer?.name ?? "the Customer";
  const rule = planRule.parse(world.workspace.planRule);
  const clock = world.workspace.clock ?? DEMO_CLOCK;
  const guard = callGuard({
    customerName: name,
    consentCalls: customer?.consentCalls === true,
    consentAt: customer?.consentAt ?? null,
    clock,
    balancePaise: view.standing.balancePaise,
    disputed: view.standing.state === "disputed",
  });
  const phase = call.phase;
  const calling = phase.name === "connecting" || phase.name === "live";
  const salary = book.status === "ready" ? book.book.salary : null;
  const waiting = call.recorded?.saved && plan && !decided;

  return (
    <div className="pb-20 lg:pb-0">
      <p className="mb-3 text-sm">
        <Link to={`/app/invoices/${invoiceId}`} className="linkbtn">
          ‹ Back to {invoice.number}
        </Link>
      </p>
      <div className="call-grid">
        <Paper label="Call with AI" className="call-leaf">
          <Head title={`Call with AI: ${name}`} a={formatInr(view.standing.balancePaise)} />
          {phase.name === "ready" && !call.recorded && (
            <Setup
              name={name}
              consentAt={customer?.consentAt ?? null}
              clock={clock}
              rule={rule}
              guard={guard}
              owedPaise={view.standing.balancePaise}
              today={world.workspace.today}
              onStart={call.start}
            />
          )}
          {phase.name === "failed" && <Failed why={phase.why} message={phase.message} onRetry={call.start} />}
          {(calling || phase.name === "ended" || call.lines.length > 0) && (
            <Live phase={phase} lines={call.lines} name={spokenName(name)} onEnd={call.end} />
          )}
          {call.recorded && (
            <Outcome
              recorded={call.recorded}
              decided={decided}
              onDecided={setDecided}
              seconds={phase.name === "ended" ? phase.seconds : null}
              credits={creditsOf(events, call.callId)}
              customerName={name}
              phone={customer?.phone ?? null}
              businessName={world.workspace.businessName}
              payToken={invoice.payToken}
            />
          )}
        </Paper>
        <Paper label="Your books, live" className="books">
          <Head title="Your books, live" />
          {salary ? (
            <>
              <Ln className="hl-row" a={<SalaryFigure cashAfterPaise={salary.cashAfterPaise} />}>
                <p className="text-lg font-semibold">
                  {salary.cashAfterPaise < 0
                    ? `Salary day in ${salary.daysAway} ${salary.daysAway === 1 ? "day" : "days"}`
                    : "Salary covered ✓"}
                </p>
                <small className="text-ink-2">{formatDate(salary.date)}: salaries of {formatInr(salary.salaryPaise)}</small>
              </Ln>
              <Ln>
                <PayPackets salary={salary} />
              </Ln>
            </>
          ) : (
            <Ln>
              <p className="text-ink-2" role="status">
                {book.status === "failed" ? "Your books could not be read." : "Adding up your books…"}
              </p>
            </Ln>
          )}
        </Paper>
      </div>
      {salary && (
        <div className="statusbar" role="status">
          <span className="text-sm">
            {salary.cashAfterPaise < 0
              ? `${formatInr(-salary.cashAfterPaise)} short on salary day`
              : `Salary covered, ${formatInr(salary.cashAfterPaise)} spare`}
          </span>
          {waiting && (
            <a href="#outcome" className="btn primary">
              Decide
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function Setup(props: {
  name: string;
  consentAt: string | null;
  clock: string;
  rule: ReturnType<typeof planRule.parse>;
  guard: ReturnType<typeof callGuard>;
  owedPaise: number;
  today: string;
  onStart: () => void;
}) {
  const { name, consentAt, clock, rule, guard, owedPaise, today, onStart } = props;
  const cards = useMemo(() => personas({ owedPaise, today, rule }), [owedPaise, today, rule]);
  const [persona, setPersona] = useState<PersonaKey>("short");
  const blocked = guard.ok ? null : guard;
  const insideHours = guard.ok || guard.block !== "outside_hours";
  const items: { ok: boolean; text: string }[] = [
    consentAt
      ? { ok: true, text: `${name} agreed to reminder calls on ${formatDate(consentAt.slice(0, 10))}.` }
      : { ok: false, text: `${name} has not agreed to reminder calls.` },
    insideHours
      ? { ok: true, text: `Now ${clock}, inside calling hours (10 AM to 6 PM).` }
      : { ok: false, text: `Now ${clock}, outside calling hours (10 AM to 6 PM).` },
    { ok: true, text: "Munim says it is an AI in its first line." },
    { ok: true, text: "No threats, and no talk of courts, the police or credit scores." },
    {
      ok: true,
      text: `Your rule: a first instalment of at least ${rule.minFirstPct}% within ${rule.firstWithinDays} days, the rest within ${rule.restWithinDays} days. Code checks it, not the AI.`,
    },
  ];
  return (
    <>
      <Ln m="Before the call">
        <ul className="guard" data-tour="guard">
          {items.map((item) => (
            <li key={item.text} className={item.ok ? "" : "no"}>
              {item.ok ? <Check aria-label="Yes" /> : <X aria-label="No" />}
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
      </Ln>
      <Ln m="Be the Customer">
        <fieldset>
          <legend className="mb-2">
            Play {spokenName(name)} ji. Pick how you will answer; your books change with what you say.
          </legend>
          <div className="personas">
            {cards.map((p) => (
              <label key={p.key} className="persona relative">
                <input
                  type="radio"
                  name="persona"
                  value={p.key}
                  checked={persona === p.key}
                  onChange={() => setPersona(p.key)}
                />
                <b>{p.title}</b>
                <small className="block text-ink-2">{p.what}</small>
                {p.lines.map((line) => (
                  <q key={line.en}>
                    <span lang="hi">{line.hi}</span>
                    <small className="block text-ink-2">{line.en}</small>
                  </q>
                ))}
              </label>
            ))}
          </div>
        </fieldset>
      </Ln>
      <Ln>
        {blocked ? (
          <p role="alert" className="word short">
            <X aria-hidden /> {blocked.message}
          </p>
        ) : (
          <>
            <button type="button" className="btn primary px-4 py-3 text-[15px]" onClick={onStart} data-tour="start">
              <Phone aria-hidden /> Start call
            </button>
            <small className="mt-2 block text-ink-2">
              The browser asks for your microphone. Munim speaks Hindi; answer as {spokenName(name)} ji would.
            </small>
          </>
        )}
      </Ln>
    </>
  );
}

function Failed({ why, message, onRetry }: { why: string; message: string; onRetry: () => void }) {
  const [sample, setSample] = useState(false);
  return (
    <>
      <Ln m={why === "mic_denied" ? "Microphone" : why === "no_answer" ? "No answer" : "Not now"}>
        <p role="alert">{message}</p>
        <p className="mt-3 flex flex-wrap gap-2">
          {why !== "blocked" && (
            <button type="button" className="btn primary" onClick={onRetry}>
              {why === "mic_denied" ? <Mic aria-hidden /> : <Phone aria-hidden />} Try again
            </button>
          )}
          {why === "mic_denied" && (
            <button type="button" className="btn secondary" aria-expanded={sample} onClick={() => setSample((s) => !s)}>
              {sample ? "Hide the sample call" : "Read a sample call instead"}
            </button>
          )}
        </p>
      </Ln>
      {sample && (
        <div className="entries transcript">
          <Ln>
            <small className="text-ink-2">A sample of how the call goes, written out. Not a recording.</small>
          </Ln>
          {SAMPLE.map((s) => (
            <Ln key={s.en} m={s.who} className={s.who === "Rule check" ? "check" : ""}>
              {s.hi && <span lang="hi">{s.hi}</span>}
              <span className={s.hi ? "gloss" : ""}>{s.en}</span>
            </Ln>
          ))}
        </div>
      )}
    </>
  );
}

function Live({
  phase,
  lines,
  name,
  onEnd,
}: {
  phase: ReturnType<typeof useCall>["phase"];
  lines: readonly Line[];
  name: string;
  onEnd: () => void;
}) {
  const [gloss, setGloss] = useState(false);
  const [english, setEnglish] = useState<Map<string, string>>(new Map());
  const [glossFailed, setGlossFailed] = useState(false);
  const spoken = lines.filter((l) => l.kind !== "check");
  const missing = spoken.filter((l) => !english.has(l.id));
  const missingKey = missing.map((l) => l.id).join();

  useEffect(() => {
    if (!gloss || missing.length === 0) return;
    let live = true;
    const batch = missing.slice(0, 20);
    glossOf(batch.map((l) => l.text)).then(
      (out) => {
        if (!live) return;
        if (!out) return setGlossFailed(true);
        setEnglish((now) => new Map([...now, ...batch.map((l, i) => [l.id, out[i] ?? ""] as const)]));
      },
      () => live && setGlossFailed(true),
    );
    return () => {
      live = false;
    };
    // `missingKey` stands for the lines still without English.
  }, [gloss, missingKey]);

  const state =
    phase.name === "connecting"
      ? "Connecting…"
      : phase.name === "live"
        ? phase.mode === "speaking"
          ? "Munim is speaking"
          : "Listening…"
        : phase.name === "ended"
          ? `Call ended after ${clockOf(phase.seconds)}`
          : "Call ended";
  return (
    <>
      <Ln m="Call">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold" role="status">
            {state}
          </span>
          <span className="flex gap-2">
            <button type="button" className="btn bare" aria-pressed={gloss} onClick={() => setGloss((g) => !g)}>
              <Languages aria-hidden /> English gloss
            </button>
            {(phase.name === "live" || phase.name === "connecting") && (
              <button type="button" className="btn secondary" onClick={onEnd}>
                <PhoneOff aria-hidden /> End call
              </button>
            )}
          </span>
        </div>
        {gloss && glossFailed && <small className="text-ink-2">The English gloss is not available right now.</small>}
      </Ln>
      <div className="entries transcript" role="log" aria-live="polite" aria-label="Call transcript">
        {lines.map((line) =>
          line.kind === "check" ? (
            <Ln
              key={line.id}
              className="check"
              m={
                <>
                  Rule check
                  <br />
                  {clockOf(line.at)}
                </>
              }
              a={line.amountPaise === null ? undefined : formatInr(line.amountPaise)}
            >
              {line.ok ? "✓ " : ""}
              {line.text}
            </Ln>
          ) : (
            <Ln
              key={line.id}
              m={
                <>
                  <b>{line.kind === "agent" ? "Munim" : `${name} ji`}</b>
                  <br />
                  {clockOf(line.at)}
                </>
              }
              a={line.amountPaise === null ? undefined : formatInr(line.amountPaise)}
            >
              <span lang="hi">{line.text}</span>
              {gloss && english.get(line.id) && <span className="gloss">{english.get(line.id)}</span>}
            </Ln>
          ),
        )}
      </div>
    </>
  );
}

function Outcome(props: {
  recorded: Recorded;
  decided: Decided | null;
  onDecided: (d: Decided | null) => void;
  seconds: number | null;
  credits: number | null;
  customerName: string;
  phone: string | null;
  businessName: string;
  payToken: string | null;
}) {
  const { recorded, decided, onDecided, seconds, credits, customerName, phone, businessName, payToken } = props;
  const [busy, setBusy] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const o = recorded.outcome;
  const plan = planOf(o);
  const first = plan?.[0];
  const last = plan?.[plan.length - 1];

  const act = async (action: Decision) => {
    if (!recorded.promiseId) return;
    setBusy(action);
    setError(null);
    const before = decided;
    // Approve moves the books at once; the server's answer confirms it.
    if (action === "approve") onDecided({ status: "approved", counter: null, action });
    if (action === "undo") onDecided(null);
    try {
      const r = await decidePromise(recorded.promiseId, action);
      onDecided(r.status === "needs_owner" ? null : { status: r.status as Decided["status"], counter: r.counter, action });
    } catch {
      onDecided(before);
      setError("That did not save. Try again.");
    } finally {
      setBusy(null);
    }
  };

  // ElevenLabs' own count once its webhook is in; until then, the call's length at its usual rate.
  const used = credits ?? (seconds === null ? null : callCredits(seconds));
  const cost =
    used === null ? null : (
      <Ln m="Cost" a={formatInr(callCostPaise(used))}>
        This call cost {credits === null ? "about " : ""}
        {formatInr(callCostPaise(used))}
        {decided?.status === "approved" && first ? `; ${formatInr(first.amountPaise)} due ${formatDate(first.date)}` : ""}.
        <small>
          {credits === null
            ? `${clockOf(seconds ?? 0)} at about ${callCredits(60)} ElevenLabs credits a minute; the exact count follows.`
            : `${used} ElevenLabs credits, as ElevenLabs counted them.`}
        </small>
      </Ln>
    );

  if (!plan) {
    const said =
      o.kind === "already_paid"
        ? `Says the bill is already paid${o.reference ? ` (reference ${o.reference})` : ""}. The bank statement will show it.`
        : o.kind === "dispute"
          ? `Raised a Dispute: "${o.notes}". The Ladder is paused until you resolve it.`
          : o.kind === "callback"
            ? `Asked to be called back${o.date ? ` on ${formatDate(o.date)}` : ""}.`
            : "Did not commit to a date. The Ladder carries on.";
    return (
      <div id="outcome" className="sect">
        <Head title="What the call recorded" />
        <Ln>{said}</Ln>
        {cost}
      </div>
    );
  }

  const agreed = o.kind === "plan";
  const payUrl = payToken ? `${location.origin}/pay/${payToken}` : null;
  return (
    <div id="outcome" className="sect">
      <Head title={agreed ? "Plan agreed" : o.kind === "promise" ? "Promise made" : "Needs your decision"} />
      <Ln m={agreed && <span className="stamp ok">Plan agreed</span>}>
        <p className="font-semibold">{words(plan)}</p>
        {o.kind === "plan_needs_owner" && <p className="text-sm">{o.reasons.join(" ")}</p>}
        {!recorded.saved && <small className="text-ink-2">Saving…</small>}
      </Ln>
      {recorded.saved && !decided && (
        <Ln>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn primary" disabled={busy !== null} onClick={() => act("approve")}>
              <Check aria-hidden /> Approve
            </button>
            <button type="button" className="btn secondary" disabled={busy !== null} onClick={() => act("counter")}>
              Counter
            </button>
            <button type="button" className="btn secondary" disabled={busy !== null} onClick={() => act("decline")}>
              Decline
            </button>
          </div>
          <small className="mt-2 block text-ink-2">
            Approving pauses the Ladder till {last && formatDate(last.date)}. If a date is missed, the Ladder starts
            again on its own.
          </small>
        </Ln>
      )}
      {decided?.status === "approved" && (
        <Ln>
          <p role="status">
            Approved. The Ladder is paused till {last && formatDate(last.date)} and the pay link shows the{" "}
            {plan.length > 1 ? "Plan" : "Promise"}.
          </p>
          <p className="mt-2 flex flex-wrap gap-2">
            {payUrl && (
              <a
                className="btn primary"
                target="_blank"
                rel="noopener"
                href={whatsappLink(phone, callConfirmation({ customerName, businessName, instalments: plan, payUrl }))}
              >
                <MessageCircle aria-hidden /> Send the Hindi confirmation on WhatsApp
              </a>
            )}
            <button type="button" className="btn bare" disabled={busy !== null} onClick={() => act("undo")}>
              <Undo2 aria-hidden /> Undo
            </button>
          </p>
        </Ln>
      )}
      {decided?.status === "declined" && (
        <Ln>
          <p role="status">
            {decided.action === "counter" && decided.counter
              ? `You countered with ${words(decided.counter)}. The pay link offers it.`
              : "Declined. The Ladder carries on."}
          </p>
        </Ln>
      )}
      {error && (
        <Ln>
          <p role="alert">{error}</p>
        </Ln>
      )}
      {cost}
    </div>
  );
}
