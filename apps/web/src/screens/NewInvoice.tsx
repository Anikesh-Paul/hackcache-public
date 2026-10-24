import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import type { CustomerRow, InvoiceLineRow } from "@tagada/appwrite";
import {
  GST_RATES,
  LINE_UNITS,
  addDays,
  formatAmountInput,
  isGstRate,
  isLineUnit,
  parseAmountPaise,
  quantityMilli,
  stateName,
  type GstRate,
  type LineUnit,
} from "@tagada/money";
import { SaveError, createInvoice, editInvoice } from "../lib/appwrite.ts";
import { blankCustomer, customerBody, customerIssues, type CustomerDraft } from "../lib/customer-form.ts";
import { priceDraft, type DraftLine, type PreviewAs } from "../lib/preview-as.ts";
import { useInvoiceRows, useWorld, useWorldState } from "../lib/world.tsx";
import { Field, Ln, Paper, control } from "../ui.tsx";
import { CustomerFields } from "./CustomerFields.tsx";
import { NotFound } from "./NotFound.tsx";
import { TaxInvoice } from "./TaxInvoice.tsx";
import { useT } from "../i18n/index.ts";

const MODES: PreviewAs[] = ["regular", "composition", "unregistered"];

type LineDraft = {
  key: string;
  description: string;
  hsn: string;
  qty: string;
  unit: LineUnit;
  rate: string;
  discount: string;
  gst: GstRate;
};

/** Bamboo and cane basketwork, what this Demo business mostly sells. The Owner can type another. */
const DEFAULT_HSN = "4602";

function blankLine(): LineDraft {
  return { key: crypto.randomUUID(), description: "", hsn: DEFAULT_HSN, qty: "1", unit: "nos", rate: "", discount: "0", gst: 5 };
}

/** 2.5 or 0.75 are fine; at most three decimals, above 0. */
function validQuantity(text: string): boolean {
  const value = text.trim();
  if (!/^\d*\.?\d+$/.test(value)) return false;
  try {
    return quantityMilli(Number(value)) >= 1n;
  } catch {
    return false;
  }
}

function fromStored(line: InvoiceLineRow): LineDraft {
  const rate = line.gstRateBp / 100;
  return {
    key: line.$id,
    description: line.description,
    hsn: line.hsn ?? "",
    qty: String(line.qtyMilli / 1000),
    unit: isLineUnit(line.unit) ? line.unit : "nos",
    rate: formatAmountInput(line.ratePaise),
    discount: String(line.discountBp / 100),
    gst: isGstRate(rate) ? rate : 5,
  };
}

type LineField = "description" | "hsn" | "qty" | "rate" | "discount";

/** The fields of a line that would stop it saving, so the form can say which. */
function lineIssues(line: LineDraft): Set<LineField> {
  const issues = new Set<LineField>();
  const discount = line.discount.trim() === "" ? 0 : Number(line.discount);
  if (!line.description.trim()) issues.add("description");
  if (!/^\d{4,8}$/.test(line.hsn.trim())) issues.add("hsn");
  if (!validQuantity(line.qty)) issues.add("qty");
  if (!line.rate.trim() || parseAmountPaise(line.rate) === null) issues.add("rate");
  if (!Number.isInteger(discount) || discount < 0 || discount > 100) issues.add("discount");
  return issues;
}

function parseLine(line: LineDraft): DraftLine | null {
  if (lineIssues(line).size > 0) return null;
  const ratePaise = parseAmountPaise(line.rate) ?? 0;
  const discount = line.discount.trim() === "" ? 0 : Number(line.discount);
  const quantity = Number(line.qty);
  return {
    description: line.description.trim(),
    hsn: line.hsn.trim(),
    quantity,
    ratePaise,
    discountPercent: discount,
    gstRatePercent: line.gst,
    unit: line.unit,
  };
}

/** A line counts as started once it has a description or a rate; the HSN comes filled in. */
function touched(line: LineDraft): boolean {
  return Boolean(line.description.trim() || line.rate.trim());
}

