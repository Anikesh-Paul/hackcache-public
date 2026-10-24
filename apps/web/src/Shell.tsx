import { Link, Outlet, useLocation } from "react-router";
import { useT } from "./i18n/index.ts";

/** A plain cover band over one ledger page, for pages outside the Owner's books. */
export function Shell() {
  return (
    <div className="min-h-dvh">
      <header className="cover bg-cover text-on-cover">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2">
          <Link to="/" aria-label="Tagada" className="flex min-h-11 items-center rounded text-2xl font-semibold no-underline">
            <span lang="hi">तगादा</span>
          </Link>
          <span className="text-sm text-on-cover-2">Tagada, bina jhagda</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-3 py-6 sm:px-4">
        <Outlet />
      </main>
    </div>
  );
}

export function Placeholder({ name, notFound = false }: { name: string; notFound?: boolean }) {
  const { pathname } = useLocation();
  const t = useT();
  return (
    <section className="leaf shadow-[var(--sheet-shadow)]">
      <div className="ln wide">
        <div className="m" />
        <div className="p">
          <h1 className="border-b border-ink pb-2 text-xl font-semibold">{notFound ? t.notFound.page : name}</h1>
          <p className="mt-4 text-ink-2">
            {notFound ? t.notFound.noPage : "This page is being built. The address works on refresh."}
          </p>
          {notFound && (
            <p className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
              <Link to="/app">{t.shell.tabs.today}</Link>
              <Link to="/">{t.notFound.landing}</Link>
            </p>
          )}
          <p className="mt-2 font-mono text-sm break-all text-ink-2">{pathname}</p>
        </div>
      </div>
    </section>
  );
}
