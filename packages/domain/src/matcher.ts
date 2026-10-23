// Suggest which Invoices a Bank credit pays. Nothing here marks an Invoice paid:
// the Owner confirms that on the Bank page. Money arithmetic stays in `money`.
import { printedDate } from "./printed-date.ts";
import {
  differencePaise,
  formatInr,
  formatRateBps,
  invoiceTotals,
  isGstRate,
  parseAmountPaise,
  percentOfPaise,
  sumPaise,
} from "@tagada/money";

export type MatchKind = "exact" | "part" | "multi" | "overpay" | "unknown" | "tds";

export const MATCH_LABEL: Record<MatchKind, string> = {
  exact: "Exact",
  part: "Part",
  multi: "Multi-invoice",
  overpay: "Overpaid",
  unknown: "Unknown deposit",
  tds: "Possible TDS",
};

export type MatchLine = {
  taxablePaise: number;
  /** GST rate in basis points. 1800 is the 18% installation line. */
  gstRateBp: number;
  hsn: string | null;
};

export type MatchInvoice = {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  buyerType: "goods" | "large_394Q" | "services" | null;
  issueDate: string;
  taxablePaise: number;
  totalPaise: number;
  paidPaise: number;
  lines: readonly MatchLine[];
};

export type MatchCredit = {
  date: string;
  narration: string;
  /** UTR, or the statement reference that goes into the dedupe id. */
  reference: string;
  amountPaise: number;
};

export type MatchAllocation = { invoiceId: string; amountPaise: number; tdsPaise?: number };

export type Match = {
  kind: MatchKind;
  allocations: MatchAllocation[];
  /** One sentence the Owner can read. Never "fake". */
  note: string;
  tds: { rateBps: number; onService: boolean } | null;
};

const TDS_RATES = [10, 100, 200, 1000] as const;

function balanceOf(invoice: MatchInvoice): number {
  return differencePaise(invoice.totalPaise, invoice.paidPaise);
}

/** Drop M/s, Pvt Ltd, Ltd, &/and, case and punctuation, so bank narrations compare. */
function loose(text: string): string {
  return text
    .toLowerCase()
    .replace(/\bm\s*\/\s*s\b/g, " ")
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:private|pvt|limited|ltd|llp|messrs|and)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function identity(number: string): { fy: string; serial: number } | null {
  const match = /^[A-Za-z0-9]{1,6}\/(\d{2})-(\d{2})\/(\d+)$/.exec(number.trim());
  if (!match) return null;
  const serial = Number(match[3]);
  if (!Number.isSafeInteger(serial) || serial < 1) return null;
  return { fy: `${match[1]}-${match[2]}`, serial };
}

/** Invoices whose number is written in the narration, in any separator or padding. */
function namedInvoices(narration: string, invoices: readonly MatchInvoice[]): MatchInvoice[] {
  const found = new Map<string, MatchInvoice>();
  const bySerial = new Map<number, MatchInvoice[]>();
  for (const invoice of invoices) {
    const id = identity(invoice.number);
    if (!id) continue;
    const sameSerial = bySerial.get(id.serial) ?? [];
    sameSerial.push(invoice);
    bySerial.set(id.serial, sameSerial);
    const prefix = invoice.number.split("/")[0] ?? "";
    const pattern = new RegExp(
      `(?:^|[^A-Z0-9])(?:([A-Z0-9]{1,6})\\s*[/\\-\\s]\\s*)?${id.fy.slice(0, 2)}\\s*[-/.]\\s*${id.fy.slice(3)}\\s*[-/.\\s]\\s*0*${id.serial}(?!\\d)`,
      "i",
    );
    const mentioned = pattern.exec(narration);
    const saidPrefix = mentioned?.[1];
    if (mentioned && (!saidPrefix || saidPrefix.toUpperCase() === prefix.toUpperCase())) found.set(invoice.id, invoice);
  }
  // A zero-padded serial on its own ("0012"), and only when just one Invoice has it.
  for (const token of narration.matchAll(/(?:^|[^0-9])(0\d{3,5})(?!\d)/g)) {
    const serial = Number(token[1]);
    const owners = bySerial.get(serial) ?? [];
    if (owners.length === 1 && owners[0]) found.set(owners[0].id, owners[0]);
  }
  return [...found.values()];
}

function namedCustomer(narration: string, invoices: readonly MatchInvoice[]): MatchInvoice[] {
  const narr = ` ${loose(narration)} `;
  let best: { customerId: string; loose: string } | null = null;
  const seen = new Set<string>();
  for (const invoice of invoices) {
    if (seen.has(invoice.customerId)) continue;
    seen.add(invoice.customerId);
    const name = loose(invoice.customerName);
    if (!name || !narr.includes(` ${name} `)) continue;
    if (!best || name.length > best.loose.length) best = { customerId: invoice.customerId, loose: name };
  }
  if (!best) return [];
  return invoices.filter((invoice) => invoice.customerId === best.customerId);
}

