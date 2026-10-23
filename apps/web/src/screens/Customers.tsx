import { useState } from "react";
import { Link } from "react-router";
import type { EventRow } from "@tagada/appwrite";
import { GRADE_WHY, invoiceStanding } from "@tagada/domain";
import { formatInr, sumPaise } from "@tagada/money";
import { gradeFor } from "../lib/customer-grade.ts";
import { useWorkspaceRows, useWorld } from "../lib/world.tsx";
import { Head, Ln, Paper } from "../ui.tsx";

function lead(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function averageWords(days: number | null): string {
  if (days === null) return "";
  if (days === 0) return " Pays on time, on average.";
  if (days < 0) {
    const early = -days;
    return ` Usually ${early} ${early === 1 ? "day" : "days"} early.`;
  }
  return ` Average ${days} ${days === 1 ? "day" : "days"} late.`;
}

/** /app/customers: who owes what, and how they usually pay. */
export function Customers() {
  const world = useWorld();
  const events = useWorkspaceRows<EventRow>("events", true);
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
            const owed = sumPaise(
              invoices.map(
                (invoice) =>
                  invoiceStanding(invoice, world.promisesByInvoice.get(invoice.$id) ?? [], today).balancePaise,
              ),
            );
            const grade =
              events === "failed" || events === null
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
                    {events === null && "Reading payment history…"}
                    {events === "failed" && "Grade unavailable"}
                    {grade && `Grade ${grade.grade}. ${lead(grade.reason)}`}
                    <span className="mt-0.5 block">
                      {customer.creditDays ?? 0} days' credit.{averageWords(grade?.avgDelayDays ?? null)}
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
