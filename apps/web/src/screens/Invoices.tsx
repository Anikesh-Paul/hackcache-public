import { Link, useSearchParams } from "react-router";
import { formatDate, formatInr, sumPaise } from "@tagada/money";
import {
  AGEING_BUCKETS,
  INVOICE_FILTERS,
  ageingBucket,
  isInvoiceFilter,
  matchesFilter,
  type InvoiceFilter,
} from "@tagada/domain";
import { compareInvoiceList } from "../lib/invoice-list.ts";
import { useWorld, viewOf } from "../lib/world.tsx";
import { Head, Ln, Paper, StatusWord } from "../ui.tsx";

const LABELS: Record<InvoiceFilter, string> = {
  all: "All",
  overdue: "Overdue",
  promised: "Promised",
  disputed: "Disputed",
  paid: "Paid",
};

export function Invoices() {
  const world = useWorld();
  const [params, setParams] = useSearchParams();
  const asked = params.get("filter") ?? "all";
  const filter: InvoiceFilter = isInvoiceFilter(asked) ? asked : "all";
  // From Today's Ageing bar: the unpaid Invoices this many days past due.
  const age = AGEING_BUCKETS.find((b) => b.key === params.get("age"));

  const views = world.invoices.map((invoice) => viewOf(world, invoice)).sort(compareInvoiceList);
  const shown = age
    ? views.filter((v) => v.standing.state !== "paid" && ageingBucket(v.standing.daysLate) === age.key)
    : views.filter((v) => matchesFilter(v.standing, filter));
  const paidOnly = !age && filter === "paid";
  const total = sumPaise(shown.map((v) => (paidOnly ? v.invoice.totalPaise : v.standing.balancePaise)));

  return (
    <Paper label="Invoices">
      <Ln>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-[28px] leading-tight">Invoices</h1>
          <Link to="/app/invoices/new" className="btn primary">
            New invoice
          </Link>
        </div>
        <p className="mt-1 text-sm text-ink-2">
          {world.invoices.length} Invoices this financial year. Amounts are what is still owed.
        </p>
        <div role="group" aria-label="Show" className="mt-4 flex flex-wrap gap-2">
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
                {LABELS[f]} <span className={!age && filter === f ? "" : "text-ink-2"}>{count}</span>
              </button>
            );
          })}
        </div>
      </Ln>

      <div className="sect mt-6">
        <Head
          title={age ? `${age.label} days past due` : filter === "all" ? "Every Invoice" : LABELS[filter]}
          m="due"
          a="owed"
        />
        {shown.length === 0 ? (
          <div className="entries">
            <Ln>
              <p className="text-ink-2">
                No {age ? "" : `${LABELS[filter].toLowerCase()} `}Invoices on {formatDate(world.workspace.today)}.
              </p>
            </Ln>
          </div>
        ) : (
          <ul className="entries">
            {shown.map(({ invoice, customer, standing }) => (
              <li key={invoice.$id} className="ln ruler relative">
                <div className="m">{formatDate(invoice.dueDate, { weekday: false })}</div>
                <div className="p">
                  <Link
                    to={`/app/invoices/${invoice.$id}`}
                    className="font-medium no-underline after:absolute after:inset-0"
                  >
                    {customer?.name ?? "Unknown Customer"}
                  </Link>
                  <small>
                    <span className="mono">{invoice.number}</span>
                    <span className="ml-2">
                      <StatusWord standing={standing} dueDate={invoice.dueDate} />
                    </span>
                  </small>
                </div>
                <div className="a">
                  {standing.state === "paid" ? (
                    <span className="text-ink-2">
                      {formatInr(invoice.totalPaise)}
                      <small className="block text-xs">paid</small>
                    </span>
                  ) : (
                    formatInr(standing.balancePaise)
                  )}
                </div>
              </li>
            ))}
            <li className="ln tot">
              <div className="m" />
              <div className="p">{paidOnly ? "Paid" : "Still owed"}</div>
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
