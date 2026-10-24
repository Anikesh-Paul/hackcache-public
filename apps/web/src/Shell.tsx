import { Link, Outlet, useLocation } from "react-router";

/** A plain cover band over one ledger page, for pages outside the Owner's books. */
export function Shell() {
  return (
    <div className="min-h-dvh">
      <header className="cover bg-cover text-on-cover">
        <div className="mx-auto flex max-w-5xl items-baseline gap-3 px-4 py-4">
          <Link to="/" className="rounded text-2xl font-semibold no-underline">
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
  return (
    <section className="leaf shadow-[var(--sheet-shadow)]">
      <div className="ln wide">
        <div className="m" />
        <div className="p">
          <h1 className="border-b border-ink pb-2 text-xl font-semibold">{name}</h1>
          <p className="mt-4 text-ink-2">
            {notFound ? "There is no page at this address." : "This page is being built. The address works on refresh."}
          </p>
          <p className="mt-2 font-mono text-sm break-all text-ink-2">{pathname}</p>
        </div>
      </div>
    </section>
  );
}
