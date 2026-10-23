// /app/settings: only what the story needs (build plan §6.3). Business
// details and registration drive the document type and the e-invoicing note;
// the Plan rule bounds what the agent and the pay link may offer; the switches
// choose which Ladder messages the daily run sends without asking.
import { useState, type FormEvent, type ReactNode } from "react";
import { AUTO_SEND_SWITCHES, LADDER_STAGES, planRule } from "@tagada/domain";
import { E_INVOICE_TURNOVER_PAISE, formatInr, parseAmountPaise } from "@tagada/money";
import { saveSettings } from "../lib/appwrite.ts";
import { LANGUAGES } from "../lib/languages.ts";
import { useLang } from "../lib/prefs.ts";
import { useWorld, useWorldState } from "../lib/world.tsx";
import { Head, Ln, Paper } from "../ui.tsx";

const control = "min-h-11 w-full rounded-md border border-rule-strong bg-paper px-3 text-ink";
const small = "min-h-11 w-20 rounded-md border border-rule-strong bg-paper px-3 text-ink";

const REGISTRATIONS = [
  { id: "regular", name: "Regular GST", note: "Tax Invoice, with GST" },
  { id: "composition", name: "Composition", note: "Bill of Supply, no GST charged" },
  { id: "unregistered", name: "Not registered", note: "Invoice, no GST" },
] as const;

const PROBLEMS: Record<string, string> = {
  businessName: "Give your business a name.",
  address: "The address is too long.",
  registrationType: "Choose how you are registered.",
  aggregateTurnoverPaise: "Write the turnover in rupees, like 1,80,00,000.",
  planRule: "The rest must be due after the first instalment; the first instalment is 1% to 100%.",
  autoSendStages: "Only the three messages can go out on their own.",
  ownerEmail: "That email address does not look right.",
  lang: "Choose a language.",
};

function Field({ label, hint, children }: { label: string; hint?: string | null; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && (
        <span role="alert" className="text-sindoor">
          {hint}
        </span>
      )}
    </label>
  );
}

/** Whole rupees, as typed back into the turnover box. */
function rupees(paise: number): string {
  return formatInr(paise).replace("₹", "");
}

