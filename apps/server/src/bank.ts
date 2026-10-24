// Import a bank statement, suggest matches, and confirm them. A credit becomes
// a Payment only here, when the Owner confirms. Proofs that were "not found yet"
// are checked again against the credits just imported.
import { Permission, Role } from "node-appwrite";
import type { BankAllocation } from "@tagada/appwrite";
import {
  bankTxnId,
  checkProof,
  importCount,
  importSummary,
  matchCredit,
  matchForCustomer,
  overpayPaise,
  parseStatement,
  proofFromModel,
  type Match,
  type MatchKind,
} from "@tagada/domain";
import { differencePaise, formatInr, sumPaise } from "@tagada/money";
import { STATEMENT_2_CSV, invoicesForMatch } from "@tagada/seed";
import { allocationsOf, readJson } from "./bank-credits.ts";
import type { OwnedRow, StoredRow, WorldStore } from "./demo.ts";
import { newId, proofCredits, stamp } from "./pay.ts";

export type ImportResult =
  | { ok: true; already: number; added: number; summary: string }
  | { ok: false; status: 400; error: string; message: string };

export type ConfirmResult =
  | { ok: true; confirmed: number; changed: number; message: string | null }
  | { ok: false; status: 400; error: string };

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const whole = (value: unknown): number => (typeof value === "number" && Number.isInteger(value) ? value : 0);

function permissionsOf(userId: string): string[] {
  return [Permission.read(Role.user(userId)), Permission.update(Role.user(userId))];
}

function ownerAccess(workspace: StoredRow, workspaceId: string): { permissions: string[]; today: string } {
  const userId = text(workspace.ownerUserId) ?? workspaceId.slice(1);
  return { permissions: permissionsOf(userId), today: text(workspace.today) ?? "" };
}

async function books(worlds: WorldStore, workspaceId: string) {
  const [workspaces, customers, invoices, lines, bank, proofs] = await Promise.all([
    worlds.list("workspaces", workspaceId),
    worlds.list("customers", workspaceId),
    worlds.list("invoices", workspaceId),
    worlds.list("invoice_lines", workspaceId),
    worlds.list("bank_txns", workspaceId),
    worlds.list("proof_checks", workspaceId),
  ]);
  const workspace = workspaces[0];
  return { workspace, customers, invoices, lines, bank, proofs };
}

function matchRows(customers: StoredRow[], invoices: StoredRow[], lines: StoredRow[]) {
  return invoicesForMatch({
    customers: customers.flatMap((row) => {
      const name = text(row.name);
      if (!name) return [];
      const buyerType = text(row.buyerType);
      return [
        {
          $id: row.$id,
          name,
          buyerType: buyerType === "goods" || buyerType === "large_394Q" || buyerType === "services" ? buyerType : null,
        },
      ];
    }),
    invoices: invoices.flatMap((row) => {
      const number = text(row.number);
      const customerId = text(row.customerId);
      const issueDate = text(row.issueDate);
      const status = text(row.status);
      if (!number || !customerId || !issueDate || !status) return [];
      if (status !== "draft" && status !== "sent" && status !== "part" && status !== "paid" && status !== "disputed") {
        return [];
      }
      return [
        {
          $id: row.$id,
          number,
          customerId,
          issueDate,
          taxablePaise: whole(row.taxablePaise),
          totalPaise: whole(row.totalPaise),
          paidPaise: whole(row.paidPaise),
          status,
        },
      ];
    }),
    lines: lines.flatMap((row) => {
      const invoiceId = text(row.invoiceId);
      if (!invoiceId) return [];
      return [
        {
          invoiceId,
          hsn: text(row.hsn),
          qtyMilli: whole(row.qtyMilli),
          ratePaise: whole(row.ratePaise),
          discountBp: whole(row.discountBp),
          gstRateBp: whole(row.gstRateBp),
        },
      ];
    }),
  });
}

