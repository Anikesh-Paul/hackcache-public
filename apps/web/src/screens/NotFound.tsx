import { Link } from "react-router";
import { useT } from "../i18n/index.ts";
import { Ln, Paper } from "../ui.tsx";

export function NotFound({ what }: { what: "Invoice" | "Customer" }) {
  const t = useT();
  const name = what === "Invoice" ? t.notFound.invoice : t.notFound.customer;
  return (
    <Paper label={t.notFound.label(name)}>
      <Ln>
        <h1 className="text-xl">{t.notFound.title(name)}</h1>
        <p className="mt-2 text-ink-2">
          {t.notFound.body} <Link to="/app/invoices">{t.notFound.all}</Link>.
        </p>
      </Ln>
    </Paper>
  );
}
