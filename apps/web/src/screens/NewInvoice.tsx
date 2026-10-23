import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { CustomerRow, InvoiceLineRow } from "@tagada/appwrite";
import {
  GST_RATES,
  addDays,
  formatAmountInput,
  indianStates,
  isGstRate,
  parseAmountPaise,
  stateName,
  type GstRate,
} from "@tagada/money";
import { SaveError, createInvoice } from "../lib/appwrite.ts";
import { LANGUAGES, type LanguageId } from "../lib/languages.ts";
import { gstinMessage, priceDraft, type DraftLine, type PreviewAs } from "../lib/preview-as.ts";
import { useInvoiceRows, useWorld, useWorldState } from "../lib/world.tsx";
import { Ln, Paper } from "../ui.tsx";
import { TaxInvoice } from "./TaxInvoice.tsx";

const MODES: { id: PreviewAs; label: string }[] = [
  { id: "regular", label: "Regular" },
  { id: "composition", label: "Composition seller" },
  { id: "unregistered", label: "Unregistered" },
];

const SAVE_ERRORS: Record<string, string> = {
  invalid_gstin: "That GSTIN check digit does not match.",
  invalid_line: "Check the lines. Each needs a description, an HSN of 4 to 8 digits, a quantity, a rate and a listed GST rate.",
  invalid_customer: "Check the new Customer's name, state and credit days.",
  invalid_body: "The Invoice could not be read. Try again.",
  unknown_customer: "That Customer is not in this Demo world.",
  composition_interstate: "A composition seller cannot bill a Customer in another state.",
  world_not_ready: "Your books are still opening. Try again in a moment.",
  number_taken: "Other Invoices were saved at the same moment. Save again for the next number.",
  unauthorized: "The session expired. Reload the page.",
};

type Fresh = {
  name: string;
  gstin: string;
  stateCode: string;
  creditDays: string;
  lang: LanguageId;
  address: string;
};

type LineDraft = {
  key: string;
  description: string;
  hsn: string;
  qty: string;
  rate: string;
  discount: string;
  gst: GstRate;
};

const control = "min-h-11 w-full rounded-md border border-rule-strong bg-paper px-3 text-ink";

function blankLine(): LineDraft {
  return { key: crypto.randomUUID(), description: "", hsn: "", qty: "1", rate: "", discount: "0", gst: 5 };
}

function fromStored(line: InvoiceLineRow): LineDraft {
  const rate = line.gstRateBp / 100;
  return {
    key: line.$id,
    description: line.description,
    hsn: line.hsn ?? "",
    qty: String(line.qtyMilli / 1000),
    rate: formatAmountInput(line.ratePaise),
    discount: String(line.discountBp / 100),
    gst: isGstRate(rate) ? rate : 5,
  };
}

function parseLine(line: LineDraft): DraftLine | null {
  const quantity = Number(line.qty);
  const ratePaise = line.rate.trim() ? parseAmountPaise(line.rate) : null;
  const discount = line.discount.trim() === "" ? 0 : Number(line.discount);
  if (!line.description.trim() || !/^\d{4,8}$/.test(line.hsn.trim())) return null;
  if (!Number.isInteger(quantity) || quantity < 1) return null;
  if (ratePaise === null) return null;
  if (!Number.isInteger(discount) || discount < 0 || discount > 100) return null;
  return {
    description: line.description.trim(),
    hsn: line.hsn.trim(),
    quantity,
    ratePaise,
    discountPercent: discount,
    gstRatePercent: line.gst,
  };
}

function touched(line: LineDraft): boolean {
  return Boolean(line.description.trim() || line.hsn.trim() || line.rate.trim());
}

function freshCustomer(fresh: Fresh, workspaceId: string): CustomerRow | null {
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
    phone: null,
    email: null,
    buyerType: "goods",
    creditDays: Number.isInteger(credit) && credit >= 0 && credit <= 365 ? credit : 30,
    avgDelayDays: null,
    grade: null,
    gradeReason: null,
    consentCalls: false,
    consentAt: null,
    lang: fresh.lang,
    gender: null,
  };
}