function serviceBase(invoice: MatchInvoice): number {
  return sumPaise(
    invoice.lines
      .filter((line) => line.gstRateBp === 1800 || (line.hsn ?? "").replace(/\s/g, "").startsWith("99"))
      .map((line) => line.taxablePaise),
  );
}

function tdsFor(invoice: MatchInvoice, shortfall: number): { bps: number; onService: boolean } | null {
  if (shortfall <= 0) return null;
  const service = serviceBase(invoice);
  const whole = invoice.taxablePaise;
  const hit = (paise: number, rates: readonly number[], onService: boolean) => {
    if (paise <= 0) return null;
    for (const bps of rates) {
      if (percentOfPaise(paise, bps) === shortfall) return { bps, onService };
    }
    return null;
  };
  // A mixed Invoice: 1% and 2% apply to the installation line only, not the goods.
  if (service > 0 && service !== whole) {
    const onService = hit(service, [100, 200], true);
    if (onService) return onService;
  } else if (service > 0) {
    const onService = hit(service, [100, 200, 1000], true);
    if (onService) return onService;
  }
  if (invoice.buyerType === "large_394Q") {
    const large = hit(whole, [10], false);
    if (large) return large;
  }
  // No separate installation line: 1%, 2% and 10% are of the Invoice's taxable value.
  if (service === 0 || service === whole) return hit(whole, [100, 200, 1000], false);
  return hit(whole, [1000], false);
}

function tdsNote(bps: number, onService: boolean, buyerType: MatchInvoice["buyerType"]): string {
  const rate = formatRateBps(bps);
  const who =
    buyerType === "large_394Q"
      ? "This Customer is a large buyer of goods."
      : buyerType === "services"
        ? "This Customer is billed for services."
        : "This Customer is billed for goods, so confirm this before you treat the shortfall as TDS.";
  if (bps === 10) {
    return `Possible TDS of ${rate} of the taxable value. ${who} A large buyer of goods can deduct this under section 393(1), table item 8(ii) (this used to be section 194Q).`;
  }
  if (onService && bps === 200) {
    return `Possible TDS of ${rate} of the installation line. ${who} A company deducts this on work under section 393(1), table item 6(i) (this used to be section 194C). The goods on the Invoice are not part of that deduction.`;
  }
  if (bps === 100 || bps === 200) {
    const rateWho = bps === 100 ? "An individual or HUF is deducted at 1%" : "A company is deducted at 2%";
    return `Possible TDS of ${rate} of the taxable value. ${who} ${rateWho} on work under section 393(1), table item 6(i) (this used to be section 194C).`;
  }
  return `Possible TDS of ${rate} of the taxable value. ${who} That rate is for professional or technical fees.`;
}

function unknown(): Match {
  return {
    kind: "unknown",
    allocations: [],
    note: "Unknown deposit: no Invoice number and no Customer name in this narration.",
    tds: null,
  };
}

/** Suggest a match for one credit. Open Invoices only; paid ones are the caller's to leave out, and a zero balance is ignored here too. */
export function matchCredit(credit: MatchCredit, invoices: readonly MatchInvoice[]): Match {
  const open = invoices.filter((invoice) => balanceOf(invoice) > 0);
  const named = namedInvoices(credit.narration, open);
  const pool = (named.length > 0 ? named : namedCustomer(credit.narration, open))
    .slice()
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.id.localeCompare(b.id));

  if (pool.length === 0 || !Number.isSafeInteger(credit.amountPaise) || credit.amountPaise <= 0) return unknown();

  let left = credit.amountPaise;
  const allocations: MatchAllocation[] = [];
  for (const invoice of pool) {
    if (left <= 0) break;
    const bal = balanceOf(invoice);
    const take = left < bal ? left : bal;
    allocations.push({ invoiceId: invoice.id, amountPaise: take });
    left = differencePaise(left, take);
  }
  const first = allocations[0];
  if (!first) return unknown();

  if (left > 0) {
    const which = allocations.length === 1 ? "the Invoice" : "these Invoices";
    return {
      kind: "overpay",
      allocations,
      note: `${formatInr(left)} more than ${which}. The extra is not applied to an Invoice.`,
      tds: null,
    };
  }

  if (allocations.length === 1) {
    const invoice = pool.find((item) => item.id === first.invoiceId) ?? pool[0];
    if (!invoice) return unknown();
    const bal = balanceOf(invoice);
    if (first.amountPaise === bal) {
      return { kind: "exact", allocations, note: `Matches ${invoice.number} in full.`, tds: null };
    }
    const short = differencePaise(bal, first.amountPaise);
    const tds = tdsFor(invoice, short);
    if (tds) {
      return {
        kind: "tds",
        allocations: [{ invoiceId: invoice.id, amountPaise: first.amountPaise, tdsPaise: short }],
        note: tdsNote(tds.bps, tds.onService, invoice.buyerType),
        tds: { rateBps: tds.bps, onService: tds.onService },
      };
    }
    return {
      kind: "part",
      allocations,
      note: `${formatInr(first.amountPaise)} against ${invoice.number}. ${formatInr(short)} is still owed.`,
      tds: null,
    };
  }

  const last = allocations[allocations.length - 1] ?? first;
  const lastInvoice = pool.find((item) => item.id === last.invoiceId);
  const rest = lastInvoice ? differencePaise(balanceOf(lastInvoice), last.amountPaise) : 0;
  const note =
    rest > 0 && lastInvoice
      ? `Split across ${allocations.length} Invoices, oldest first. ${formatInr(rest)} of ${lastInvoice.number} is still owed.`
      : `Split across ${allocations.length} Invoices, oldest first, each covered in full.`;
  return { kind: "multi", allocations, note, tds: null };
}