function storedMatch(match: Match): { matchStatus: "unmatched" | "suggested"; matchKind: MatchKind; allocations: string | null } {
  if (match.kind === "unknown" || match.allocations.length === 0) {
    return { matchStatus: "unmatched", matchKind: "unknown", allocations: null };
  }
  return { matchStatus: "suggested", matchKind: match.kind, allocations: JSON.stringify(match.allocations) };
}

/**
 * The match for a stored credit, as Confirm will check it. A credit the Owner
 * assigned is matched against that Customer only.
 */
function rematch(credit: StoredRow, loaded: Awaited<ReturnType<typeof books>>, customerId: string | null): Match {
  const input = {
    date: text(credit.date) ?? "",
    narration: text(credit.narration) ?? "",
    reference: text(credit.utr) ?? "",
    amountPaise: whole(credit.amountPaise),
  };
  const rows = matchRows(loaded.customers, loaded.invoices, loaded.lines);
  const customer = customerId ? loaded.customers.find((row) => row.$id === customerId) : undefined;
  if (!customer) return matchCredit(input, rows);
  return matchForCustomer(input, rows, { id: customer.$id, name: text(customer.name) ?? "" });
}

/** Import statement 2, or a CSV the Owner dropped. The same line a second time adds nothing. */
export async function importStatement(worlds: WorldStore, workspaceId: string, body: unknown): Promise<ImportResult> {
  const input = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const csv = input.sample === true ? STATEMENT_2_CSV : typeof input.csv === "string" ? input.csv : null;
  if (csv === null) return { ok: false, status: 400, error: "invalid_body", message: "Send a CSV, or import the sample statement." };
  const parsed = parseStatement(csv);
  if (!parsed.ok) return { ok: false, status: 400, error: "invalid_csv", message: parsed.error };

  const { workspace, customers, invoices, lines, bank } = await books(worlds, workspaceId);
  if (!workspace) return { ok: false, status: 400, error: "no_workspace", message: "This Demo world is not ready." };
  const { permissions } = ownerAccess(workspace, workspaceId);
  const open = matchRows(customers, invoices, lines);
  const incoming = parsed.credits.map((credit) => ({
    credit,
    id: bankTxnId({ workspaceId, ...credit }),
  }));
  const { already, added, freshIds } = importCount(new Set(bank.map((row) => row.$id)), incoming.map((row) => row.id));
  const fresh = new Set(freshIds);
  const rows: OwnedRow[] = incoming
    .filter((row) => fresh.has(row.id))
    .map(({ credit, id }) => ({
      $id: id,
      workspaceId,
      $permissions: permissions,
      date: credit.date,
      narration: credit.narration,
      utr: credit.reference,
      amountPaise: credit.amountPaise,
      ...storedMatch(matchCredit(credit, open)),
    }));
  if (rows.length > 0) await worlds.write({ bank_txns: rows });
  await refreshProofs(worlds, workspaceId);
  return { ok: true, already, added, summary: importSummary(already, added) };
}

/** Checks again each screenshot not found yet: after an import, and when the Demo date moves past its date. */
export async function refreshProofs(worlds: WorldStore, workspaceId: string): Promise<void> {
  const { workspace, invoices, bank, proofs } = await books(worlds, workspaceId);
  if (!workspace) return;
  const { permissions, today } = ownerAccess(workspace, workspaceId);
  for (const proof of proofs) {
    if (proof.result !== "not_found_yet") continue;
    const extracted = proofFromModel(readJson(proof.extracted));
    const invoice = invoices.find((row) => row.$id === proof.invoiceId);
    if (!extracted || !invoice) continue;
    const view = checkProof({
      extracted,
      today,
      balancePaise: differencePaise(whole(invoice.totalPaise), whole(invoice.paidPaise)),
      credits: proofCredits(bank, invoice.$id),
    });
    if (view.result === "not_found_yet") continue;
    await worlds.update("proof_checks", proof.$id, { result: view.result, checkedAt: stamp(today) });
    if (view.result !== "found") continue;
    const event: OwnedRow = {
      $id: newId("v"),
      workspaceId,
      $permissions: permissions,
      invoiceId: invoice.$id,
      at: stamp(today),
      type: "proof_matched",
      actor: "owner",
      summary: "The UTR on the screenshot is in the bank statement. Matched ✓.",
      payload: JSON.stringify({ utr: extracted.utr }),
    };
    await worlds.write({ events: [event] });
  }
}

