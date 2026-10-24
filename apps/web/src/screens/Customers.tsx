import { useState } from "react";
import { Link } from "react-router";
import { UserPlus } from "lucide-react";
import { formatInr } from "@tagada/money";
import { amountOwed, gradeFor } from "../lib/customer-grade.ts";
import { useT } from "../i18n/index.ts";
import { usePaymentHistory, useWorld } from "../lib/world.tsx";
import { Head, Ln, Paper } from "../ui.tsx";

/** /app/customers: who owes what, and how they usually pay. */
export function Customers() {
  const world = useWorld();
  const events = usePaymentHistory();
  const [why, setWhy] = useState(false);
  const t = useT();
  const today = world.workspace.today;
  const customers = [...world.customers.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Paper label={t.customers.title}>
      <Ln>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-[28px] leading-tight">{t.customers.title}</h1>
          <Link to="/app/customers/new" className="btn primary">
            <UserPlus aria-hidden /> {t.customerForm.add}
          </Link>
        </div>
        <p className="mt-1 text-sm text-ink-2">
          {t.customers.intro(customers.length)}{" "}
          <button type="button" className="linkbtn" aria-expanded={why} onClick={() => setWhy((open) => !open)}>
            {t.common.why}
          </button>
        </p>
        {why && <p className="mt-2 max-w-[68ch] text-sm">{t.customers.gradeWhy}</p>}
      </Ln>

      <div className="sect mt-6">
        <Head title={t.customers.every} m={t.customers.place} a={t.customers.owed} />
        <ul className="entries">
          {customers.map((customer) => {
            const invoices = world.invoices.filter((invoice) => invoice.customerId === customer.$id);
            const owed = amountOwed(invoices, world.promisesByInvoice, today);
            const grade =
              events === "failed" || events === "loading"
                ? null
                : gradeFor(today, invoices, events, world.promisesByInvoice);
            return (
              <li key={customer.$id} className="ln ruler relative">
                <div className="m">{customer.place}</div>
                <div className="p">
                  <Link
                    to={`/app/customers/${customer.$id}`}
                    className="font-medium no-underline after:absolute after:inset-0"
                  >
                    {customer.name}
                  </Link>
                  <small>
                    {events === "loading" && t.customers.reading}
                    {events === "failed" && t.customers.unavailable}
                    {grade && t.customers.grade(grade.grade, grade.facts)}
                    <span className="mt-0.5 block">
                      {t.customers.credit(customer.creditDays ?? 0)}
                      {grade?.avgDelayDays != null && ` ${t.customers.delay(grade.avgDelayDays)}.`}
                    </span>
                  </small>
                </div>
                <div className="a">{formatInr(owed)}</div>
              </li>
            );
          })}
        </ul>
      </div>
    </Paper>
  );
}
