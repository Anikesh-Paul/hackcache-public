import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { Check, Languages, MessageCircle, Mic, PhoneOff, Phone, Undo2, X } from "lucide-react";
import {
  DEMO_CLOCK,
  callConfirmation,
  callGuard,
  planRule,
  spokenName,
  whatsappLink,
  type BookPromise,
  type CallOutcome,
  type Instalment,
} from "@tagada/domain";
import { callCostPaise, callCredits, formatInr } from "@tagada/money";
import { WorldGate } from "../AppShell.tsx";
import { PayPackets, SalaryFigure } from "../books.tsx";
import { salaryHeadline, useT } from "../i18n/index.ts";
import { decidePromise, glossOf, useCall, type CallsOff, type Decision, type Line, type Recorded } from "../lib/call.ts";
import { saveSettings } from "../lib/appwrite.ts";
import { useVoiceStatus } from "../lib/voice-status.ts";
import { clockOf, personas, type PersonaKey } from "../lib/call-script.ts";
import { useTodayBook } from "../lib/today.ts";
import { useWorld, useWorldState, viewOf } from "../lib/world.tsx";
import { Head, Ln, Paper } from "../ui.tsx";
import { CallPlayer, SAMPLE, sampleText } from "../sample-call.tsx";

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
  const t = useT();
  const invoice = world.invoices.find((i) => i.$id === invoiceId);
  const call = useCall(invoiceId);
  const voice = useVoiceStatus();
  // Known before the call: no start button that can only fail.
  const off: CallsOff | null =
    voice?.calls === "not_configured" ? "call_unavailable" : voice?.calls === "daily_cap" ? "daily_cap" : null;
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
      <Paper label={t.call.label}>
        <Ln>
          <p>{t.call.noInvoice}</p>
          <Link to="/app/invoices" className="btn secondary mt-3">
            {t.call.openInvoices}
          </Link>
        </Ln>
      </Paper>
    );
  }
  const view = viewOf(world, invoice);
  const customer = view.customer;
  const name = customer?.name ?? t.invoice.theCustomer;
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
          {t.call.back(invoice.number)}
        </Link>
      </p>
      <div className="call-grid">
        <Paper label={t.call.label} className="call-leaf">
          <Head title={t.call.title(name)} a={formatInr(view.standing.balancePaise)} />
          {phase.name === "ready" && !call.recorded && (
            <Setup
              name={name}
              consentAt={customer?.consentAt ?? null}
              clock={clock}
              rule={rule}
              guard={guard}
              owedPaise={view.standing.balancePaise}
              today={world.workspace.today}
              dueDate={view.standing.daysLate > 0 ? null : invoice.dueDate}
              off={off}
              onStart={call.start}
            />
          )}
          {phase.name === "failed" && <Failed why={phase.why} message={phase.message} off={phase.off ?? null} onRetry={call.start} />}
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
        <Paper label={t.call.books} className="books">
          <Head title={t.call.books} />
          {salary ? (
            <>
              <Ln className="hl-row" a={<SalaryFigure cashAfterPaise={salary.cashAfterPaise} />}>
                <p className="text-lg font-semibold">
                  {salary.cashAfterPaise < 0 ? salaryHeadline(salary.daysAway, false, t) : t.salary.coveredTick}
                </p>
                <small className="text-ink-2">{t.salary.of(t.date(salary.date), formatInr(salary.salaryPaise))}</small>
              </Ln>
              <Ln>
                <PayPackets salary={salary} />
              </Ln>
            </>
          ) : (
            <Ln>
              <p className="text-ink-2" role="status">
                {book.status === "failed" ? t.call.booksFailed : t.today.adding}
              </p>
            </Ln>
          )}
        </Paper>
      </div>
      {salary && (
        <div className="statusbar" role="status">
          <span className="text-sm">
            {salary.cashAfterPaise < 0
              ? t.salary.shortBy(formatInr(-salary.cashAfterPaise))
              : t.salary.spare(formatInr(salary.cashAfterPaise))}
          </span>
          {waiting && (
            <a href="#outcome" className="btn primary">
              {t.call.decide}
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
  /** Set when the Invoice is not yet late: the call is a courtesy heads-up. */
  dueDate: string | null;
  off: CallsOff | null;
  onStart: () => void;
}) {
  const { name, consentAt, clock, rule, guard, owedPaise, today, dueDate, off, onStart } = props;
  const t = useT();
  const cards = useMemo(() => personas({ owedPaise, today, rule }), [owedPaise, today, rule]);
  const [persona, setPersona] = useState<PersonaKey>("short");
  const blocked = guard.ok ? null : guard;
  const insideHours = guard.ok || guard.block !== "outside_hours";
  const items: { ok: boolean; text: string }[] = [
    consentAt
      ? { ok: true, text: t.call.consented(name, t.date(consentAt.slice(0, 10))) }
      : { ok: false, text: t.call.notConsented(name) },
    insideHours ? { ok: true, text: t.call.inside(clock) } : { ok: false, text: t.call.outside(clock) },
    ...(dueDate ? [{ ok: true, text: t.call.courtesy(t.date(dueDate)) }] : []),
    { ok: true, text: t.call.saysAi },
    { ok: true, text: t.call.noThreats },
    { ok: true, text: t.call.rule(rule.minFirstPct, rule.firstWithinDays, rule.restWithinDays) },
  ];
  return (
    <>
      <Ln m={t.call.beforeCall}>
        <ul className="guard" data-tour="guard">
          {items.map((item) => (
            <li key={item.text} className={item.ok ? "" : "no"}>
              {item.ok ? <Check aria-label={t.call.yes} /> : <X aria-label={t.call.no} />}
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
      </Ln>
      <Ln m={t.call.beCustomer}>
        <fieldset>
          <legend className="mb-2">{t.call.play(spokenName(name))}</legend>
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
                <b>{t.call.personas[p.key].title}</b>
                <small className="block text-ink-2">{t.call.personas[p.key].what}</small>
                {p.lines.map((line) => (
                  <q key={line.en}>
                    <span lang="hi">{line.hi}</span>
                    {t.lang === "en" && <small className="block text-ink-2">{line.en}</small>}
                  </q>
                ))}
              </label>
            ))}
          </div>
        </fieldset>
      </Ln>
      {off && !blocked ? (
        <OffNote off={off} />
      ) : (
        <Ln>
          {blocked ? (
            <>
              <p role="alert" className="word short">
                <X aria-hidden /> {t.call.blocked[blocked.block](name, clock)}
              </p>
              {blocked.block === "outside_hours" && <SetClock />}
            </>
          ) : (
            <>
              <button type="button" className="btn primary px-4 py-3 text-[15px]" onClick={onStart} data-tour="start">
                <Phone aria-hidden /> {t.call.start}
              </button>
              <small className="mt-2 block text-ink-2">{t.call.mic(spokenName(name))}</small>
            </>
          )}
        </Ln>
      )}
    </>
  );
}

/** Demo worlds only: back inside calling hours in one tap, at 11 AM on the same Demo date. */
function SetClock() {
  const t = useT();
  const { reload } = useWorldState();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const set = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const result = await saveSettings({ clock: "11:00" });
      if (!result.ok) throw new Error(result.field);
      await reload();
    } catch (e) {
      console.error("clock not set", e);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <p className="mt-3">
      <button type="button" className="btn secondary" disabled={busy} onClick={set}>
        {t.call.setClock}
      </button>
      {failed && (
        <small className="mt-2 block" role="alert">
          {t.call.clockFailed}
        </small>
      )}
    </p>
  );
}

/** No live call can be placed: say why and play the recorded one, never a Try again that cannot work. */
function OffNote({ off }: { off: CallsOff }) {
  const t = useT();
  return (
    <Ln m={t.call.offLabel}>
      {/* The tour's "take the call" step points here when there is no Start call button. */}
      <p role="status" data-tour="start">
        {t.call.off[off]}
      </p>
      <CallPlayer />
    </Ln>
  );
}

function Failed({ why, message, off, onRetry }: { why: string; message: string; off: CallsOff | null; onRetry: () => void }) {
  const [sample, setSample] = useState(false);
  const t = useT();
  if (why === "off" && off) return <OffNote off={off} />;
  const label = why === "mic_denied" ? t.call.failedLabel.mic_denied : why === "no_answer" ? t.call.failedLabel.no_answer : t.call.failedLabel.other;
  return (
    <>
      <Ln m={label}>
        <p role="alert">{t.common.saveError(message)}</p>
        <p className="mt-3 flex flex-wrap gap-2">
          {why !== "blocked" && (
            <button type="button" className="btn primary" onClick={onRetry}>
              {why === "mic_denied" ? <Mic aria-hidden /> : <Phone aria-hidden />} {t.common.tryAgain}
            </button>
          )}
          {why === "mic_denied" && (
            <button type="button" className="btn secondary" aria-expanded={sample} onClick={() => setSample((s) => !s)}>
              {sample ? t.call.hideSample : t.call.readSample}
            </button>
          )}
        </p>
      </Ln>
      {sample && (
        <div className="entries transcript">
          <Ln>
            <small className="text-ink-2">{t.call.sampleNote}</small>
          </Ln>
          {SAMPLE.map((s) => (
            <Ln key={`${s.who}${s.en}`} m={t.sample.who[s.who]} className={s.who === "check" ? "check" : ""}>
              {s.hi && <span lang="hi">{s.hi}</span>}
              <span className={s.hi ? "gloss" : ""}>{sampleText(t, s)}</span>
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
  const t = useT();
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
      ? t.call.connecting
      : phase.name === "live"
        ? phase.mode === "speaking"
          ? t.call.speaking
          : t.call.listening
        : phase.name === "ended"
          ? t.call.endedAfter(clockOf(phase.seconds))
          : t.call.ended;
  return (
    <>
      <Ln m={t.call.callLabel}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold" role="status">
            {state}
          </span>
          <span className="flex gap-2">
            <button type="button" className="btn bare" aria-pressed={gloss} onClick={() => setGloss((g) => !g)}>
              <Languages aria-hidden /> {t.call.gloss}
            </button>
            {(phase.name === "live" || phase.name === "connecting") && (
              <button type="button" className="btn secondary" onClick={onEnd}>
                <PhoneOff aria-hidden /> {t.call.endCall}
              </button>
            )}
          </span>
        </div>
        {gloss && glossFailed && <small className="text-ink-2">{t.call.glossFailed}</small>}
      </Ln>
      <div className="entries transcript" role="log" aria-live="polite" aria-label={t.call.transcript}>
        {lines.map((line) =>
          line.kind === "check" ? (
            <Ln
              key={line.id}
              className="check"
              m={
                <>
                  {t.call.ruleCheck}
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
                  <b>{line.kind === "agent" ? t.sample.who.munim : `${name} ji`}</b>
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
  const t = useT();
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
      setError(t.call.notSaved);
    } finally {
      setBusy(null);
    }
  };

  // ElevenLabs' own count once its webhook is in; until then, the call's length at its usual rate.
  const used = credits ?? (seconds === null ? null : callCredits(seconds));
  const cost =
    used === null ? null : (
      <Ln m={t.call.cost} a={formatInr(callCostPaise(used))}>
        {t.call.costLine(
          credits === null,
          formatInr(callCostPaise(used)),
          decided?.status === "approved" && first ? t.call.firstDue(formatInr(first.amountPaise), t.date(first.date)) : null,
        )}
        <small>
          {credits === null ? t.call.creditsAbout(clockOf(seconds ?? 0), callCredits(60)) : t.call.creditsExact(used)}
        </small>
      </Ln>
    );

  if (!plan) {
    const said =
      o.kind === "already_paid"
        ? t.call.alreadyPaid(o.reference ?? null)
        : o.kind === "dispute"
          ? t.call.dispute(o.notes ?? "")
          : o.kind === "callback"
            ? t.call.callback(o.date ? t.date(o.date) : null)
            : t.call.noCommit;
    return (
      <div id="outcome" className="sect">
        <Head title={t.call.recorded} />
        <Ln>{said}</Ln>
        {cost}
      </div>
    );
  }

  const agreed = o.kind === "plan";
  const payUrl = payToken ? `${location.origin}/pay/${payToken}` : null;
  const until = last ? t.date(last.date) : "";
  return (
    <div id="outcome" className="sect">
      <Head title={agreed ? t.call.planAgreed : o.kind === "promise" ? t.call.promiseMade : t.call.needsDecision} />
      <Ln m={agreed && <span className="stamp ok">{t.call.planAgreed}</span>}>
        <p className="font-semibold">{t.call.plan(plan)}</p>
        {o.kind === "plan_needs_owner" && <p className="text-sm">{o.issues.map(t.call.issue).join(" ")}</p>}
        {!recorded.saved && <small className="text-ink-2">{t.common.saving}</small>}
      </Ln>
      {recorded.saved && !decided && (
        <Ln>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn primary" disabled={busy !== null} onClick={() => act("approve")}>
              <Check aria-hidden /> {t.call.approve}
            </button>
            <button type="button" className="btn secondary" disabled={busy !== null} onClick={() => act("counter")}>
              {t.call.counter}
            </button>
            <button type="button" className="btn secondary" disabled={busy !== null} onClick={() => act("decline")}>
              {t.call.decline}
            </button>
          </div>
          <small className="mt-2 block text-ink-2">{t.call.approveNote(until)}</small>
        </Ln>
      )}
      {decided?.status === "approved" && (
        <Ln>
          <p role="status">{t.call.approvedNote(until, plan.length > 1)}</p>
          <p className="mt-2 flex flex-wrap gap-2">
            {payUrl && (
              <a
                className="btn primary"
                target="_blank"
                rel="noopener"
                href={whatsappLink(phone, callConfirmation({ customerName, businessName, instalments: plan, payUrl }))}
              >
                <MessageCircle aria-hidden /> {t.call.whatsapp}
              </a>
            )}
            <button type="button" className="btn bare" disabled={busy !== null} onClick={() => act("undo")}>
              <Undo2 aria-hidden /> {t.call.undo}
            </button>
          </p>
        </Ln>
      )}
      {decided?.status === "declined" && (
        <Ln>
          <p role="status">
            {decided.action === "counter" && decided.counter ? t.call.countered(t.call.plan(decided.counter)) : t.call.declinedNote}
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
