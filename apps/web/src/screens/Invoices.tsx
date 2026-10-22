import { Link, useSearchParams } from "react-router";
import { formatDate, formatInr, sumPaise } from "@tagada/money";
import { INVOICE_FILTERS, isInvoiceFilter, matchesFilter, type InvoiceFilter } from "@tagada/domain";
import { useWorld, viewOf, type InvoiceView } from "../lib/world.tsx";
import { Head, Ln, Paper, StatusWord } from "../ui.tsx";

const LABELS: Record<InvoiceFilter, string> = {
  all: "All",
  overdue: "Overdue",
  promised: "Promised",
  disputed: "Disputed",
  paid: "Paid",
};

/** Open Invoices first, the earliest due first (so the most overdue); then paid ones, newest first. */
function byUrgency(a: InvoiceView, b: InvoiceView): number {
  const paidA = a.standing.state === "paid";
  const paidB = b.standing.state === "paid";
  if (paidA !== paidB) return paidA ? 1 : -1;
  if (paidA) return b.invoice.issueDate.localeCompare(a.invoice.issueDate);
  return a.invoice.dueDate.localeCompare(b.invoice.dueDate);
}

export function Invoices() {
  const world = useWorld();
  const [params, setParams] = useSearchParams();
  const asked = params.get("filter") ?? "all";
  const filter: InvoiceFilter = isInvoiceFilter(asked) ? asked : "all";

  const views = world.invoices.map((invoice) => viewOf(world, invoice)).sort(byUrgency);
  const shown = views.filter((v) => matchesFilter(v.standing, filter));
  const paidOnly = filter === "paid";
  const total = sumPaise(shown.map((v) => (paidOnly ? v.invoice.totalPaise : v.standing.balancePaise)));

  return (
    <Paper label="Invoices">
      <Ln>
        <h1 className="text-[28px] leading-tight">Invoices</h1>
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
                aria-pressed={filter === f}
                onClick={() => setParams(f === "all" ? {} : { filter: f }, { replace: true })}
                className={`min-h-11 rounded-md border px-3 text-sm ${
                  filter === f ? "border-ink bg-ink font-semibold text-paper" : "border-rule-strong text-ink"
                }`}
              >
                {LABELS[f]} <span className={filter === f ? "" : "text-ink-2"}>{count}</span>
              </button>
            );
          })}
        </div>
      </Ln>

      <div className="sect mt-6">
        <Head title={filter === "all" ? "Every Invoice" : LABELS[filter]} m="due" a="owed" />
        {shown.length === 0 ? (
          <div className="entries">
            <Ln>
              <p className="text-ink-2">
                No {LABELS[filter].toLowerCase()} Invoices on {formatDate(world.workspace.today)}.
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
