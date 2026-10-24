import { Link, useSearchParams } from "react-router";
import { formatInr, sumPaise } from "@tagada/money";
import {
  AGEING_BUCKETS,
  INVOICE_FILTERS,
  ageingBucket,
  isInvoiceFilter,
  matchesFilter,
  type InvoiceFilter,
} from "@tagada/domain";
import { useT } from "../i18n/index.ts";
import { compareInvoiceList } from "../lib/invoice-list.ts";
import { useWorld, viewOf } from "../lib/world.tsx";
import { Head, Ln, Paper, StatusWord } from "../ui.tsx";

export function Invoices() {
  const world = useWorld();
  const t = useT();
  const labels = t.invoices.filters;
  const [params, setParams] = useSearchParams();
  const asked = params.get("filter") ?? "all";
  const filter: InvoiceFilter = isInvoiceFilter(asked) ? asked : "all";
  // From Today's Ageing bar: the unpaid Invoices this many days past due.
  const age = AGEING_BUCKETS.find((b) => b.key === params.get("age"));

  const views = world.invoices.map((invoice) => viewOf(world, invoice)).sort(compareInvoiceList);
  const shown = age
    ? views.filter((v) => v.standing.balancePaise > 0 && ageingBucket(v.standing.daysLate) === age.key)
    : views.filter((v) => matchesFilter(v.standing, filter));
  const paidOnly = !age && filter === "paid";
  const total = sumPaise(shown.map((v) => (paidOnly ? v.invoice.totalPaise : v.standing.balancePaise)));

  return (
    <Paper label={t.invoices.title}>
      <Ln>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-[28px] leading-tight">{t.invoices.title}</h1>
          <Link to="/app/invoices/new" className="btn primary">
            {t.invoices.newInvoice}
          </Link>
        </div>
        <p className="mt-1 text-sm text-ink-2">
          {t.invoices.count(world.invoices.length)}
        </p>
        <div role="group" aria-label={t.invoices.show} className="mt-4 flex flex-wrap gap-2">
          {INVOICE_FILTERS.map((f) => {
            const count = views.filter((v) => matchesFilter(v.standing, f)).length;
            return (
              <button
                key={f}
                type="button"
                aria-pressed={!age && filter === f}
                onClick={() => setParams(f === "all" ? {} : { filter: f }, { replace: true })}
                className={`min-h-11 rounded-md border px-3 text-sm ${
                  !age && filter === f ? "border-ink bg-ink font-semibold text-paper" : "border-rule-strong text-ink"
                }`}
              >
                {labels[f]} <span className={!age && filter === f ? "" : "text-ink-2"}>{count}</span>
              </button>
            );
          })}
        </div>
      </Ln>

      <div className="sect mt-6">
        <Head
          title={age ? t.invoices.ageTitle(age.label) : filter === "all" ? t.invoices.every : labels[filter]}
          m={t.invoices.due}
          a={t.invoices.owed}
        />
        {shown.length === 0 ? (
          <div className="entries">
            <Ln>
              <p className="text-ink-2">
                {t.invoices.noneOn(age || filter === "all" ? null : labels[filter], t.date(world.workspace.today))}
              </p>
            </Ln>
          </div>
        ) : (
          <ul className="entries">
            {shown.map(({ invoice, customer, standing }) => (
              <li key={invoice.$id} className="ln ruler relative">
                <div className="m">{t.date(invoice.dueDate, { weekday: false })}</div>
                <div className="p">
                  <Link
                    to={`/app/invoices/${invoice.$id}`}
                    className="font-medium no-underline after:absolute after:inset-0"
                  >
                    {customer?.name ?? t.invoices.unknownCustomer}
                  </Link>
                  <small>
                    <span className="mono">{invoice.number}</span>
                    <span className="ml-2">
                      <StatusWord standing={standing} dueDate={invoice.dueDate} />
                    </span>
                  </small>
                </div>
                <div className="a">
                  {standing.state === "paid" || standing.state === "cancelled" ? (
                    <span className={`text-ink-2 ${standing.state === "cancelled" ? "line-through" : ""}`}>
                      {formatInr(invoice.totalPaise)}
                      <small className="block text-xs">{standing.state === "paid" ? t.invoices.paid : t.invoices.cancelled}</small>
                    </span>
                  ) : (
                    formatInr(standing.balancePaise)
                  )}
                </div>
              </li>
            ))}
            <li className="ln tot">
              <div className="m" />
              <div className="p">{paidOnly ? t.invoices.paidTotal : t.invoices.stillOwed}</div>
              <div className="a">
                <span className="dbl">{formatInr(total)}</span>
              </div>
            </li>
          </ul>
        )}
      </div>
    </Paper>
  );
}