/** FNV-1a, 32 bits, as 8 hex characters. Same function the seeded statement uses. */
function fnv(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Row id `bt_<hash>`. The hash covers the workspace, the date, the amount and
 * the reference, then the narration, so importing the same line again collides
 * and a second Demo world does not.
 */
export function bankTxnId(input: {
  workspaceId: string;
  date: string;
  amountPaise: number;
  reference: string;
  narration: string;
}): string {
  const { workspaceId, date, amountPaise, reference, narration } = input;
  return `bt_${fnv(`${workspaceId}|${date}|${amountPaise}|${reference}`)}${fnv(`${narration}|${workspaceId}`)}`;
}

/** How many lines of a statement are new. A line repeated inside the file counts once. */
export function importCount(
  existing: ReadonlySet<string>,
  ids: readonly string[],
): { already: number; added: number; freshIds: string[] } {
  const seen = new Set(existing);
  const freshIds: string[] = [];
  let already = 0;
  for (const id of ids) {
    if (seen.has(id)) already += 1;
    else {
      freshIds.push(id);
      seen.add(id);
    }
  }
  return { already, added: freshIds.length, freshIds };
}

/** The sentence the Bank page shows after an import. */
export function importSummary(already: number, added: number): string {
  return `${already} already imported, ${added} new`;
}

export type ParsedStatement =
  | { ok: true; credits: MatchCredit[] }
  | { ok: false; error: string };

const COLUMNS: Record<string, "date" | "narration" | "reference" | "amount"> = {
  date: "date",
  txndate: "date",
  valuedate: "date",
  transactiondate: "date",
  narration: "narration",
  description: "narration",
  particulars: "narration",
  remarks: "narration",
  narrative: "narration",
  utr: "reference",
  reference: "reference",
  ref: "reference",
  refno: "reference",
  chequeno: "reference",
  amount: "amount",
  credit: "amount",
  creditamount: "amount",
  deposit: "amount",
};

function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const char = source[i] ?? "";
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((item) => item.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some((item) => item.trim())) rows.push(row);
  return rows;
}

function columnKey(header: string): "date" | "narration" | "reference" | "amount" | null {
  return COLUMNS[header.toLowerCase().replace(/[\s_.]+/g, "")] ?? null;
}

/** A statement CSV into credits. Amounts go through `parseAmountPaise`. */
export function parseStatement(text: string): ParsedStatement {
  const rows = splitCsv(text);
  const [header, ...body] = rows;
  if (!header) return { ok: false, error: "The file is empty." };
  const columns = header.map(columnKey);
  if (!columns.includes("date") || !columns.includes("amount")) {
    return { ok: false, error: "The file needs a date column and an amount (or credit) column." };
  }
  const credits: MatchCredit[] = [];
  for (let index = 0; index < body.length; index++) {
    const row = body[index] ?? [];
    const take = (key: "date" | "narration" | "reference" | "amount") => {
      const at = columns.indexOf(key);
      return at === -1 ? "" : (row[at] ?? "").trim();
    };
    const amountCell = take("amount");
    if (!amountCell) continue;
    const amountPaise = parseAmountPaise(amountCell);
    const date = printedDate(take("date"));
    const narration = take("narration");
    const reference = take("reference") || narration;
    if (amountPaise === null || amountPaise < 0 || !date || !reference) {
      return { ok: false, error: `Row ${index + 2} has a date, reference or amount this importer cannot read.` };
    }
    if (amountPaise === 0) continue;
    credits.push({ date, narration, reference, amountPaise });
  }
  if (credits.length === 0) return { ok: false, error: "The file has no credits." };
  return { ok: true, credits };
}

