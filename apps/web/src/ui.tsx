import type { ReactNode } from "react";
import { Check, Clock, Flag, Handshake, CircleDot } from "lucide-react";
import type { InvoiceStanding } from "@tagada/domain";
import { useT } from "./i18n/index.ts";

/** A ledger line: margin | particulars | amount. Without `a`, particulars run the full width. */
export function Ln({
  m,
  a,
  className = "",
  children,
}: {
  m?: ReactNode;
  a?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`ln ${a === undefined ? "wide" : ""} ${className}`}>
      <div className="m">{m}</div>
      <div className="p">{children}</div>
      {a !== undefined && <div className="a">{a}</div>}
    </div>
  );
}

/** A section head on a full-width ink rule. */
export function Head({ title, m, a }: { title: ReactNode; m?: ReactNode; a?: ReactNode }) {
  return (
    <div className={`ln head ${a === undefined ? "wide" : ""}`}>
      <div className="m">{m}</div>
      <div className="p">
        <h2>{title}</h2>
      </div>
      {a !== undefined && <div className="a">{a}</div>}
    </div>
  );
}

/** Says what is real and what is simulated, so a judge can trust the screen. */
export function Badge({ kind, children }: { kind: "real" | "sim"; children: ReactNode }) {
  return <span className={`badge ${kind}`}>{children}</span>;
}

/** Status as an icon and a word, never colour alone. */
export function StatusWord({ standing, dueDate }: { standing: InvoiceStanding; dueDate: string }) {
  const t = useT();
  switch (standing.state) {
    case "paid":
      return (
        <span className="word ok">
          <Check aria-hidden /> {t.status.paid}
        </span>
      );
    case "disputed":
      return (
        <span className="word short">
          <Flag aria-hidden /> {t.status.disputed}
        </span>
      );
    case "promised":
      return (
        <span className="word ok">
          <Handshake aria-hidden /> {t.status.promised}
        </span>
      );
    case "overdue":
      return (
        <span className="word warn">
          <Clock aria-hidden /> {t.common.daysLate(standing.daysLate)}
        </span>
      );
    case "open":
      return (
        <span className="word plain">
          <CircleDot aria-hidden /> {standing.daysToDue === 0 ? t.status.dueToday : t.status.dueOn(t.date(dueDate))}
        </span>
      );
  }
}

export function Paper({
  children,
  className = "",
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <section aria-label={label} className={`leaf shadow-[var(--sheet-shadow)] ${className}`}>
      {children}
    </section>
  );
}