function freshCustomer(fresh: CustomerDraft, workspaceId: string): CustomerRow | null {
  if (!/^[0-9]{2}$/.test(fresh.stateCode)) return null;
  const credit = Number(fresh.creditDays);
  return {
    $id: "new",
    workspaceId,
    name: fresh.name.trim() || "New Customer",
    address: fresh.address.trim() || null,
    gstin: fresh.gstin.trim().toUpperCase() || null,
    stateCode: fresh.stateCode,
    place: stateName(fresh.stateCode),
    phone: fresh.phone.trim() || null,
    email: fresh.email.trim() || null,
    buyerType: "goods",
    creditDays: Number.isInteger(credit) && credit >= 0 && credit <= 365 ? credit : 30,
    avgDelayDays: null,
    grade: null,
    gradeReason: null,
    consentCalls: fresh.consentCalls,
    consentAt: null,
    lang: fresh.lang,
    gender: null,
  };
}

/**
 * /app/invoices/new, and /app/invoices/:id/edit for an unpaid Invoice with
 * nothing paid against it: its lines and due date change; its number,
 * Customer and issue date stay.
 */
export function NewInvoice() {
  const world = useWorld();
  const { reload } = useWorldState();
  const navigate = useNavigate();
  const t = useT();
  const [params] = useSearchParams();
  const { id: editId } = useParams();
  const editing = editId ? world.invoices.find((invoice) => invoice.$id === editId) : undefined;
  const fromId = params.get("from") ?? undefined;
  // Came from the landing page's "Make your own invoice": walk the judge through it.
  const trying = params.has("try");
  const source = editing ?? (fromId ? world.invoices.find((invoice) => invoice.$id === fromId) : undefined);
  const sourceLines = useInvoiceRows<InvoiceLineRow>("invoice_lines", source?.$id);
  const applied = useRef(false);

  const [mode, setMode] = useState<PreviewAs>("regular");
  const [customerId, setCustomerId] = useState("");
  const [fresh, setFresh] = useState<CustomerDraft>(blankCustomer);
  const [lines, setLines] = useState<LineDraft[]>([blankLine()]);
  const [dueDate, setDueDate] = useState(editing?.dueDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (applied.current || !source || !sourceLines || sourceLines === "failed") return;
    applied.current = true;
    setCustomerId(source.customerId);
    setLines(sourceLines.length > 0 ? sourceLines.map(fromStored) : [blankLine()]);
  }, [source, sourceLines]);

  const customers = [...world.customers.values()].sort((a, b) => a.name.localeCompare(b.name));
  const picked = customerId === "new" ? freshCustomer(fresh, world.workspace.$id) : (world.customers.get(customerId) ?? null);
  const ready = lines.flatMap((line) => {
    const parsed = parseLine(line);
    return parsed ? [parsed] : [];
  });
  const partial = lines.some((line) => touched(line) && !parseLine(line));
  const priced = priceDraft({ mode, workspace: world.workspace, customer: picked, lines: ready });
  const creditDays = picked?.creditDays ?? 30;
  const dueOk = !editing || (dueDate >= editing.issueDate && dueDate <= addDays(editing.issueDate, 365));
  const freshIssues = customerId === "new" ? customerIssues(fresh) : [];
  const canSave =
    priced?.saves === true &&
    !saving &&
    !partial &&
    ready.length > 0 &&
    dueOk &&
    (customerId !== "new" ? Boolean(world.customers.get(customerId)) : freshIssues.length === 0);
  // Why Save is off, in words, so a disabled button never leaves the Owner guessing.
  const blockers: string[] = [];
  if (mode === "regular" && !saving) {
    if (!customerId) blockers.push(t.newInvoice.blockers.customer);
    for (const issue of freshIssues) blockers.push(t.newInvoice.blockers[issue]);
    if (!lines.some(touched)) blockers.push(t.newInvoice.blockers.line);
    if (!dueOk) blockers.push(t.newInvoice.blockers.dueDate);
  }
  const lineHint = (line: LineDraft, field: LineField) =>
    touched(line) && lineIssues(line).has(field) ? t.newInvoice.lineHints[field] : null;
  const edit = (key: string, patch: Partial<LineDraft>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const body =
      customerId === "new"
        ? {
            customer: customerBody(fresh),
            lines: ready,
          }
        : { customerId, lines: ready };
    try {
      if (editing) {
        await editInvoice(editing.$id, { lines: ready, dueDate });
        // Read again, so the Invoice's lines are the new ones.
        await reload();
        navigate(`/app/invoices/${editing.$id}`);
        return;
      }
      const { invoiceId } = await createInvoice(body);
      await reload();
      navigate(`/app/invoices/${invoiceId}${trying ? "?try" : ""}`);
    } catch (e) {
      const code = e instanceof SaveError ? e.code : "save_failed";
      setError(t.newInvoice.errors[code] ?? t.newInvoice.saveFailed);
      setSaving(false);
    }
  };

  if (editId && !editing) return <NotFound what="Invoice" />;
  if (editing && (editing.paidPaise > 0 || (editing.status !== "sent" && editing.status !== "disputed"))) {
    return (
      <Paper label={t.newInvoice.editTitle}>
        <Ln>
          <h1 className="text-[28px] leading-tight">{t.newInvoice.editTitle}</h1>
          <p className="mt-2 max-w-[60ch]">{t.newInvoice.notEditable}</p>
          <Link to={`/app/invoices/${editing.$id}`} className="btn secondary mt-4">
            {t.newInvoice.backToInvoice(editing.number)}
          </Link>
        </Ln>
      </Paper>
    );
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Paper label={editing ? t.newInvoice.editTitle : t.newInvoice.label}>
        <Ln>
          <p className="text-[13px] text-ink-2">
            <Link to="/app/invoices">{t.invoices.title}</Link>
            {editing ? (
              <>
                {" / "}
                <Link to={`/app/invoices/${editing.$id}`}>{editing.number}</Link> / {t.newInvoice.crumbEdit}
              </>
            ) : (
              <>
                {source ? ` / ${source.number}` : ""} / {t.newInvoice.crumbNew}
              </>
            )}
          </p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-[28px] leading-tight">{editing ? t.newInvoice.editTitle : t.newInvoice.title}</h1>
            <button type="button" className="btn primary" disabled={!canSave} onClick={save}>
              {saving
                ? t.common.saving
                : priced?.saves === false
                  ? t.newInvoice.previewOnly
                  : editing
                    ? t.newInvoice.saveChanges
                    : t.newInvoice.save}
            </button>
          </div>
          <p className="mt-2 max-w-[60ch]">{editing ? t.newInvoice.editIntro(editing.number) : t.newInvoice.intro}</p>
          {trying && (
            <div className="mt-4 rounded-md border border-bamboo bg-bamboo-soft p-3 text-sm">
              <p className="font-semibold">{t.newInvoice.tryTitle}</p>
              <ol className="mt-1 list-decimal pl-5">
                {t.newInvoice.trySteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          )}
          {!editing && (
          <div role="group" aria-label={t.newInvoice.previewAs} className="mt-4 flex flex-wrap gap-2">
            {MODES.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={mode === id}
                onClick={() => setMode(id)}
                className={`min-h-11 rounded-md border px-3 text-sm ${
                  mode === id ? "border-ink bg-ink font-semibold text-paper" : "border-rule-strong text-ink"
                }`}
              >
                {t.newInvoice.modes[id]}
              </button>
            ))}
          </div>
          )}
          {mode === "regular" ? (
            <p className="mt-2 text-sm text-ink-2">{t.newInvoice.ownRegistration(world.workspace.businessName)}</p>
          ) : (
            <p className="mt-2 text-sm">{t.newInvoice.sampleSeller(mode === "composition")}</p>
          )}
        </Ln>

        <Ln>
        <form
          className="mt-6 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field label={t.newInvoice.customer}>
            <select
              className={control}
              value={customerId}
              disabled={Boolean(editing)}
              onChange={(event) => setCustomerId(event.target.value)}
            >
              <option value="">{t.newInvoice.choose}</option>
              {customers.map((customer) => (
                <option key={customer.$id} value={customer.$id}>
                  {customer.name}, {customer.place}
                </option>
              ))}
              <option value="new">{t.newInvoice.addNew}</option>
            </select>
          </Field>

          {customerId === "new" && (
            <div className="rounded-md border border-rule p-3">
              <CustomerFields draft={fresh} onChange={setFresh} />
            </div>
          )}

          {editing && (
            <Field label={t.newInvoice.dueDate} hint={dueOk ? null : t.newInvoice.blockers.dueDate}>
              <input
                className={control}
                type="date"
                min={editing.issueDate}
                max={addDays(editing.issueDate, 365)}
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </Field>
          )}

          <div className="grid gap-3">
            {lines.map((line, index) => (
              <fieldset key={line.key} className="grid gap-2 border-t border-rule pt-3">
                <legend className="text-sm font-medium">{t.newInvoice.line(index + 1)}</legend>
                <Field label={t.newInvoice.description} hint={lineHint(line, "description")}>
                  <input className={control} value={line.description} onChange={(event) => edit(line.key, { description: event.target.value })} />
                </Field>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label={t.newInvoice.hsn} hint={lineHint(line, "hsn")}>
                    <input className={control} inputMode="numeric" value={line.hsn} onChange={(event) => edit(line.key, { hsn: event.target.value })} />
                  </Field>
                  <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
                    <Field label={t.newInvoice.quantity} hint={lineHint(line, "qty")}>
                      <input className={control} inputMode="decimal" value={line.qty} onChange={(event) => edit(line.key, { qty: event.target.value })} />
                    </Field>
                    <Field label={t.newInvoice.unit}>
                      <select
                        className={control}
                        value={line.unit}
                        onChange={(event) => {
                          const unit = event.target.value;
                          if (isLineUnit(unit)) edit(line.key, { unit });
                        }}
                      >
                        {LINE_UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field label={t.newInvoice.rate} hint={lineHint(line, "rate")}>
                    <input className={control} inputMode="decimal" value={line.rate} onChange={(event) => edit(line.key, { rate: event.target.value })} />
                  </Field>
                  <Field label={t.newInvoice.discount} hint={lineHint(line, "discount")}>
                    <input
                      className={control}
                      inputMode="numeric"
                      value={line.discount}
                      onChange={(event) => edit(line.key, { discount: event.target.value })}
                    />
                  </Field>
                </div>
                <Field label={t.newInvoice.gstRate}>
                  <select
                    className={control}
                    value={line.gst}
                    onChange={(event) => {
                      const gst = Number(event.target.value);
                      if (isGstRate(gst)) edit(line.key, { gst });
                    }}
                  >
                    {GST_RATES.map((rate) => (
                      <option key={rate} value={rate}>
                        {rate}%
                      </option>
                    ))}
                  </select>
                </Field>
                {lines.length > 1 && (
                  <button
                    type="button"
                    className="btn bare justify-self-start"
                    onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                  >
                    {t.newInvoice.removeLine}
                  </button>
                )}
              </fieldset>
            ))}
            <button type="button" className="btn secondary justify-self-start" onClick={() => setLines((current) => [...current, blankLine()])}>
              {t.newInvoice.addLine}
            </button>
          </div>

          {partial && <p className="text-sm">{t.newInvoice.finishLines}</p>}
          {blockers.length > 0 && (
            <div className="text-sm">
              <p>{t.newInvoice.toSave}</p>
              <ul className="mt-1 list-disc pl-5">
                {blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-sindoor">
              {error}
            </p>
          )}
        </form>
        </Ln>
      </Paper>

      <div className="min-w-0">
        {priced?.sampleCustomer && (
          <p className="mb-3 text-sm">
            {mode === "composition" ? t.newInvoice.compositionSample : t.newInvoice.sample}
          </p>
        )}
        {priced ? (
          <TaxInvoice
            workspace={priced.workspace}
            customer={priced.customer}
            lines={priced.lines}
            priced={priced.totals}
            number={editing?.number ?? null}
            issueDate={editing?.issueDate ?? world.workspace.today}
            dueDate={editing ? dueDate || editing.dueDate : addDays(world.workspace.today, creditDays)}
          />
        ) : (
          <Paper label={t.newInvoice.printPreview}>
            <Ln>
              <h2 className="text-lg">{t.newInvoice.printPreview}</h2>
              <p className="mt-2 text-ink-2">{t.newInvoice.previewEmpty}</p>
            </Ln>
          </Paper>
        )}
      </div>
    </div>
  );
}

