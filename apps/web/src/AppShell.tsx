import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { Bell, ChevronLeft, ChevronRight, Moon, RotateCcw, Sun } from "lucide-react";
import { formatDate } from "@tagada/money";
import { useLang, useTheme, type Lang } from "./lib/prefs.ts";
import { useInbox, useWorldState } from "./lib/world.tsx";
import { Badge } from "./ui.tsx";

const WORDS = {
  en: {
    demoDate: "Demo date",
    reset: "Reset demo",
    inbox: (n: number) => (n === 0 ? "Inbox, nothing new" : `Inbox, ${n} new`),
    confirmReset: "Reset the demo? Anything you changed is deleted and the starting story comes back.",
  },
  hi: {
    demoDate: "डेमो तारीख",
    reset: "डेमो फिर से",
    inbox: (n: number) => (n === 0 ? "इनबॉक्स, कुछ नया नहीं" : `इनबॉक्स, ${n} नए`),
    confirmReset: "डेमो फिर से शुरू करें? आपके बदलाव हट जाएंगे और शुरुआती कहानी लौट आएगी।",
  },
} satisfies Record<Lang, unknown>;

const TABS = [
  { to: "/app", en: "Today", hi: "आज" },
  { to: "/app/invoices", en: "Invoices", hi: "बिल" },
  { to: "/app/customers", en: "Customers", hi: "ग्राहक" },
  { to: "/app/bank", en: "Bank", hi: "बैंक" },
  { to: "/app/inbox", en: "Inbox", hi: "इनबॉक्स" },
  { to: "/app/automation", en: "Automation", hi: "ऑटोमेशन" },
  { to: "/app/settings", en: "Settings", hi: "सेटिंग्स" },
];

/** The cloth cover band with index tabs over the Owner's ledger pages. */
export function AppShell() {
  const state = useWorldState();
  const { theme, toggle } = useTheme();
  const { lang, choose } = useLang();
  const [resetting, setResetting] = useState(false);
  const t = WORDS[lang];
  const inbox = useInbox();
  const unread = Array.isArray(inbox) ? inbox.filter((row) => !row.read).length : 0;
  const workspace = state.status === "ready" ? state.world.workspace : null;

  const reset = async () => {
    if (!window.confirm(t.confirmReset)) return;
    setResetting(true);
    await state.reset();
    setResetting(false);
  };

  return (
    <div className="min-h-dvh">
      <header className="cover no-print bg-cover text-on-cover">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3 sm:px-7">
          <Link to="/app" className="flex min-h-11 items-center gap-2 no-underline">
            <span lang="hi" className="text-2xl leading-none font-bold">
              तगादा
            </span>
            <span className="text-[13px] font-medium text-on-cover-2">Tagada</span>
          </Link>
          {workspace && (
            <span className="hidden border-l border-cover-line pl-4 text-[13.5px] text-on-cover-2 md:inline">
              {workspace.businessName}
            </span>
          )}
          <span className="flex-1" />
          {workspace && (
            <div className="flex items-center" title="Every screen uses this date, not the clock">
              <button
                type="button"
                disabled
                aria-label="Previous day (comes with the daily run)"
                className="grid size-11 place-items-center rounded-md text-on-cover-2 disabled:opacity-50"
              >
                <ChevronLeft size={18} aria-hidden />
              </button>
              <span className="rounded border-[1.5px] border-on-cover-2 px-2.5 py-0.5 text-center leading-tight">
                <small className="block text-xs text-on-cover-2">{t.demoDate}</small>
                <span className="text-sm font-semibold">{formatDate(workspace.today)}</span>
              </span>
              <button
                type="button"
                disabled
                aria-label="Next day (comes with the daily run)"
                className="grid size-11 place-items-center rounded-md text-on-cover-2 disabled:opacity-50"
              >
                <ChevronRight size={18} aria-hidden />
              </button>
            </div>
          )}
          <div role="group" aria-label="Language" className="flex overflow-hidden rounded-md border border-cover-line">
            {(["en", "hi"] as const).map((l) => (
              <button
                key={l}
                type="button"
                lang={l}
                aria-pressed={lang === l}
                onClick={() => choose(l)}
                className={`min-h-11 px-3 text-[13px] ${lang === l ? "bg-on-cover text-cover" : "text-on-cover-2"}`}
              >
                {l === "en" ? "EN" : "हिं"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="grid size-11 place-items-center rounded-md border border-cover-line text-on-cover"
          >
            {theme === "dark" ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}
          </button>
          <Link
            to="/app/inbox"
            aria-label={t.inbox(unread)}
            className="relative grid size-11 place-items-center rounded-md border border-cover-line text-on-cover"
          >
            <Bell size={17} aria-hidden />
            {unread > 0 && (
              <span
                aria-hidden
                className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-on-cover px-1 text-xs font-semibold text-cover"
              >
                {unread}
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={reset}
            disabled={state.status !== "ready" || resetting}
            className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-md border border-cover-line px-3 text-[13px] text-on-cover disabled:opacity-60"
          >
            <RotateCcw size={16} aria-hidden />
            <span className="max-sm:sr-only">{t.reset}</span>
          </button>
        </div>
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-[1240px] gap-1 overflow-x-auto px-4 pt-3 [scrollbar-width:none] sm:px-7"
        >
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === "/app"}
              className={({ isActive }) =>
                `flex min-h-11 items-center rounded-t-md px-4 text-sm whitespace-nowrap no-underline ${
                  isActive ? "bg-desk font-semibold text-ink" : "text-on-cover-2 hover:text-on-cover"
                }`
              }
            >
              <span lang={lang}>{tab[lang]}</span>
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-[1240px] px-3 pt-5 pb-16 sm:px-7 sm:pt-7">
        <WorldGate>
          <Outlet />
        </WorldGate>
        <p className="no-print mt-8 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
          <Badge kind="real">Real</Badge> GST and interest maths, and your own private copy of the books.
          <Badge kind="sim">Simulated</Badge> The bank feed, the UPI ID and the history before today.
        </p>
      </main>
    </div>
  );
}

/** Shows the page once the Demo world is open, and says so while it opens. */
export function WorldGate({ children }: { children: React.ReactNode }) {
  const state = useWorldState();
  if (state.status === "ready") return <>{children}</>;
  return (
    <div className="leaf shadow-[var(--sheet-shadow)]" role="status" aria-live="polite">
      <div className="ln wide">
        <div className="m" />
        <div className="p">
          {state.status === "loading" ? (
            <p className="text-ink-2">Opening your books…</p>
          ) : (
            <>
              <p>{state.message}</p>
              <button type="button" className="btn secondary mt-3" onClick={state.retry}>
                Try again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
