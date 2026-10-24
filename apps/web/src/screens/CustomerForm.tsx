import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { SaveError, emailSetup, saveCustomer } from "../lib/appwrite.ts";
import { blankCustomer, customerBody, customerIssues, draftOf, type CustomerDraft } from "../lib/customer-form.ts";
import { useWorld, useWorldState } from "../lib/world.tsx";
import { useT } from "../i18n/index.ts";
import { Ln, Paper } from "../ui.tsx";
import { CustomerFields } from "./CustomerFields.tsx";
import { NotFound } from "./NotFound.tsx";

type EmailSetup = Awaited<ReturnType<typeof emailSetup>>;

/** /app/customers/new and /app/customers/:id/edit. The server checks every field again. */
export function CustomerForm() {
  const { id } = useParams();
  const world = useWorld();
  const { reload } = useWorldState();
  const navigate = useNavigate();
  const t = useT();
  const existing = id ? world.customers.get(id) : undefined;
  const [draft, setDraft] = useState<CustomerDraft>(() => (existing ? draftOf(existing) : blankCustomer()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<EmailSetup | null>(null);

  useEffect(() => {
    let live = true;
    emailSetup().then(
      (found) => live && setSetup(found),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);

  if (id && !existing) return <NotFound what="Customer" />;

  // Their state is the place of supply on every Invoice already issued to them.
  const stateLocked = existing !== undefined && world.invoices.some((invoice) => invoice.customerId === existing.$id);
  const issues = customerIssues(draft);
  const canSave = issues.length === 0 && !saving;
  const emailNote = !draft.email.trim()
    ? null
    : setup === null
      ? null
      : setup.customerEmails
        ? t.customerForm.emailOwn
        : setup.emailReady && setup.demoInbox
          ? t.customerForm.emailInbox(setup.demoInbox)
          : t.customerForm.emailOff;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const { customerId } = await saveCustomer(existing?.$id ?? null, customerBody(draft));
      await reload();
      navigate(`/app/customers/${customerId}`);
    } catch (e) {
      const code = e instanceof SaveError ? e.code : "save_failed";
      setError(t.customerForm.errors[code] ?? t.customerForm.saveFailed);
      setSaving(false);
    }
  };

  return (
    <Paper label={existing ? t.customerForm.editTitle : t.customerForm.addTitle}>
      <Ln>
        <p className="text-[13px] text-ink-2">
          <Link to="/app/customers">{t.customers.title}</Link>
          {existing && (
            <>
              {" / "}
              <Link to={`/app/customers/${existing.$id}`}>{existing.name}</Link>
            </>
          )}{" "}
          / {existing ? t.customerForm.crumbEdit : t.customerForm.crumbNew}
        </p>
        <h1 className="mt-1 text-[28px] leading-tight">{existing ? t.customerForm.editTitle : t.customerForm.addTitle}</h1>
        <p className="mt-2 max-w-[60ch]">{t.customerForm.intro}</p>
      </Ln>
      <Ln>
        <form
          className="mt-6 grid max-w-[44rem] gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <CustomerFields draft={draft} onChange={setDraft} stateLocked={stateLocked} />
          {emailNote && <p className="text-sm text-ink-2">{emailNote}</p>}
          {issues.length > 0 && (
            <div className="text-sm">
              <p>{t.customerForm.toSave}</p>
              <ul className="mt-1 list-disc pl-5">
                {issues.map((issue) => (
                  <li key={issue}>{t.newInvoice.blockers[issue]}</li>
                ))}
              </ul>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-sindoor">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn primary" disabled={!canSave}>
              {saving ? t.common.saving : t.customerForm.save}
            </button>
            <Link to={existing ? `/app/customers/${existing.$id}` : "/app/customers"} className="btn bare">
              {t.common.cancel}
            </Link>
          </div>
        </form>
      </Ln>
    </Paper>
  );
}