function sameAllocations(a: readonly BankAllocation[], b: readonly BankAllocation[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (item, i) =>
        item.invoiceId === b[i]?.invoiceId && item.amountPaise === b[i]?.amountPaise && (item.tdsPaise ?? 0) === (b[i]?.tdsPaise ?? 0),
    )
  );
}

function changedMessage(changed: number): string | null {
  if (changed === 0) return null;
  return changed === 1
    ? "1 credit changed since it was imported. Check its new suggestion."
    : `${changed} credits changed since they were imported. Check their new suggestions.`;
}

function choose(bank: StoredRow[], body: unknown): StoredRow[] {
  const input = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const suggested = bank.filter((row) => row.matchStatus === "suggested");
  if (input.allExact === true) return suggested.filter((row) => row.matchKind === "exact");
  const ids = Array.isArray(input.ids) ? input.ids.filter((id): id is string => typeof id === "string") : [];
  const wanted = new Set(ids);
  return suggested.filter((row) => wanted.has(row.$id) && row.matchKind !== "unknown");
}

/**
 * Mark the chosen suggestions as Payments. Exact matches can be confirmed together.
 * Each credit is matched again against what is open now, so a suggestion made
 * before another payment never pays an Invoice twice or drops the rest of a credit:
 * a credit whose match changed keeps its new suggestion and waits for the Owner.
 */
export async function confirmMatches(worlds: WorldStore, workspaceId: string, body: unknown): Promise<ConfirmResult> {
  const loaded = await books(worlds, workspaceId);
  if (!loaded.workspace) return { ok: false, status: 400, error: "no_workspace" };
  const chosen = choose(loaded.bank, body);
  const { permissions, today } = ownerAccess(loaded.workspace, workspaceId);
  const invoices = new Map(loaded.invoices.map((row) => [row.$id, row]));
  const events: OwnedRow[] = [];
  let confirmed = 0;
  let changed = 0;

  for (const credit of chosen) {
    // `invoices` holds these same rows, so a credit confirmed earlier in this loop is already counted.
    const fresh = rematch(credit, loaded, text(credit.assignedCustomerId));
    if (fresh.kind !== credit.matchKind || !sameAllocations(fresh.allocations, allocationsOf(credit.allocations))) {
      await worlds.update("bank_txns", credit.$id, storedMatch(fresh));
      changed += 1;
      continue;
    }
    for (const allocation of fresh.allocations) {
      const invoice = invoices.get(allocation.invoiceId);
      if (!invoice || invoice.status === "paid") continue;
      const applied = sumPaise([whole(invoice.paidPaise), allocation.amountPaise, allocation.tdsPaise ?? 0]);
      const total = whole(invoice.totalPaise);
      const covered = applied >= total;
      const status = covered ? "paid" : invoice.status === "disputed" ? "disputed" : "part";
      const paidPaise = covered ? total : applied;
      await worlds.update("invoices", invoice.$id, { paidPaise, status });
      invoice.paidPaise = paidPaise;
      invoice.status = status;
      const summary = allocation.tdsPaise
        ? `Confirmed ${formatInr(allocation.amountPaise)} from the bank statement. ${formatInr(allocation.tdsPaise)} kept back as TDS, so this Invoice is covered.`
        : `Confirmed ${formatInr(allocation.amountPaise)} from the bank statement against this Invoice.`;
      events.push({
        $id: newId("v"),
        workspaceId,
        $permissions: permissions,
        invoiceId: invoice.$id,
        at: stamp(today),
        type: "payment",
        actor: "owner",
        summary,
        payload: JSON.stringify({ amountPaise: allocation.amountPaise, tdsPaise: allocation.tdsPaise ?? 0 }),
      });
    }
    await worlds.update("bank_txns", credit.$id, { matchStatus: "confirmed" });
    confirmed += 1;
  }
  if (events.length > 0) await worlds.write({ events });
  return { ok: true, confirmed, changed, message: changedMessage(changed) };
}

