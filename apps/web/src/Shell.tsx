import { Link, Outlet, useLocation } from "react-router";

/** App shell placeholder: the cloth cover band over one ledger page. */
export function Shell() {
  return (
    <div className="min-h-dvh">
      <header className="bg-cover text-cover-ink">
        <div className="mx-auto flex max-w-5xl items-baseline gap-3 px-4 py-4">
          <Link
            to="/"
            className="rounded text-2xl font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cover-ink"
          >
            तगादा
          </Link>
          <span className="text-sm opacity-80">Tagada, bina jhagda</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

export function Placeholder({ name, notFound = false }: { name: string; notFound?: boolean }) {
  const { pathname } = useLocation();
  return (
    <section className="border-x-4 border-double border-rule-strong bg-paper px-5 py-6 shadow-sm">
      <h1 className="border-b border-ink pb-2 text-xl font-semibold">{name}</h1>
      <p className="mt-4 text-ink-2">
        {notFound
          ? "There is no page at this address."
          : "This page is being built. The app shell is live and this address works on refresh."}
      </p>
      <p className="mt-2 font-mono text-sm text-ink-2">{pathname}</p>
    </section>
  );
}