export function Settings() {
  const world = useWorld();
  const { reload } = useWorldState();
  const { choose } = useLang();
  const ws = world.workspace;
  const rule = planRule.parse(ws.planRule);

  const [form, setForm] = useState({
    businessName: ws.businessName,
    address: ws.address ?? "",
    registrationType: ws.registrationType,
    turnover: rupees(ws.aggregateTurnoverPaise ?? 0),
    minFirstPct: String(rule.minFirstPct),
    firstWithinDays: String(rule.firstWithinDays),
    restWithinDays: String(rule.restWithinDays),
    autoSendStages: [...ws.autoSendStages],
    ownerEmail: ws.ownerEmail ?? "",
    lang: ws.lang ?? "en",
  });
  const [problem, setProblem] = useState<{ field: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<typeof form>) => {
    setForm((now) => ({ ...now, ...patch }));
    setSaved(false);
  };
  const hint = (field: string) => (problem?.field === field ? PROBLEMS[field] : null);
  const turnoverPaise = parseAmountPaise(form.turnover);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    if (turnoverPaise === null) {
      setProblem({ field: "aggregateTurnoverPaise" });
      return;
    }
    setSaving(true);
    try {
      const result = await saveSettings({
        businessName: form.businessName,
        address: form.address,
        registrationType: form.registrationType,
        aggregateTurnoverPaise: turnoverPaise,
        planRule: {
          minFirstPct: Number(form.minFirstPct),
          firstWithinDays: Number(form.firstWithinDays),
          restWithinDays: Number(form.restWithinDays),
        },
        autoSendStages: form.autoSendStages,
        ownerEmail: form.ownerEmail.trim() || null,
        lang: form.lang,
      });
      if (!result.ok) {
        setProblem({ field: result.field });
        return;
      }
      if (form.lang === "en" || form.lang === "hi") choose(form.lang);
      await reload();
      setSaved(true);
    } catch (e) {
      console.error("settings failed to save", e);
      setProblem({ field: "save" });
    } finally {
      setSaving(false);
    }
  };

  const toggleStage = (stage: number, on: boolean) =>
    set({ autoSendStages: on ? [...form.autoSendStages, stage].sort() : form.autoSendStages.filter((s) => s !== stage) });

  return (
    <Paper label="Settings">
      <form onSubmit={save} noValidate>
        <div className="ln wide">
          <div className="m" />
          <div className="p">
            <h1 className="text-[28px] leading-tight">Settings</h1>
            <p className="mt-1 max-w-[60ch] text-ink-2">Your business, your Plan rule and what the Ladder may send on its own.</p>
          </div>
        </div>

        <div className="sect mt-6">
          <Head title="Your business" />
          <Ln>
            <div className="grid max-w-[560px] gap-3">
              <Field label="Business name" hint={hint("businessName")}>
                <input className={control} value={form.businessName} onChange={(e) => set({ businessName: e.target.value })} />
              </Field>
              <Field label="Address" hint={hint("address")}>
                <input className={control} value={form.address} onChange={(e) => set({ address: e.target.value })} />
              </Field>
              <fieldset className="picker grid gap-2">
                <legend className="px-1 text-sm font-medium">GST registration</legend>
                {REGISTRATIONS.map((r) => (
                  <label key={r.id} className="choice">
                    <input
                      type="radio"
                      name="registration"
                      checked={form.registrationType === r.id}
                      onChange={() => set({ registrationType: r.id })}
                    />
                    <span>
                      {r.name}
                      <small>{r.note}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <Field label="Aggregate turnover this year, ₹" hint={hint("aggregateTurnoverPaise")}>
                <input className={control} inputMode="decimal" value={form.turnover} onChange={(e) => set({ turnover: e.target.value })} />
              </Field>
              <small className="text-ink-2">
                {turnoverPaise !== null && turnoverPaise > E_INVOICE_TURNOVER_PAISE
                  ? "Above ₹5 crore: your Invoices carry the e-invoicing note."
                  : "Up to ₹5 crore: no e-invoicing note."}
              </small>
            </div>
          </Ln>
        </div>

        <div className="sect">
          <Head title="Your Plan rule" />
          <Ln>
            <p className="flex flex-wrap items-center gap-2 text-sm">
              First instalment at least
              <input aria-label="First instalment, percent" className={small} inputMode="numeric" value={form.minFirstPct} onChange={(e) => set({ minFirstPct: e.target.value })} />
              % within
              <input aria-label="First instalment within days" className={small} inputMode="numeric" value={form.firstWithinDays} onChange={(e) => set({ firstWithinDays: e.target.value })} />
              days, the rest within
              <input aria-label="Rest within days" className={small} inputMode="numeric" value={form.restWithinDays} onChange={(e) => set({ restWithinDays: e.target.value })} />
              days.
            </p>
            {hint("planRule") && (
              <small role="alert" className="text-sindoor">
                {hint("planRule")}
              </small>
            )}
            <small>Call with AI and the pay link only offer Plans inside this rule; anything else needs your decision.</small>
          </Ln>
        </div>

        <div className="sect">
          <Head title="Sent on their own" />
          <Ln>
            <fieldset className="grid max-w-[560px] gap-2">
              <legend className="sr-only">Ladder messages the daily run sends without asking</legend>
              {AUTO_SEND_SWITCHES.map((stage) => (
                <label key={stage} className="choice">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={form.autoSendStages.includes(stage)}
                    onChange={(e) => toggleStage(stage, e.target.checked)}
                  />
                  <span>
                    {LADDER_STAGES[stage - 1]?.name}
                    <small>
                      {form.autoSendStages.includes(stage)
                        ? "On: the 10:00 run emails it."
                        : "Off: it waits in Today's follow-ups as Ready to send."}
                    </small>
                  </span>
                </label>
              ))}
              {LADDER_STAGES.slice(AUTO_SEND_SWITCHES.length).map((stage) => (
                <p key={stage.stage} className="choice cursor-default">
                  <span>
                    {stage.name}
                    <small>
                      {stage.stage === 5 ? "Never sent automatically: you send it." : "Always yours to take."}
                    </small>
                  </span>
                </p>
              ))}
            </fieldset>
            {hint("autoSendStages") && (
              <small role="alert" className="text-sindoor">
                {hint("autoSendStages")}
              </small>
            )}
          </Ln>
        </div>

        <div className="sect">
          <Head title="Email" />
          <Ln>
            <div className="grid max-w-[560px] gap-3">
              <Field label="Your email (Customers' replies come here)" hint={hint("ownerEmail")}>
                <input className={control} type="email" value={form.ownerEmail} onChange={(e) => set({ ownerEmail: e.target.value })} />
              </Field>
              <small className="text-ink-2">
                Reminder emails go from “{form.businessName} via Tagada”. In this demo every one is delivered to the one
                Demo inbox, never to a Customer.
              </small>
            </div>
          </Ln>
        </div>

        <div className="sect">
          <Head title="Language" />
          <Ln>
            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">Your language</legend>
              {LANGUAGES.map((l) => (
                <label key={l.id} className="choice" lang={l.id}>
                  <input type="radio" name="lang" checked={form.lang === l.id} onChange={() => set({ lang: l.id })} />
                  <span>{l.name}</span>
                </label>
              ))}
            </fieldset>
          </Ln>
        </div>

        <div className="sect">
          <Ln>
            <span className="flex flex-wrap items-center gap-3">
              <button type="submit" className="btn primary" disabled={saving}>
                {saving ? "Saving…" : "Save settings"}
              </button>
              <span role="status" className="text-sm">
                {saved && "Saved."}
                {problem?.field === "save" && <span className="text-sindoor">Not saved. Try again.</span>}
              </span>
            </span>
          </Ln>
        </div>
      </form>
    </Paper>
  );
}
