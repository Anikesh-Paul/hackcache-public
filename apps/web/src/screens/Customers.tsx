import { useState } from "react";
import { Link } from "react-router";
import { GRADE_WHY } from "@tagada/domain";
import { formatInr } from "@tagada/money";
import { amountOwed, daysLatePhrase, gradeFor, gradeSentence } from "../lib/customer-grade.ts";
import { usePaymentHistory, useWorld } from "../lib/world.tsx";
import { Head, Ln, Paper } from "../ui.tsx";

/** /app/customers: who owes what, and how they usually pay. */
export function Customers() {
  const world = useWorld();
  const events = usePaymentHistory();
  const [why, setWhy] = useState(false);
  const today = world.workspace.today;
  const customers = [...world.customers.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Paper label="Customers">
      <Ln>
        <h1 className="text-[28px] leading-tight">Customers</h1>
        <p className="mt-1 text-sm text-ink-2">
          {customers.length} Customers. A grade is how they have paid, with the reason.{" "}
          <button type="button" className="linkbtn" aria-expanded={why} onClick={() => setWhy((open) => !open)}>
            Why?
          </button>
        </p>
        {why && <p className="mt-2 max-w-[68ch] text-sm">{GRADE_WHY}</p>}
      </Ln>

      <div className="sect mt-6">
        <Head title="Every Customer" m="place" a="owed" />
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
                    {events === "loading" && "Reading payment history…"}
                    {events === "failed" && "Grade unavailable"}
                    {grade && gradeSentence(grade)}
                    <span className="mt-0.5 block">
                      {customer.creditDays ?? 0} days' credit.
                      {grade?.avgDelayDays != null && ` ${daysLatePhrase(grade.avgDelayDays)}.`}
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