type StoredLine = {
  invoiceId: string;
  hsn: string | null;
  qtyMilli: number;
  ratePaise: number;
  discountBp: number;
  gstRateBp: number;
};

function lineTaxable(line: StoredLine): number {
  const gstRatePercent = line.gstRateBp / 100;
  const quantity = line.qtyMilli / 1000;
  const discountPercent = line.discountBp / 100;
  if (!isGstRate(gstRatePercent) || !Number.isInteger(quantity) || !Number.isInteger(discountPercent)) return 0;
  return invoiceTotals({
    registration: "regular",
    supplierStateCode: "16",
    placeOfSupplyStateCode: "16",
    aggregateTurnoverPaise: 0,
    lines: [{ quantity, ratePaise: line.ratePaise, discountPercent, gstRatePercent }],
  }).taxablePaise;
}

/** Open Invoices in the shape `matchCredit` reads. Line taxable values come from `money`. */
export function invoicesForMatch(input: {
  customers: readonly { $id: string; name: string; buyerType: MatchInvoice["buyerType"] }[];
  invoices: readonly {
    $id: string;
    number: string;
    customerId: string;
    issueDate: string;
    taxablePaise: number;
    totalPaise: number;
    paidPaise: number;
    status: string;
  }[];
  lines: readonly StoredLine[];
}): MatchInvoice[] {
  const customers = new Map(input.customers.map((customer) => [customer.$id, customer]));
  return input.invoices
    .filter((invoice) => invoice.status !== "paid" && invoice.status !== "draft" && invoice.totalPaise > invoice.paidPaise)
    .map((invoice) => {
      const customer = customers.get(invoice.customerId);
      return {
        id: invoice.$id,
        number: invoice.number,
        customerId: invoice.customerId,
        customerName: customer?.name ?? "",
        buyerType: customer?.buyerType ?? null,
        issueDate: invoice.issueDate,
        taxablePaise: invoice.taxablePaise,
        totalPaise: invoice.totalPaise,
        paidPaise: invoice.paidPaise,
        lines: input.lines
          .filter((line) => line.invoiceId === invoice.$id)
          .map((line) => ({ taxablePaise: lineTaxable(line), gstRateBp: line.gstRateBp, hsn: line.hsn })),
      };
    });
}

export type BriefRow = { id: string; area: string; input: string; expected: string; actual: string; pass: boolean };

/** The brief's matcher cases, in the shape `/proof` renders. Expected text is fixed. */
export function matcherBrief(): BriefRow[] {
  const bill = (id: string, number: string, name: string, totalPaise: number, over: Partial<MatchInvoice> = {}): MatchInvoice => ({
    id,
    number,
    customerName: name,
    customerId: id,
    buyerType: "goods",
    issueDate: "2026-09-01",
    taxablePaise: totalPaise,
    totalPaise,
    paidPaise: 0,
    lines: [],
    ...over,
  });
  const inv = bill("i12", "INV/26-27/0012", "Barua Stores", 500_000);
  const other = bill("i13", "INV/26-27/0013", "Other Stores", 500_000, { customerId: "other" });
  const credit = (narration: string, amountPaise: number) => ({ date: "2026-10-01", narration, reference: "x", amountPaise });
  const found = ["NEFT INV/26-27/0012", "INV 26-27 12", "ref 0012"].map(
    (narration) => matchCredit(credit(narration, 500_000), [other, inv]).allocations[0]?.invoiceId ?? "none",
  );
  const named = matchCredit(credit("M/s Barua Stores Pvt Ltd", 500_000), [inv]);
  const short = percentOfPaise(1_000_000, 200);
  const tds = matchCredit(credit("ROY FURNISHINGS", differencePaise(1_000_000, short)), [
    bill("roy", "TBW/26-27/0003", "Roy Furnishings", 1_000_000, { buyerType: "services" }),
  ]);
  const rows: Omit<BriefRow, "pass">[] = [
    {
      id: "match-number",
      area: "Match",
      input: "INV/26-27/0012, INV 26-27 12, and 0012",
      expected: "i12, i12, i12",
      actual: found.join(", "),
    },
    {
      id: "match-name",
      area: "Match",
      input: "M/s Barua Stores Pvt Ltd",
      expected: "Barua Stores",
      actual: named.kind === "exact" && named.allocations[0]?.invoiceId === "i12" ? "Barua Stores" : "no match",
    },
    {
      id: "match-tds",
      area: "Match",
      input: "₹10,000 taxable, short by exactly 2%",
      expected: "Possible TDS",
      actual: tds.kind === "tds" ? "Possible TDS" : tds.kind,
    },
  ];
  return rows.map((row) => ({ ...row, pass: row.actual === row.expected }));
}
