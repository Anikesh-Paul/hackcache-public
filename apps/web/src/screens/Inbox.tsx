// What Customers did on the pay link, newest first, live (build plan §6.3).
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { BadgeCheck, CircleHelp, Flag, Handshake, ImageUp, Inbox as InboxIcon } from "lucide-react";
import type { EventRow, InboxKind, InboxRow } from "@tagada/appwrite";
import { formatDate } from "@tagada/money";
import { markInboxRead } from "../lib/appwrite.ts";
import { decidePromise } from "../lib/call.ts";
import { istDay } from "../lib/pricing.ts";
import { useInbox, usePaymentHistory, useWorld, type World } from "../lib/world.tsx";
import { ownerCopy } from "../i18n/owner.ts";
import { useLang } from "../lib/prefs.ts";
import { Head, Ln, Paper } from "../ui.tsx";

const KINDS: Record<InboxKind, { icon: typeof Flag; word: string; tone: "ok" | "warn" | "short" | "plain" }> = {
  paid_claim: { icon: BadgeCheck, word: "Says already paid", tone: "plain" },
  proof_uploaded: { icon: ImageUp, word: "Sent a UPI screenshot", tone: "plain" },
  plan_accepted: { icon: Handshake, word: "Plan agreed", tone: "ok" },
  needs_decision: { icon: CircleHelp, word: "Needs your decision", tone: "warn" },
  dispute: { icon: Flag, word: "Dispute", tone: "short" },
};

export type InboxItem = { row: InboxRow; event: EventRow | undefined; customer: string; number: string; invoiceId: string };

/** Inbox rows with the event each points at, newest first. */
export function inboxItems(world: World, inbox: readonly InboxRow[], events: readonly EventRow[] | null): InboxItem[] {
  const byId = new Map((events ?? []).map((e) => [e.$id, e]));
  return inbox
    .map((row) => {
      const event = byId.get(row.refId);
      const invoice = world.invoices.find((i) => i.$id === event?.invoiceId);
      return {
        row,
        event,
        invoiceId: invoice?.$id ?? "",
        number: invoice?.number ?? "",
        customer: (invoice && world.customers.get(invoice.customerId)?.name) ?? "A Customer",
      };
    })
    .sort((a, b) => (b.event?.at ?? "").localeCompare(a.event?.at ?? ""));
}

function promiseIdOf(event: EventRow | undefined): string | null {
  if (!event?.payload) return null;
  try {
    const id = (JSON.parse(event.payload) as { promiseId?: unknown }).promiseId;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}

export function InboxLine({ item, fresh }: { item: InboxItem; fresh: boolean }) {
  const kind = KINDS[item.row.kind];
  const { lang } = useLang();
  const t = ownerCopy(lang);
  const promiseId = item.row.kind === "needs_decision" ? promiseIdOf(item.event) : null;
  const [busy, setBusy] = useState<"approve" | "decline" | "read" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const act = async (action: "approve" | "decline") => {
    if (!promiseId) return;
    setBusy(action);
    setNote(null);
    try {
      await decidePromise(promiseId, action);
      setNote(action === "approve" ? "Approved." : "Declined.");
    } catch (e) {
      console.error(e);
      setNote("That could not be done.");
    } finally {
      setBusy(null);
    }
  };
  const mark = async () => {
    setBusy("read");
    try {
      await markInboxRead([item.row.$id]);
    } catch (e) {
      console.error("could not mark read", e);
      setNote("That could not be marked as read.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <Ln m={item.event ? formatDate(istDay(item.event.at), { weekday: false }) : ""} className="ruler">
      <span className={`word ${kind.tone}`}>
        <kind.icon aria-hidden /> {kind.word}
      </span>{" "}
      {fresh && <span className="new-dot">New</span>}
      <span className="mt-1 block">
        {item.invoiceId ? <Link to={`/app/invoices/${item.invoiceId}`}>{item.customer}</Link> : item.customer}
        {item.number && (
          <>
            , <span className="mono">{item.number}</span>
          </>
        )}
      </span>
      <small>{item.event?.summary ?? "Loading what happened…"}</small>
      <span className="mt-2 flex flex-wrap gap-2">
        {(item.row.kind === "paid_claim" || item.row.kind === "proof_uploaded") && (
          <Link to="/app/bank" className="btn secondary">
            {t.openInBank}
          </Link>
        )}
        {item.row.kind === "dispute" && item.invoiceId && (
          <Link to={`/app/invoices/${item.invoiceId}`} className="btn secondary">
            {t.openInvoice}
          </Link>
        )}
        {item.row.kind === "plan_accepted" && item.invoiceId && (
          <Link to={`/app/invoices/${item.invoiceId}`} className="btn secondary">
            {t.openInvoice}
          </Link>
        )}
        {item.row.kind === "needs_decision" && promiseId && (
          <>
            <button type="button" className="btn primary" disabled={busy !== null} onClick={() => void act("approve")}>
              {t.approve}
            </button>
            <button type="button" className="btn secondary" disabled={busy !== null} onClick={() => void act("decline")}>
              {t.decline}
            </button>
          </>
        )}
        {item.row.kind === "needs_decision" && !promiseId && item.invoiceId && (
          <Link to={`/app/invoices/${item.invoiceId}`} className="btn secondary">
            {t.openInvoice}
          </Link>
        )}
        {fresh && (
          <button type="button" className="btn secondary" disabled={busy !== null} onClick={() => void mark()}>
            {t.markRead}
          </button>
        )}
      </span>
      {note && <small className="mt-1 block">{note}</small>}
    </Ln>
  );
}

export function Inbox() {
  const world = useWorld();
  const inbox = useInbox();
  const history = usePaymentHistory();
  const events = Array.isArray(history) ? history : null;
  const items = useMemo(
    () => (Array.isArray(inbox) ? inboxItems(world, inbox, events) : []),
    [world, inbox, events],
  );

  const fresh = (row: InboxRow) => !row.read;

  return (
    <Paper label="Inbox">
      <div className="ln wide">
        <div className="m" />
        <div className="p">
          <h1 className="text-[28px] leading-tight">Inbox</h1>
          <p className="mt-1 max-w-[60ch] text-ink-2">
            What your Customers did on their pay link: paid claims, screenshots, Plans and Disputes. New ones appear here
            the moment they happen.
          </p>
        </div>
      </div>
      <div className="sect mt-6">
        <Head title="Latest first" />
        <div className="entries" aria-live="polite">
          {inbox === "failed" ? (
            <Ln>
              <span className="word short">The Inbox could not be loaded. Reload the page to try again.</span>
            </Ln>
          ) : inbox === "loading" ? (
            <Ln>
              <span className="text-ink-2">Loading the Inbox…</span>
            </Ln>
          ) : items.length === 0 ? (
            <Ln m={<InboxIcon size={16} aria-hidden className="ml-auto" />}>
              <p className="text-ink-2">
                Nothing yet. Open an Invoice, copy its pay link and open it on your phone: what you do there shows up
                here.
              </p>
            </Ln>
          ) : (
            items.map((item) => <InboxLine key={item.row.$id} item={item} fresh={fresh(item.row)} />)
          )}
        </div>
      </div>
    </Paper>
  );
}
