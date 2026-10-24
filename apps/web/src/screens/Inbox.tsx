// What Customers did on the pay link, newest first, live (build plan §6.3).
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { BadgeCheck, CircleHelp, Flag, Handshake, ImageUp, Inbox as InboxIcon } from "lucide-react";
import type { EventRow, InboxKind, InboxRow } from "@tagada/appwrite";
import { markInboxRead } from "../lib/appwrite.ts";
import { decidePromise } from "../lib/call.ts";
import { istDay } from "../lib/pricing.ts";
import { useInbox, usePaymentHistory, useWorld, type World } from "../lib/world.tsx";
import { useT } from "../i18n/index.ts";
import { eventText } from "../lib/history.ts";
import { Head, Ln, Paper } from "../ui.tsx";

const KINDS: Record<InboxKind, { icon: typeof Flag; tone: "ok" | "warn" | "short" | "plain" }> = {
  paid_claim: { icon: BadgeCheck, tone: "plain" },
  proof_uploaded: { icon: ImageUp, tone: "plain" },
  plan_accepted: { icon: Handshake, tone: "ok" },
  needs_decision: { icon: CircleHelp, tone: "warn" },
  dispute: { icon: Flag, tone: "short" },
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
        customer: (invoice && world.customers.get(invoice.customerId)?.name) ?? "",
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
  const t = useT();
  const world = useWorld();
  const promiseId = item.row.kind === "needs_decision" ? promiseIdOf(item.event) : null;
  const promise = promiseId ? world.promises.find((row) => row.$id === promiseId) : undefined;
  const [decided, setDecided] = useState(false);
  // Approve and Decline only while the Promise still waits on the Owner: a second click would be refused.
  const deciding = promise?.status === "needs_owner" && !decided;
  const [busy, setBusy] = useState<"approve" | "decline" | "read" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const act = async (action: "approve" | "decline") => {
    if (!promiseId) return;
    setBusy(action);
    setNote(null);
    try {
      await decidePromise(promiseId, action);
      setDecided(true);
      setNote(action === "approve" ? t.inbox.approved : t.inbox.declined);
      if (!item.row.read) await markInboxRead([item.row.$id]).catch((e: unknown) => console.error("could not mark read", e));
    } catch (e) {
      console.error(e);
      setNote(t.common.couldNotBeDone);
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
      setNote(t.inbox.markFailed);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Ln m={item.event ? t.date(istDay(item.event.at), { weekday: false }) : ""} className="ruler">
      <span className={`word ${kind.tone}`}>
        <kind.icon aria-hidden /> {t.inbox.kinds[item.row.kind]}
      </span>{" "}
      {fresh && <span className="new-dot">{t.inbox.new}</span>}
      <span className="mt-1 block">
        {item.invoiceId ? (
          <Link to={`/app/invoices/${item.invoiceId}`}>{item.customer || t.common.aCustomer}</Link>
        ) : (
          item.customer || t.common.aCustomer
        )}
        {item.number && (
          <>
            , <span className="mono">{item.number}</span>
          </>
        )}
      </span>
      <small>{item.event ? eventText(t, item.event, world.promises) : t.inbox.loadingWhat}</small>
      <span className="mt-2 flex flex-wrap gap-2">
        {(item.row.kind === "paid_claim" || item.row.kind === "proof_uploaded") && (
          <Link to="/app/bank" className="btn secondary">
            {t.inbox.openInBank}
          </Link>
        )}
        {item.row.kind !== "paid_claim" && item.row.kind !== "proof_uploaded" && !deciding && item.invoiceId && (
          <Link to={`/app/invoices/${item.invoiceId}`} className="btn secondary">
            {t.inbox.openInvoice}
          </Link>
        )}
        {deciding && (
          <>
            <button type="button" className="btn primary" disabled={busy !== null} onClick={() => void act("approve")}>
              {t.inbox.approve}
            </button>
            <button type="button" className="btn secondary" disabled={busy !== null} onClick={() => void act("decline")}>
              {t.inbox.decline}
            </button>
          </>
        )}
        {fresh && (
          <button type="button" className="btn secondary" disabled={busy !== null} onClick={() => void mark()}>
            {t.inbox.markRead}
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
  const t = useT();
  const events = Array.isArray(history) ? history : null;
  const items = useMemo(
    () => (Array.isArray(inbox) ? inboxItems(world, inbox, events) : []),
    [world, inbox, events],
  );

  const fresh = (row: InboxRow) => !row.read;

  return (
    <Paper label={t.inbox.title}>
      <div className="ln wide">
        <div className="m" />
        <div className="p">
          <h1 className="text-[28px] leading-tight">{t.inbox.title}</h1>
          <p className="mt-1 max-w-[60ch] text-ink-2">{t.inbox.intro}</p>
        </div>
      </div>
      <div className="sect mt-6">
        <Head title={t.inbox.latest} />
        <div className="entries" aria-live="polite">
          {inbox === "failed" ? (
            <Ln>
              <span className="word short">{t.inbox.failed}</span>
            </Ln>
          ) : inbox === "loading" ? (
            <Ln>
              <span className="text-ink-2">{t.inbox.loading}</span>
            </Ln>
          ) : items.length === 0 ? (
            <Ln m={<InboxIcon size={16} aria-hidden className="ml-auto" />}>
              <p className="text-ink-2">{t.inbox.empty}</p>
            </Ln>
          ) : (
            items.map((item) => <InboxLine key={item.row.$id} item={item} fresh={fresh(item.row)} />)
          )}
        </div>
      </div>
    </Paper>
  );
}
