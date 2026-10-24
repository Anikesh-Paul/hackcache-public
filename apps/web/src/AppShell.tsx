import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { Bell, ChevronLeft, ChevronRight, Moon, RotateCcw, Sun } from "lucide-react";
import { addDays } from "@tagada/money";
import { runLadder } from "./lib/appwrite.ts";
import { useLang, useTheme } from "./lib/prefs.ts";
import { useT } from "./i18n/index.ts";
import { useInbox, useWorldState } from "./lib/world.tsx";
import { Badge } from "./ui.tsx";

const TABS = [
  { to: "/app", key: "today" },
  { to: "/app/invoices", key: "invoices" },
  { to: "/app/customers", key: "customers" },
  { to: "/app/bank", key: "bank" },
  { to: "/app/inbox", key: "inbox" },
  { to: "/app/automation", key: "automation" },
  { to: "/app/settings", key: "settings" },
] as const;

/** Keeps the active tab in view, and says when more tabs sit past the right edge. */
function useTabRow(pathname: string, lang: string) {
  const ref = useRef<HTMLElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const mark = () => {
      const overflow = nav.scrollWidth > nav.clientWidth + 1;
      const atEnd = nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 1;
      setMore(overflow && !atEnd);
    };
    const follow = () => {
      const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active) return;
      const navBox = nav.getBoundingClientRect();
      const box = active.getBoundingClientRect();
      const fade = Number.parseFloat(getComputedStyle(nav).getPropertyValue("--tab-fade")) || 0;
      const gap = 12;
      if (box.left < navBox.left + gap) nav.scrollLeft -= navBox.left + gap - box.left;
      else if (box.right > navBox.right - fade) nav.scrollLeft += box.right - (navBox.right - fade);
    };
    follow();
    mark();
    const observer = new ResizeObserver(() => {
      follow();
      mark();
    });
    observer.observe(nav);
    nav.addEventListener("scroll", mark, { passive: true });
    return () => {
      observer.disconnect();
      nav.removeEventListener("scroll", mark);
    };
  }, [pathname, lang]);
  return { ref, more };
}

/** The cloth cover band with index tabs over the Owner's ledger pages. */
export function AppShell() {
  const state = useWorldState();
  const { pathname } = useLocation();
  const { theme, toggle } = useTheme();
  const { lang, choose } = useLang();
  const tabs = useTabRow(pathname, lang);
  const [resetting, setResetting] = useState(false);
  const [stepping, setStepping] = useState(false);
  const [note, setNote] = useState<{ text: string; failed?: boolean } | null>(null);
  const t = useT();
  const inbox = useInbox();
  const unread = Array.isArray(inbox) ? inbox.filter((row) => !row.read).length : 0;
  const workspace = state.status === "ready" ? state.world.workspace : null;

  const reset = async () => {
    if (!window.confirm(t.shell.confirmReset)) return;
    setResetting(true);
    await state.reset();
    setResetting(false);
  };

  // The same workflow the 10:00 cron starts, for this world and the new date.
  const step = async (days: number) => {
    if (!workspace) return;
    const date = addDays(workspace.today, days);
    setStepping(true);
    setNote({ text: t.shell.running(t.date(date)) });
    try {
      const run = await runLadder(date);
      await state.reload();
      setNote({ text: t.shell.ran(t.date(date), run) });
    } catch (e) {
      console.error("ladder run failed", e);
      setNote({ text: t.shell.runFailed, failed: true });
      await state.reload().catch(() => {});
    } finally {
      setStepping(false);
    }
  };

  return (
    <div className="min-h-dvh">
      <header className="cover no-print bg-cover text-on-cover">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3 sm:px-7">
          <Link to="/app" aria-label="Tagada" className="flex min-h-11 items-center gap-2 no-underline">
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
            <div className="flex items-center" title={t.shell.dateTitle}>
              <button
                type="button"
                disabled={stepping}
                onClick={() => step(-1)}
                aria-label={t.shell.prevDay}
                className="grid size-11 place-items-center rounded-md text-on-cover-2 hover:text-on-cover disabled:opacity-50"
              >
                <ChevronLeft size={18} aria-hidden />
              </button>
              <span className="rounded border-[1.5px] border-on-cover-2 px-2.5 py-0.5 text-center leading-tight">
                <small className="block text-xs text-on-cover-2">{t.shell.demoDate}</small>
                <span className="text-sm font-semibold">{t.date(workspace.today)}</span>
              </span>
              <button
                type="button"
                disabled={stepping}
                onClick={() => step(1)}
                aria-label={t.shell.nextDay}
                className="grid size-11 place-items-center rounded-md text-on-cover-2 hover:text-on-cover disabled:opacity-50"
              >
                <ChevronRight size={18} aria-hidden />
              </button>
            </div>
          )}
          <div role="group" aria-label={t.shell.language} className="flex overflow-hidden rounded-md border border-cover-line">
            {(
              [
                ["en", "EN"],
                ["hi", "हिं"],
                ["bn", "বাং"],
              ] as const
            ).map(([l, name]) => (
              <button
                key={l}
                type="button"
                lang={l}
                aria-pressed={lang === l}
                onClick={() => choose(l)}
                className={`min-h-11 min-w-11 px-3 text-[13px] ${lang === l ? "bg-on-cover text-cover" : "text-on-cover-2"}`}
              >
                {name}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === "dark" ? t.shell.light : t.shell.dark}
            className="grid size-11 place-items-center rounded-md border border-cover-line text-on-cover"
          >
            {theme === "dark" ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}
          </button>
          <Link
            to="/app/inbox"
            aria-label={t.shell.inbox(unread)}
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
            <span className="max-sm:sr-only">{t.shell.reset}</span>
          </button>
        </div>
        <nav
          ref={tabs.ref}
          aria-label={t.shell.main}
          data-more={tabs.more ? "true" : "false"}
          className="tab-row mx-auto flex max-w-[1240px] gap-1 overflow-x-auto px-4 pt-3 sm:px-7"
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
              <span lang={lang}>{t.shell.tabs[tab.key]}</span>
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-[1240px] px-3 pt-5 pb-16 sm:px-7 sm:pt-7">
        <p role="status" aria-live="polite" className={note ? "no-print mb-4 text-sm" : "sr-only"}>
          {note && (
            <span className={note.failed ? "text-sindoor" : "text-ink-2"}>
              {note.text}{" "}
              {!note.failed && !stepping && <Link to="/app/automation">{t.shell.log}</Link>}
            </span>
          )}
        </p>
        <WorldGate>
          <Outlet />
        </WorldGate>
        <p className="no-print mt-8 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
          <Badge kind="real">{t.shell.real}</Badge> {t.shell.realNote}
          <Badge kind="sim">{t.shell.simulated}</Badge> {t.shell.simulatedNote}
        </p>
      </main>
    </div>
  );
}

/** Shows the page once the Demo world is open, and says so while it opens. */
export function WorldGate({ children }: { children: React.ReactNode }) {
  const state = useWorldState();
  const t = useT();
  if (state.status === "ready") return <>{children}</>;
  return (
    <div className="leaf shadow-[var(--sheet-shadow)]" role="status" aria-live="polite">
      <div className="ln wide">
        <div className="m" />
        <div className="p">
          {state.status === "loading" ? (
            <p className="text-ink-2">{t.shell.opening}</p>
          ) : (
            <>
              <p>{state.failed === "reset" ? t.shell.resetFailed : t.shell.openFailed}</p>
              <button type="button" className="btn secondary mt-3" onClick={state.retry}>
                {t.common.tryAgain}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
