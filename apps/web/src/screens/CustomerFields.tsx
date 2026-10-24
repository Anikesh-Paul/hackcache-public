import { indianStates } from "@tagada/money";
import { customerIssues, type CustomerDraft } from "../lib/customer-form.ts";
import { LANGUAGES, type LanguageId } from "../lib/languages.ts";
import { gstinMessage } from "../lib/preview-as.ts";
import { useT } from "../i18n/index.ts";
import { Field, control } from "../ui.tsx";

/**
 * A Customer's details, as New invoice, Add Customer and Edit Customer ask
 * for them. `stateLocked`: they have Invoices, so their state (the place of
 * supply on those Invoices) stays as it is.
 */
export function CustomerFields({
  draft,
  onChange,
  stateLocked = false,
}: {
  draft: CustomerDraft;
  onChange: (next: (current: CustomerDraft) => CustomerDraft) => void;
  stateLocked?: boolean;
}) {
  const t = useT();
  const set = (patch: Partial<CustomerDraft>) => onChange((current) => ({ ...current, ...patch }));
  const issues = new Set(customerIssues(draft));
  const gstinCheck = draft.gstin.trim() ? gstinMessage(draft.gstin) : null;
  const gstinProblem = gstinCheck === null ? null : gstinCheck === "check-digit" ? t.newInvoice.gstinCheck : t.newInvoice.gstinShape;

  return (
    <div className="grid gap-3">
      <Field label={t.newInvoice.name}>
        <input className={control} value={draft.name} maxLength={128} onChange={(event) => set({ name: event.target.value })} />
      </Field>
      <Field label={t.newInvoice.gstinOptional} hint={gstinProblem}>
        <input
          className={control}
          value={draft.gstin}
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={gstinProblem ? true : undefined}
          onChange={(event) => {
            const gstin = event.target.value.toUpperCase();
            const valid = gstin.trim().length > 0 && gstinMessage(gstin) === null;
            onChange((current) => ({
              ...current,
              gstin,
              stateCode: valid && !stateLocked ? gstin.trim().slice(0, 2) : current.stateCode,
            }));
          }}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.newInvoice.state} hint={stateLocked ? t.customerForm.stateLocked : null}>
          <select
            className={control}
            value={draft.stateCode}
            disabled={stateLocked}
            onChange={(event) => set({ stateCode: event.target.value })}
          >
            <option value="">{t.newInvoice.chooseState}</option>
            {indianStates().map((state) => (
              <option key={state.code} value={state.code}>
                {state.code} {state.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.newInvoice.creditDays}>
          <input
            className={control}
            inputMode="numeric"
            value={draft.creditDays}
            onChange={(event) => set({ creditDays: event.target.value })}
          />
        </Field>
      </div>
      <Field label={t.newInvoice.language}>
        <select className={control} value={draft.lang} onChange={(event) => set({ lang: event.target.value as LanguageId })}>
          {LANGUAGES.map((language) => (
            <option key={language.id} value={language.id} lang={language.id}>
              {language.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t.newInvoice.address}>
        <input className={control} value={draft.address} maxLength={256} onChange={(event) => set({ address: event.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.customerForm.email} hint={issues.has("email") ? t.customerForm.emailHint : null}>
          <input
            className={control}
            type="email"
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
            value={draft.email}
            aria-invalid={issues.has("email") ? true : undefined}
            onChange={(event) => set({ email: event.target.value })}
          />
        </Field>
        <Field label={t.customerForm.phone} hint={issues.has("phone") ? t.customerForm.phoneHint : null}>
          <input
            className={control}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={draft.phone}
            aria-invalid={issues.has("phone") ? true : undefined}
            onChange={(event) => set({ phone: event.target.value })}
          />
        </Field>
      </div>
      <label className="flex min-h-11 items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1 size-4"
          checked={draft.consentCalls}
          onChange={(event) => set({ consentCalls: event.target.checked })}
        />
        <span>
          <span className="font-medium">{t.customerForm.consent}</span>
          <small className="block text-ink-2">{t.customerForm.consentNote}</small>
        </span>
      </label>
    </div>
  );
}