export type AssignResult =
  | { ok: true; kind: MatchKind; note: string }
  | { ok: false; status: 400 | 404; error: string };

/** The Owner names the Customer for an unknown deposit. The matcher then suggests, and Confirm pays it. */
export async function assignCredit(worlds: WorldStore, workspaceId: string, body: unknown): Promise<AssignResult> {
  const input = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const id = text(input.id);
  const customerId = text(input.customerId);
  if (!id || !customerId) return { ok: false, status: 400, error: "invalid_body" };
  const loaded = await books(worlds, workspaceId);
  if (!loaded.workspace) return { ok: false, status: 400, error: "no_workspace" };
  const credit = loaded.bank.find((row) => row.$id === id);
  const customer = loaded.customers.find((row) => row.$id === customerId);
  if (!credit || !customer) return { ok: false, status: 404, error: "not_found" };
  if (credit.matchStatus === "confirmed") return { ok: false, status: 400, error: "already_confirmed" };
  const match = rematch(credit, loaded, customerId);
  await worlds.update("bank_txns", credit.$id, { assignedCustomerId: customerId, ...storedMatch(match) });
  return { ok: true, kind: match.kind, note: match.note };
}

export type AdvanceResult =
  | { ok: true; amountPaise: number; customerName: string; already: boolean }
  | { ok: false; status: 400 | 404; error: string };

/** Record the part of an overpayment that was not applied to an Invoice, once, as an advance. */
export async function keepAdvance(worlds: WorldStore, workspaceId: string, body: unknown): Promise<AdvanceResult> {
  const input = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const id = text(input.id);
  if (!id) return { ok: false, status: 400, error: "invalid_body" };
  const loaded = await books(worlds, workspaceId);
  if (!loaded.workspace) return { ok: false, status: 400, error: "no_workspace" };
  const credit = loaded.bank.find((row) => row.$id === id);
  if (!credit) return { ok: false, status: 404, error: "not_found" };
  if (credit.matchStatus !== "confirmed") return { ok: false, status: 400, error: "not_confirmed" };
  const shares = allocationsOf(credit.allocations);
  const extra = overpayPaise(whole(credit.amountPaise), shares);
  const invoiceId = shares[0]?.invoiceId;
  if (extra <= 0 || !invoiceId) return { ok: false, status: 400, error: "no_advance" };
  const invoice = loaded.invoices.find((row) => row.$id === invoiceId);
  const customer = loaded.customers.find((row) => row.$id === invoice?.customerId);
  const customerName = text(customer?.name) ?? "Customer";
  const events = await worlds.list("events", workspaceId);
  const already = events.some((event) => event.type === "advance" && advanceFor(event.payload) === id);
  if (already) return { ok: true, amountPaise: extra, customerName, already: true };
  const { permissions, today } = ownerAccess(loaded.workspace, workspaceId);
  await worlds.write({
    events: [
      {
        $id: newId("v"),
        workspaceId,
        $permissions: permissions,
        invoiceId,
        at: stamp(today),
        type: "advance",
        actor: "owner",
        summary: `${formatInr(extra)} kept as an advance for ${customerName}.`,
        payload: JSON.stringify({ amountPaise: extra, bankTxnId: id }),
      },
    ],
  });
  return { ok: true, amountPaise: extra, customerName, already: false };
}

function advanceFor(payload: unknown): string | null {
  if (typeof payload !== "string") return null;
  try {
    const bankTxnId = (JSON.parse(payload) as { bankTxnId?: unknown }).bankTxnId;
    return typeof bankTxnId === "string" ? bankTxnId : null;
  } catch {
    return null;
  }
}
