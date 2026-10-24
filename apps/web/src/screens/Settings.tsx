// /app/settings: only what the story needs (build plan §6.3). Business
// details and registration drive the document type and the e-invoicing note;
// the Plan rule bounds what the agent and the pay link may offer; the switches
// choose which Ladder messages the daily run sends without asking.
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { AUTO_SEND_SWITCHES, LADDER_STAGES, planRule } from "@tagada/domain";
import { E_INVOICE_TURNOVER_PAISE, formatInr, parseAmountPaise } from "@tagada/money";
import { useT } from "../i18n/index.ts";
import { emailSetup, saveSettings } from "../lib/appwrite.ts";
import { LANGUAGES } from "../lib/languages.ts";
import { useLang } from "../lib/prefs.ts";
import { useWorld, useWorldState } from "../lib/world.tsx";
import { Head, Ln, Paper } from "../ui.tsx";

const control = "min-h-11 w-full rounded-md border border-rule-strong bg-paper px-3 text-ink";
const small = "min-h-11 w-20 rounded-md border border-rule-strong bg-paper px-3 text-ink";

const REGISTRATIONS = ["regular", "composition", "unregistered"] as const;

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

/** The one Demo inbox every reminder email is delivered to: fixed to the Resend account's own email. */
function DemoInbox({ businessName }: { businessName: string }) {
  const t = useT();
  const [setup, setSetup] = useState<Awaited<ReturnType<typeof emailSetup>> | "loading" | "failed">("loading");
  useEffect(() => {
    let live = true;
    emailSetup().then(
      (found) => live && setSetup(found),
      (e: unknown) => {
        console.error("email setup could not be read", e);
        if (live) setSetup("failed");
      },
    );
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className="grid gap-1 text-sm">
      <span className="font-medium">{t.settings.demoInbox}</span>
      {setup === "loading" ? (
        <span className="text-ink-2">{t.settings.reading}</span>
      ) : setup === "failed" ? (
        <span className="text-ink-2">{t.settings.unreadable}</span>
      ) : setup.emailReady ? (
        <span className="mono break-all">{setup.demoInbox}</span>
      ) : (
        <span role="alert" className="text-sindoor">
          {t.settings.noEmail}
        </span>
      )}
      <small className="text-ink-2">{t.settings.fromNote(businessName)}</small>
    </div>
  );
}

/** Delete my workspace (DPDP Act, 2023): a confirm step, then every row and file goes and a fresh world opens on Today. */
function DeleteWorkspace() {
  const t = useT();
  const { deleteMine } = useWorldState();
  const navigate = useNavigate();
  const [step, setStep] = useState<"idle" | "confirm" | "deleting" | "failed">("idle");
  const erase = async () => {
    setStep("deleting");
    try {
      await deleteMine();
      navigate("/app");
    } catch (e) {
      console.error("workspace delete failed", e);
      setStep("failed");
    }
  };
  return (
    <div className="sect">
      <Head title={t.settings.yourData} />
      <Ln>
        <div className="grid max-w-[560px] gap-3 text-sm">
          <p className="text-ink-2">{t.settings.dataNote}</p>
          {step === "idle" || step === "failed" ? (
            <span className="flex flex-wrap items-center gap-3">
              <button type="button" className="btn secondary" onClick={() => setStep("confirm")}>
                {t.settings.deleteWorkspace}
              </button>
              {step === "failed" && (
                <span role="alert" className="text-sindoor">
                  {t.settings.notDeleted}
                </span>
              )}
            </span>
          ) : (
            <div role="alertdialog" aria-labelledby="delete-confirm" className="grid gap-2">
              <p id="delete-confirm" className="font-medium">
                {t.settings.confirmDelete}
              </p>
              <span className="flex flex-wrap items-center gap-3">
                <button type="button" className="btn primary" onClick={erase} disabled={step === "deleting"}>
                  {step === "deleting" ? t.settings.deleting : t.settings.yesDelete}
                </button>
                <button type="button" className="btn secondary" onClick={() => setStep("idle")} disabled={step === "deleting"}>
                  {t.settings.keep}
                </button>
              </span>
            </div>
          )}
        </div>
      </Ln>
    </div>
  );
}

/** Whole rupees, as typed back into the turnover box. */
function rupees(paise: number): string {
  return formatInr(paise).replace("₹", "");
}

export function Settings() {
  const world = useWorld();
  const { reload } = useWorldState();
  // The header and Settings share one choice: the radios show it, and Save stores it with the workspace.
  const { lang, choose } = useLang();
  const t = useT();
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
  });
  const [problem, setProblem] = useState<{ field: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<typeof form>) => {
    setForm((now) => ({ ...now, ...patch }));
    setSaved(false);
  };
  const hint = (field: string) => (problem?.field === field ? t.settings.problems[field] : null);
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
        lang,
      });
      if (!result.ok) {
        setProblem({ field: result.field });
        return;
      }
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
    <Paper label={t.settings.title}>
      <form onSubmit={save} noValidate>
        <div className="ln wide">
          <div className="m" />
          <div className="p">
            <h1 className="text-[28px] leading-tight">{t.settings.title}</h1>
            <p className="mt-1 max-w-[60ch] text-ink-2">{t.settings.intro}</p>
          </div>
        </div>

        <div className="sect mt-6">
          <Head title={t.settings.business} />
          <Ln>
            <div className="grid max-w-[560px] gap-3">
              <Field label={t.settings.businessName} hint={hint("businessName")}>
                <input className={control} value={form.businessName} onChange={(e) => set({ businessName: e.target.value })} />
              </Field>
              <Field label={t.settings.address} hint={hint("address")}>
                <input className={control} value={form.address} onChange={(e) => set({ address: e.target.value })} />
              </Field>
              <fieldset className="picker grid gap-2">
                <legend className="px-1 text-sm font-medium">{t.settings.registration}</legend>
                {REGISTRATIONS.map((id) => (
                  <label key={id} className="choice">
                    <input
                      type="radio"
                      name="registration"
                      checked={form.registrationType === id}
                      onChange={() => set({ registrationType: id })}
                    />
                    <span>
                      {t.settings.registrations[id].name}
                      <small>{t.settings.registrations[id].note}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <Field label={t.settings.turnover} hint={hint("aggregateTurnoverPaise")}>
                <input className={control} inputMode="decimal" value={form.turnover} onChange={(e) => set({ turnover: e.target.value })} />
              </Field>
              <small className="text-ink-2">
                {turnoverPaise !== null && turnoverPaise > E_INVOICE_TURNOVER_PAISE ? t.settings.eInvoiceAbove : t.settings.eInvoiceBelow}
              </small>
            </div>
          </Ln>
        </div>

        <div className="sect">
          <Head title={t.settings.planRule} />
          <Ln>
            <p className="flex flex-wrap items-center gap-2 text-sm">
              {t.settings.firstAtLeast}
              <input aria-label={t.settings.firstPct} className={small} inputMode="numeric" value={form.minFirstPct} onChange={(e) => set({ minFirstPct: e.target.value })} />
              {t.settings.percentWithin}
              <input aria-label={t.settings.firstDays} className={small} inputMode="numeric" value={form.firstWithinDays} onChange={(e) => set({ firstWithinDays: e.target.value })} />
              {t.settings.daysRestWithin}
              <input aria-label={t.settings.restDays} className={small} inputMode="numeric" value={form.restWithinDays} onChange={(e) => set({ restWithinDays: e.target.value })} />
              {t.settings.daysEnd}
            </p>
            {hint("planRule") && (
              <small role="alert" className="text-sindoor">
                {hint("planRule")}
              </small>
            )}
            <small>{t.settings.ruleNote}</small>
          </Ln>
        </div>

        <div className="sect">
          <Head title={t.settings.autoSend} />
          <Ln>
            <fieldset className="grid max-w-[560px] gap-2">
              <legend className="sr-only">{t.settings.autoSendLegend}</legend>
              {AUTO_SEND_SWITCHES.map((stage) => (
                <label key={stage} className="choice">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={form.autoSendStages.includes(stage)}
                    onChange={(e) => toggleStage(stage, e.target.checked)}
                  />
                  <span>
                    {t.ladder.stages[stage - 1]?.name}
                    <small>{form.autoSendStages.includes(stage) ? t.settings.on : t.settings.off}</small>
                  </span>
                </label>
              ))}
              {LADDER_STAGES.slice(AUTO_SEND_SWITCHES.length).map((stage) => (
                <p key={stage.stage} className="choice cursor-default">
                  <span>
                    {t.ladder.stages[stage.stage - 1]?.name}
                    <small>{stage.stage === 5 ? t.settings.never : t.settings.always}</small>
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
          <Head title={t.settings.email} />
          <Ln>
            <div className="grid max-w-[560px] gap-3">
              <Field label={t.settings.yourEmail} hint={hint("ownerEmail")}>
                <input className={control} type="email" value={form.ownerEmail} onChange={(e) => set({ ownerEmail: e.target.value })} />
              </Field>
              <DemoInbox businessName={form.businessName} />
            </div>
          </Ln>
        </div>

        <div className="sect">
          <Head title={t.settings.language} />
          <Ln>
            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">{t.settings.yourLanguage}</legend>
              {LANGUAGES.map((l) => (
                <label key={l.id} className="choice" lang={l.id}>
                  <input
                    type="radio"
                    name="lang"
                    checked={lang === l.id}
                    onChange={() => {
                      choose(l.id);
                      setSaved(false);
                    }}
                  />
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
                {saving ? t.common.saving : t.settings.save}
              </button>
              <span role="status" className="text-sm">
                {saved && t.settings.saved}
                {problem?.field === "save" && <span className="text-sindoor">{t.settings.notSaved}</span>}
              </span>
            </span>
          </Ln>
        </div>
      </form>
      <DeleteWorkspace />
    </Paper>
  );
}