function newCustomerReady(fresh: Fresh): boolean {
  const credit = Number(fresh.creditDays);
  const gstin = fresh.gstin.trim();
  return (
    fresh.name.trim().length > 0 &&
    gstinMessage(gstin) === null &&
    gstin.length > 0 &&
    stateName(fresh.stateCode) !== null &&
    fresh.stateCode === gstin.toUpperCase().slice(0, 2) &&
    Number.isInteger(credit) &&
    credit >= 0 &&
    credit <= 365
  );
}

export function NewInvoice() {
  const world = useWorld();
  const { reload } = useWorldState();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fromId = params.get("from") ?? undefined;
  const source = fromId ? world.invoices.find((invoice) => invoice.$id === fromId) : undefined;
  const sourceLines = useInvoiceRows<InvoiceLineRow>("invoice_lines", source?.$id);
  const applied = useRef(false);

  const [mode, setMode] = useState<PreviewAs>("regular");
  const [customerId, setCustomerId] = useState("");
  const [fresh, setFresh] = useState<Fresh>({
    name: "",
    gstin: "",
    stateCode: "",
    creditDays: "30",
    lang: "en",
    address: "",
  });
  const [lines, setLines] = useState<LineDraft[]>([blankLine()]);
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
  const canSave =
    priced?.saves === true &&
    !saving &&
    !partial &&
    ready.length > 0 &&
    (customerId !== "new" ? Boolean(world.customers.get(customerId)) : newCustomerReady(fresh));
  const gstinProblem = customerId === "new" && fresh.gstin.trim() ? gstinMessage(fresh.gstin) : null;

  const edit = (key: string, patch: Partial<LineDraft>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const body =
      customerId === "new"
        ? {
            customer: {
              name: fresh.name.trim(),
              gstin: fresh.gstin.trim().toUpperCase(),
              stateCode: fresh.stateCode,
              creditDays: Number(fresh.creditDays),
              lang: fresh.lang,
              address: fresh.address.trim() || undefined,
            },
            lines: ready,
          }
        : { customerId, lines: ready };
    try {
      const { invoiceId } = await createInvoice(body);
      await reload();
      navigate(`/app/invoices/${invoiceId}`);
    } catch (e) {
      const code = e instanceof SaveError ? e.code : "save_failed";
      setError(SAVE_ERRORS[code] ?? "The Invoice could not be saved. Try again.");
      setSaving(false);
    }
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Paper label="New invoice">
        <Ln>
          <p className="text-[13px] text-ink-2">
            <Link to="/app/invoices">Invoices</Link>
            {source ? ` / ${source.number}` : ""} / new
          </p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-[28px] leading-tight">New invoice</h1>
            <button type="button" className="btn primary" disabled={!canSave} onClick={save}>
              {saving ? "Saving…" : priced?.saves === false ? "Preview only" : "Save invoice"}
            </button>
          </div>
          <p className="mt-2 max-w-[60ch]">
            Totals update as you type. On save, the server works them out again and gives the Invoice the next number.
          </p>
          <div role="group" aria-label="Preview as" className="mt-4 flex flex-wrap gap-2">
            {MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={mode === item.id}
                onClick={() => setMode(item.id)}
                className={`min-h-11 rounded-md border px-3 text-sm ${
                  mode === item.id ? "border-ink bg-ink font-semibold text-paper" : "border-rule-strong text-ink"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {mode === "regular" ? (
            <p className="mt-2 text-sm text-ink-2">{world.workspace.businessName}, on its own registration.</p>
          ) : (
            <p className="mt-2 text-sm">
              A sample seller in Agartala
              {mode === "composition" ? ", who charges no GST" : ", with no GSTIN"}. This preview is not saved.
            </p>
          )}
        </Ln>

        <form
          className="mt-6 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field label="Customer">
            <select className={control} value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
              <option value="">Choose a Customer</option>
              {customers.map((customer) => (
                <option key={customer.$id} value={customer.$id}>
                  {customer.name}, {customer.place}
                </option>
              ))}
              <option value="new">Add a new Customer</option>
            </select>
          </Field>

          {customerId === "new" && (
            <div className="grid gap-3 rounded-md border border-rule p-3">
              <Field label="Name">
                <input className={control} value={fresh.name} onChange={(event) => setFresh({ ...fresh, name: event.target.value })} />
              </Field>
              <Field label="GSTIN" hint={gstinProblem}>
                <input
                  className={control}
                  value={fresh.gstin}
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-invalid={gstinProblem ? true : undefined}
                  onChange={(event) => {
                    const gstin = event.target.value.toUpperCase();
                    const valid = gstin.trim().length > 0 && gstinMessage(gstin) === null;
                    setFresh((current) => ({
                      ...current,
                      gstin,
                      stateCode: valid ? gstin.trim().slice(0, 2) : current.stateCode,
                    }));
                  }}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="State">
                  <select
                    className={control}
                    value={fresh.stateCode}
                    onChange={(event) => setFresh({ ...fresh, stateCode: event.target.value })}
                  >
                    <option value="">Choose a state</option>
                    {indianStates().map((state) => (
                      <option key={state.code} value={state.code}>
                        {state.code} {state.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Credit days">
                  <input
                    className={control}
                    inputMode="numeric"
                    value={fresh.creditDays}
                    onChange={(event) => setFresh({ ...fresh, creditDays: event.target.value })}
                  />
                </Field>
              </div>
              <Field label="Preferred language">
                <select
                  className={control}
                  value={fresh.lang}
                  onChange={(event) => setFresh({ ...fresh, lang: event.target.value as LanguageId })}
                >
                  {LANGUAGES.map((language) => (
                    <option key={language.id} value={language.id} lang={language.id}>
                      {language.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Address">
                <input
                  className={control}
                  value={fresh.address}
                  onChange={(event) => setFresh({ ...fresh, address: event.target.value })}
                />
              </Field>
            </div>
          )}

          <div className="grid gap-3">
            {lines.map((line, index) => (
              <fieldset key={line.key} className="grid gap-2 border-t border-rule pt-3">
                <legend className="text-sm font-medium">Line {index + 1}</legend>
                <Field label="Description">
                  <input className={control} value={line.description} onChange={(event) => edit(line.key, { description: event.target.value })} />
                </Field>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="HSN or SAC">
                    <input className={control} inputMode="numeric" value={line.hsn} onChange={(event) => edit(line.key, { hsn: event.target.value })} />
                  </Field>
                  <Field label="Quantity">
                    <input className={control} inputMode="numeric" value={line.qty} onChange={(event) => edit(line.key, { qty: event.target.value })} />
                  </Field>
                  <Field label="Rate (₹)">
                    <input className={control} inputMode="decimal" value={line.rate} onChange={(event) => edit(line.key, { rate: event.target.value })} />
                  </Field>
                  <Field label="Discount %">
                    <input
                      className={control}
                      inputMode="numeric"
                      value={line.discount}
                      onChange={(event) => edit(line.key, { discount: event.target.value })}
                    />
                  </Field>
                </div>
                <Field label="GST rate">
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
                    Remove line
                  </button>
                )}
              </fieldset>
            ))}
            <button type="button" className="btn secondary justify-self-start" onClick={() => setLines((current) => [...current, blankLine()])}>
              Add a line
            </button>
          </div>

          {partial && <p className="text-sm">Finish every line you started, or clear it.</p>}
          {error && (
            <p role="alert" className="text-sm text-sindoor">
              {error}
            </p>
          )}
        </form>
      </Paper>

      <div className="min-w-0">
        {priced?.sampleCustomer && (
          <p className="mb-3 text-sm">
            {mode === "composition"
              ? "A composition seller sells only inside their own state, so this preview bills a sample Customer in Agartala."
              : "This preview bills a sample Customer in Agartala."}
          </p>
        )}
        {priced ? (
          <TaxInvoice
            workspace={priced.workspace}
            customer={priced.customer}
            lines={priced.lines}
            priced={priced.totals}
            number={null}
            issueDate={world.workspace.today}
            dueDate={addDays(world.workspace.today, creditDays)}
          />
        ) : (
          <Paper label="Print preview">
            <Ln>
              <h2 className="text-lg">Print preview</h2>
              <p className="mt-2 text-ink-2">Choose a Customer and add a line. The Invoice appears here as you type.</p>
            </Ln>
          </Paper>
        )}
      </div>
    </div>
  );
}

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
