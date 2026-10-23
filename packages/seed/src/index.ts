// The seeded Demo world (build plan §2.5): Tripura Bamboo Works on Mon 2 Nov
// 2026, 12 Customers, 31 Invoices over six months, bank statement 1, events,
// Promises and cash items. Pure and deterministic: the same IDs give the same
// rows, byte for byte. Totals come from `money`, never typed in.
import type {
  BankAllocation,
  BankTxnRow,
  CashItemRow,
  CustomerRow,
  EventActor,
  EventRow,
  InvoiceLineRow,
  InvoiceRow,
  PromiseRow,
  WorkspaceRow,
} from "@tagada/appwrite";
import {
  addDays,
  differencePaise,
  formatDate,
  formatInr,
  gstinCheckDigit,
  invoiceNumber,
  invoiceTotals,
  lineMeasures,
  percentOfPaise,
  sumPaise,
  type GstRate,
  type InvoiceLine,
} from "@tagada/money";

export const DEMO_TODAY = "2026-11-02";
const SALARY_DAY = "2026-11-10";
const SUPPLIER_STATE = "16";

export type SeedIds = { workspaceId: string; ownerUserId: string };

export type World = {
  workspaces: WorkspaceRow[];
  customers: CustomerRow[];
  invoices: InvoiceRow[];
  invoice_lines: InvoiceLineRow[];
  events: EventRow[];
  promises: PromiseRow[];
  bank_txns: BankTxnRow[];
  cash_items: CashItemRow[];
};

// ---------------------------------------------------------------- catalogue

type Product = { description: string; hsn: string; ratePaise: number; gst: GstRate };

const P = {
  basket: { description: "Lidded bamboo basket", hsn: "460211", ratePaise: 18_000, gst: 5 },
  tray: { description: "Bamboo serving tray", hsn: "460211", ratePaise: 12_000, gst: 5 },
  mats: { description: "Table mats, set of 6", hsn: "460121", ratePaise: 24_000, gst: 5 },
  blind: { description: "Roll-up bamboo blind", hsn: "460121", ratePaise: 65_000, gst: 5 },
  chair: { description: "Cane lounge chair", hsn: "940382", ratePaise: 240_000, gst: 5 },
  bowls: { description: "Bamboo bowl set", hsn: "441919", ratePaise: 32_000, gst: 5 },
  install: { description: "Installation (per man-day)", hsn: "9987", ratePaise: 150_000, gst: 18 },
  // Part of a composite supply, so it takes the principal supply's (the chairs') HSN and 5%.
  packing: { description: "Packing and forwarding", hsn: "940382", ratePaise: 38_100, gst: 5 },
} satisfies Record<string, Product>;

type Line = [product: Product, quantity: number, discountPercent?: number];

// ---------------------------------------------------------------- customers

type CustomerSeed = {
  key: string;
  name: string;
  place: string;
  address: string;
  stateCode: string;
  /** PAN (10) + entity number, the 13 characters after the state code. */
  pan: string;
  creditDays: number;
  buyerType: CustomerRow["buyerType"];
  lang: string;
  gender: CustomerRow["gender"];
  consentAt?: string;
};

const CUSTOMERS: CustomerSeed[] = [
  {
    key: "gupta",
    name: "Gupta Traders",
    place: "Kolkata",
    address: "27 Burrabazar Street, Kolkata 700007",
    stateCode: "19",
    pan: "AAGFG4821K1",
    creditDays: 30,
    buyerType: "goods",
    lang: "hi",
    gender: "male",
    consentAt: "2026-10-02T12:40:00.000+05:30",
  },
  {
    key: "sen",
    name: "Sen Handicrafts",
    place: "Kolkata",
    address: "11 Gariahat Road, Kolkata 700019",
    stateCode: "19",
    pan: "ABMPS7712D1",
    creditDays: 30,
    buyerType: "goods",
    lang: "bn",
    gender: "neutral",
  },
  {
    key: "das",
    name: "Das & Sons",
    place: "Guwahati",
    address: "Fancy Bazar, Guwahati 781001",
    stateCode: "18",
    pan: "AAHFD3390B1",
    creditDays: 30,
    buyerType: "goods",
    lang: "hi",
    gender: "neutral",
  },
  {
    key: "barua",
    name: "Barua Stores",
    place: "Guwahati",
    address: "G S Road, Bhangagarh, Guwahati 781005",
    stateCode: "18",
    pan: "AAJFB5521M1",
    creditDays: 30,
    buyerType: "goods",
    lang: "hi",
    gender: "neutral",
  },
  {
    key: "roy",
    name: "Roy Furnishings",
    place: "Kolkata",
    address: "62 Rash Behari Avenue, Kolkata 700026",
    stateCode: "19",
    pan: "ACKPR2208H1",
    creditDays: 30,
    buyerType: "goods",
    lang: "bn",
    gender: "neutral",
  },
  {
    key: "hotel",
    name: "Hotel Gomati View",
    place: "Agartala",
    address: "Hotel Tilla Road, Agartala 799001",
    stateCode: "16",
    pan: "AADFH6610Q1",
    creditDays: 15,
    buyerType: "services",
    lang: "en",
    gender: "neutral",
  },
  {
    key: "brahmaputra",
    name: "Brahmaputra Home Stores Pvt Ltd",
    place: "Guwahati",
    address: "Christian Basti, G S Road, Guwahati 781005",
    stateCode: "18",
    pan: "AAECB8174R1",
    creditDays: 45,
    buyerType: "large_394Q",
    lang: "en",
    gender: "neutral",
  },
  {
    key: "debnath",
    name: "Debnath Crafts",
    place: "Kolkata",
    address: "4 College Street, Kolkata 700073",
    stateCode: "19",
    pan: "AFQPD4471C1",
    creditDays: 30,
    buyerType: "goods",
    lang: "bn",
    gender: "neutral",
  },
  {
    key: "chakma",
    name: "Chakma Emporium",
    place: "Agartala",
    address: "Post Office Chowmuhani, Agartala 799001",
    stateCode: "16",
    pan: "AGTPC9035E1",
    creditDays: 30,
    buyerType: "goods",
    lang: "bn",
    gender: "neutral",
  },
  {
    key: "paul",
    name: "Paul Gift House",
    place: "Kolkata",
    address: "18 New Market, Lindsay Street, Kolkata 700087",
    stateCode: "19",
    pan: "AHBPP1186J1",
    creditDays: 30,
    buyerType: "goods",
    lang: "bn",
    gender: "neutral",
  },
  {
    key: "kalita",
    name: "Kalita Traders",
    place: "Guwahati",
    address: "Paltan Bazar, Guwahati 781008",
    stateCode: "18",
    pan: "AAKFK7243N1",
    creditDays: 30,
    buyerType: "goods",
    lang: "hi",
    gender: "neutral",
  },
  {
    key: "saha",
    name: "Saha Furniture Mart",
    place: "Agartala",
    address: "Battala Market, Agartala 799001",
    stateCode: "16",
    pan: "AMRPS6652G1",
    creditDays: 30,
    buyerType: "goods",
    lang: "bn",
    gender: "neutral",
  },
];

// ---------------------------------------------------------------- invoices

/** How an Invoice ends up on the Demo date. */
type Outcome =
  | { paidLate: number } // paid this many days after the due date
  | { open: true; partInBank?: number; promise?: { on: string; payBy: string } } // the rest promised
  | { disputedOn: string; reason: string }
  | { promisedOn: string; payBy: string }; // a Promise, kept on its date

type InvoiceSeed = { issued: string; customer: string; lines: Line[]; outcome: Outcome };

// In issue-date order: the FY serial is the position in this list.
const INVOICES: InvoiceSeed[] = [
  {
    issued: "2026-05-07",
    customer: "gupta",
    lines: [
      [P.chair, 10],
      [P.blind, 20],
    ],
    outcome: { paidLate: 14 },
  },
  {
    issued: "2026-05-12",
    customer: "sen",
    lines: [
      [P.basket, 50],
      [P.tray, 30],
    ],
    outcome: { paidLate: 2 },
  },
  { issued: "2026-05-18", customer: "kalita", lines: [[P.mats, 40]], outcome: { paidLate: 5 } },
  { issued: "2026-05-25", customer: "das", lines: [[P.basket, 60]], outcome: { paidLate: 20 } },
  { issued: "2026-06-03", customer: "barua", lines: [[P.blind, 20]], outcome: { paidLate: 8 } },
  {
    issued: "2026-06-09",
    customer: "chakma",
    lines: [
      [P.bowls, 30],
      [P.tray, 20],
    ],
    outcome: { promisedOn: "2026-07-12", payBy: "2026-07-20" },
  },
  { issued: "2026-06-13", customer: "paul", lines: [[P.bowls, 25]], outcome: { open: true } },
  {
    issued: "2026-06-16",
    customer: "roy",
    lines: [
      [P.chair, 5],
      [P.blind, 10],
    ],
    outcome: { paidLate: 3 },
  },
  { issued: "2026-06-22", customer: "saha", lines: [[P.chair, 4]], outcome: { paidLate: 1 } },
  {
    issued: "2026-06-29",
    customer: "brahmaputra",
    lines: [
      [P.basket, 100],
      [P.tray, 100],
    ],
    outcome: { paidLate: 6 },
  },
  { issued: "2026-07-06", customer: "gupta", lines: [[P.chair, 15]], outcome: { paidLate: 10 } },
  {
    issued: "2026-07-14",
    customer: "hotel",
    lines: [
      [P.chair, 20],
      [P.install, 2],
    ],
    outcome: { paidLate: 4 },
  },
  {
    issued: "2026-07-20",
    customer: "kalita",
    lines: [
      [P.basket, 30],
      [P.tray, 30],
    ],
    outcome: { paidLate: 9 },
  },
  { issued: "2026-07-27", customer: "sen", lines: [[P.mats, 40]], outcome: { paidLate: 0 } },
  {
    issued: "2026-07-28",
    customer: "debnath",
    lines: [
      [P.basket, 80],
      [P.tray, 20],
    ],
    outcome: { disputedOn: "2026-09-01", reason: "Says 10 baskets arrived damaged" },
  },
  { issued: "2026-08-04", customer: "debnath", lines: [[P.basket, 60]], outcome: { paidLate: 15 } },
  { issued: "2026-08-10", customer: "das", lines: [[P.blind, 25]], outcome: { paidLate: 18 } },
  { issued: "2026-08-17", customer: "chakma", lines: [[P.bowls, 40]], outcome: { paidLate: 6 } },
  {
    issued: "2026-08-26",
    customer: "gupta",
    lines: [
      [P.chair, 30],
      [P.blind, 40],
      [P.basket, 40],
      [P.mats, 15],
      [P.bowls, 10],
      [P.packing, 1],
    ],
    outcome: { open: true },
  },
  { issued: "2026-09-01", customer: "kalita", lines: [[P.mats, 50]], outcome: { paidLate: 3 } },
  {
    issued: "2026-09-08",
    customer: "roy",
    lines: [
      [P.chair, 6],
      [P.blind, 12],
    ],
    outcome: { open: true },
  },
  { issued: "2026-09-14", customer: "barua", lines: [[P.mats, 60]], outcome: { open: true } },
  { issued: "2026-09-21", customer: "barua", lines: [[P.blind, 30, 10]], outcome: { open: true } },
  {
    issued: "2026-09-22",
    customer: "sen",
    lines: [
      [P.basket, 80],
      [P.tray, 40],
    ],
    outcome: { open: true },
  },
  {
    issued: "2026-09-29",
    customer: "das",
    lines: [
      [P.blind, 40],
      [P.mats, 20],
    ],
    // Part-paid on 30 Oct (bank statement 1); the rest promised for before salary day.
    outcome: { open: true, partInBank: 1_800_000, promise: { on: "2026-10-31", payBy: "2026-11-06" } },
  },
  // Due on 1 Nov; Kalita Traders usually pays 6 days late, so it is expected on Sat 7 Nov.
  {
    issued: "2026-10-02",
    customer: "kalita",
    lines: [
      [P.bowls, 27],
      [P.blind, 27],
    ],
    outcome: { open: true },
  },
  {
    issued: "2026-10-05",
    customer: "hotel",
    lines: [
      [P.chair, 12],
      [P.install, 3],
    ],
    outcome: { open: true },
  },
  {
    issued: "2026-10-06",
    customer: "brahmaputra",
    lines: [
      [P.basket, 100],
      [P.tray, 100],
    ],
    outcome: { open: true },
  },
  // Due on 8 Nov; Saha Furniture Mart usually pays a day late, so it is expected on Mon 9 Nov.
  { issued: "2026-10-09", customer: "saha", lines: [[P.chair, 8]], outcome: { open: true } },
  {
    issued: "2026-10-19",
    customer: "paul",
    lines: [
      [P.tray, 20],
      [P.mats, 10],
    ],
    outcome: { open: true },
  },
  { issued: "2026-10-27", customer: "chakma", lines: [[P.bowls, 20]], outcome: { open: true } },
];

/**
 * When the Ladder took each stage, in days from the due date. Only the first
 * three ran in the seeded history; the call and the letter wait for the Owner.
 */
const HISTORY_STAGES = [
  { stage: 1, offset: -3, actor: "workflow", summary: "Friendly heads-up sent by email" },
  { stage: 2, offset: 0, actor: "workflow", summary: "Due-date reminder sent by email" },
  { stage: 3, offset: 7, actor: "owner", summary: "Overdue reminder with pay link sent on WhatsApp" },
] as const;

// ---------------------------------------------------------------- the world

const at = (date: string, time: string) => `${date}T${time}:00.000+05:30`;
/** FNV-1a, 32 bits, as 8 hex characters: a stable short key for a bank line. */
function fnv(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function seedWorld({ workspaceId, ownerUserId }: SeedIds): World {
  const id = (local: string) => `${local}_${workspaceId}`;
  const base = { workspaceId };
  const turnover = 18_000_000_00; // ₹1.8 crore, under the e-invoicing threshold

  const workspace: WorkspaceRow = {
    ...base,
    $id: workspaceId,
    ownerUserId,
    businessName: "Tripura Bamboo Works",
    address: "Plot 14, Bamboo and Cane Cluster, Lichubagan, Agartala 799006",
    gstin: withCheckDigit("16AAKFT3920R1"),
    stateCode: SUPPLIER_STATE,
    registrationType: "regular",
    aggregateTurnoverPaise: turnover,
    udyamType: "micro",
    isTrader: false,
    // Not a real UPI handle, so a judge who scans the QR cannot pay anyone.
    upiVpa: "tripurabamboo@demo",
    ownerEmail: null,
    demoInboxEmail: null,
    today: DEMO_TODAY,
    salaryDay: SALARY_DAY,
    openingCashPaise: 7_450_000,
    planRule: JSON.stringify({ minFirstPct: 50, firstWithinDays: 7, restWithinDays: 30 }),
    autoSendStages: [1, 2],
    lang: "en",
  };

  const customers: CustomerRow[] = CUSTOMERS.map((c, n) => ({
    ...base,
    $id: id(`c${pad(n + 1)}`),
    name: c.name,
    address: c.address,
    gstin: withCheckDigit(`${c.stateCode}${c.pan}`),
    stateCode: c.stateCode,
    place: c.place,
    phone: null,
    email: null,
    buyerType: c.buyerType,
    creditDays: c.creditDays,
    avgDelayDays: null,
    grade: null,
    gradeReason: null,
    consentCalls: c.consentAt !== undefined,
    consentAt: c.consentAt ?? null,
    lang: c.lang,
    gender: c.gender,
  }));
  const customerOf = (key: string) => {
    const n = CUSTOMERS.findIndex((c) => c.key === key);
    const seed = CUSTOMERS[n];
    const row = customers[n];
    if (!seed || !row) throw new Error(`no customer ${key}`);
    return { seed, row };
  };

  const invoices: InvoiceRow[] = [];
  const invoice_lines: InvoiceLineRow[] = [];
  const events: EventRow[] = [];
  const promises: PromiseRow[] = [];
  const pricedLines = new Map<string, InvoiceLine[]>();
  const partsInBank = new Map<string, number>();

  INVOICES.forEach((seed, n) => {
    const local = `i${pad(n + 1)}`;
    const invoiceId = id(local);
    const { seed: who, row: customer } = customerOf(seed.customer);
    const number = invoiceNumber("TBW", seed.issued, n + 1);
    const dueDate = addDays(seed.issued, who.creditDays);
    const priced = invoiceTotals({
      registration: "regular",
      supplierStateCode: SUPPLIER_STATE,
      placeOfSupplyStateCode: who.stateCode,
      aggregateTurnoverPaise: turnover,
      lines: seed.lines.map(([product, quantity, discountPercent = 0]) => ({
        quantity,
        ratePaise: product.ratePaise,
        discountPercent,
        gstRatePercent: product.gst,
      })),
    });

    pricedLines.set(invoiceId, priced.lines);
    seed.lines.forEach(([product, quantity, discountPercent = 0], k) => {
      invoice_lines.push({
        ...base,
        $id: id(`l${pad(n + 1)}_${k + 1}`),
        invoiceId,
        description: product.description,
        hsn: product.hsn || null,
        ratePaise: product.ratePaise,
        ...lineMeasures({ quantity, discountPercent, gstRatePercent: product.gst }),
      });
    });

    const outcome = seed.outcome;
    if ("partInBank" in outcome && outcome.partInBank !== undefined) partsInBank.set(invoiceId, outcome.partInBank);
    const paidOn =
      "paidLate" in outcome ? addDays(dueDate, outcome.paidLate) : "payBy" in outcome ? outcome.payBy : null;
    // The Ladder runs until the Invoice is paid, disputed or the Demo date.
    const stopsOn = paidOn ?? ("disputedOn" in outcome ? outcome.disputedOn : addDays(DEMO_TODAY, 1));

    const timeline: Omit<EventRow, "$id" | "workspaceId" | "invoiceId">[] = [
      {
        at: at(seed.issued, "11:30"),
        type: "sent",
        actor: "owner",
        summary: `Invoice sent; ${who.creditDays} days' credit, due ${formatDate(dueDate)}`,
        payload: JSON.stringify({ totalPaise: priced.totalPaise }),
      },
    ];
    let ladderStage = 0;
    for (const step of HISTORY_STAGES) {
      const on = addDays(dueDate, step.offset);
      if (on >= stopsOn) break;
      ladderStage = step.stage;
      timeline.push({
        at: at(on, step.actor === "workflow" ? "10:00" : "17:15"),
        type: "reminder",
        actor: step.actor,
        summary: step.summary,
        payload: JSON.stringify({ stage: step.stage }),
      });
    }
    if ("promisedOn" in outcome) {
      timeline.push({
        at: at(outcome.promisedOn, "16:05"),
        type: "promise",
        actor: "customer",
        summary: `Promised the full ${formatInr(priced.totalPaise)} by ${formatDate(outcome.payBy)} on the pay link`,
        payload: null,
      });
      promises.push({
        ...base,
        $id: id(`p${pad(n + 1)}`),
        invoiceId,
        source: "link",
        instalments: JSON.stringify([{ amountPaise: priced.totalPaise, date: outcome.payBy }]),
        status: "kept",
        transcriptRef: null,
      });
    }
    if ("promise" in outcome && outcome.promise) {
      const rest = differencePaise(priced.totalPaise, outcome.partInBank ?? 0);
      timeline.push({
        at: at(outcome.promise.on, "18:40"),
        type: "promise",
        actor: "customer",
        summary: `Promised the remaining ${formatInr(rest)} by ${formatDate(outcome.promise.payBy)} on the pay link`,
        payload: null,
      });
      promises.push({
        ...base,
        $id: id(`p${pad(n + 1)}`),
        invoiceId,
        source: "link",
        instalments: JSON.stringify([{ amountPaise: rest, date: outcome.promise.payBy }]),
        status: "approved",
        transcriptRef: null,
      });
    }
    if ("disputedOn" in outcome) {
      timeline.push({
        at: at(outcome.disputedOn, "13:20"),
        type: "dispute",
        actor: "customer",
        summary: `${outcome.reason}. The Ladder is paused until you resolve it.`,
        payload: null,
      });
    }
    if (paidOn) {
      timeline.push({
        at: at(paidOn, "15:00"),
        type: "payment",
        actor: "owner",
        summary: `Payment of ${formatInr(priced.totalPaise)} confirmed against the bank statement`,
        payload: JSON.stringify({ amountPaise: priced.totalPaise }),
      });
    }
    if (seed.customer === "gupta" && "open" in outcome) {
      timeline.push(
        {
          at: at("2026-10-02", "12:40"),
          type: "consent",
          actor: "customer",
          summary: "Agreed to reminder calls, 10 AM to 6 PM, on the pay link",
          payload: null,
        },
        {
          at: at("2026-10-16", "19:05"),
          type: "link_opened",
          actor: "customer",
          summary: "Opened the pay link and read it in Hindi; no reply",
          payload: null,
        },
      );
    }

    timeline
      .sort((a, b) => a.at.localeCompare(b.at))
      .forEach((event, k) => events.push({ ...base, $id: id(`e${pad(n + 1)}_${pad(k + 1)}`), invoiceId, ...event }));

    invoices.push({
      ...base,
      $id: invoiceId,
      number,
      docType: priced.docType,
      customerId: customer.$id,
      issueDate: seed.issued,
      dueDate,
      agreedDueDate: null,
      taxablePaise: priced.taxablePaise,
      cgstPaise: priced.cgstPaise,
      sgstPaise: priced.sgstPaise,
      igstPaise: priced.igstPaise,
      roundOffPaise: priced.roundOffPaise,
      totalPaise: priced.totalPaise,
      paidPaise: paidOn ? priced.totalPaise : 0,
      status: paidOn ? "paid" : "disputedOn" in outcome ? "disputed" : "sent",
      ladderStage,
      pausedUntil: "promise" in outcome && outcome.promise ? outcome.promise.payBy : null,
      pauseReason: "disputedOn" in outcome ? "dispute" : "promise" in outcome && outcome.promise ? "promise" : null,
      payToken: null,
    });
  });

  // Bank statement 1: every matching case except Gupta's, which comes in statement 2.
  const open = (key: string) => {
    const customerId = customerOf(key).row.$id;
    return invoices.filter((i) => i.customerId === customerId && i.status !== "paid");
  };
  const first = (key: string) => {
    const [found] = open(key);
    if (!found) throw new Error(`no open invoice for ${key}`);
    return found;
  };
  const taxableOf = (invoice: InvoiceRow, gstRatePercent?: GstRate) =>
    sumPaise(
      (pricedLines.get(invoice.$id) ?? [])
        .filter((l) => gstRatePercent === undefined || l.gstRatePercent === gstRatePercent)
        .map((l) => l.taxablePaise),
    );
  const [barua1, barua2] = open("barua");
  if (!barua1 || !barua2) throw new Error("Barua Stores needs two open invoices");
  const roy = first("roy");
  const sen = first("sen");
  const das = first("das");
  const hotel = first("hotel");
  const brahmaputra = first("brahmaputra");
  const dasPart = partsInBank.get(das.$id);
  if (dasPart === undefined) throw new Error("Das & Sons needs a part payment");
  const hotelTds = percentOfPaise(taxableOf(hotel, 18), 200);
  const brahmaputraTds = percentOfPaise(taxableOf(brahmaputra), 10);

  // Each credit already carries the match the Bank page will suggest, so the
  // forecast does not count money that is in the bank twice. Nothing is
  // confirmed: the Owner does that on the Bank page.
  const suggest = (kind: NonNullable<BankTxnRow["matchKind"]>, allocations: BankAllocation[]) => ({
    matchStatus: "suggested" as const,
    matchKind: kind,
    allocations: JSON.stringify(allocations),
  });
  const statement: Omit<BankTxnRow, "$id" | "workspaceId">[] = [
    {
      date: "2026-10-14",
      narration: "NEFT CR-UTIB0001234-ROY FURNISHINGS-KOLKATA",
      utr: "UTIBN52628734120",
      amountPaise: sumPaise([roy.totalPaise, 50_000]),
      ...suggest("overpay", [{ invoiceId: roy.$id, amountPaise: roy.totalPaise }]),
    },
    {
      date: "2026-10-23",
      narration: `NEFT CR-SBIN0004321-SEN HANDICRAFTS-${sen.number}`,
      utr: "SBINN52629610447",
      amountPaise: sen.totalPaise,
      ...suggest("exact", [{ invoiceId: sen.$id, amountPaise: sen.totalPaise }]),
    },
    {
      date: "2026-10-26",
      narration: "NEFT CR-PUNB0123400-HOTEL GOMATI VIEW-AGARTALA",
      utr: "PUNBN52629933815",
      amountPaise: differencePaise(hotel.totalPaise, hotelTds),
      ...suggest("tds", [
        { invoiceId: hotel.$id, amountPaise: differencePaise(hotel.totalPaise, hotelTds), tdsPaise: hotelTds },
      ]),
    },
    {
      date: "2026-10-27",
      narration: "NEFT CR-HDFC0000456-M/S BARUA STORES PVT LTD",
      utr: "HDFCN52630012988",
      amountPaise: sumPaise([barua1.totalPaise, barua2.totalPaise]),
      ...suggest("multi", [
        { invoiceId: barua1.$id, amountPaise: barua1.totalPaise },
        { invoiceId: barua2.$id, amountPaise: barua2.totalPaise },
      ]),
    },
    {
      date: "2026-10-29",
      narration: "UPI/CR/430219876543/PHONEPE TRANSFER",
      utr: "430219876543",
      amountPaise: 1_500_000,
      matchStatus: "unmatched",
      matchKind: "unknown",
      allocations: null,
    },
    {
      date: "2026-10-30",
      narration: `IMPS/P2A/430315550921/DAS AND SONS/${das.number.replace(/\/0*/g, " ")}`,
      utr: "430315550921",
      amountPaise: dasPart,
      ...suggest("part", [{ invoiceId: das.$id, amountPaise: dasPart }]),
    },
    {
      date: "2026-10-31",
      narration: "NEFT CR-ICIC0000789-BRAHMAPUTRA HOME STORES PVT LTD-TDS",
      utr: "ICICN52630477160",
      amountPaise: differencePaise(brahmaputra.totalPaise, brahmaputraTds),
      ...suggest("tds", [
        {
          invoiceId: brahmaputra.$id,
          amountPaise: differencePaise(brahmaputra.totalPaise, brahmaputraTds),
          tdsPaise: brahmaputraTds,
        },
      ]),
    },
  ];
  const bank_txns: BankTxnRow[] = statement.map((line) => ({
    ...base,
    $id: `bt_${fnv(`${workspaceId}|${line.date}|${line.amountPaise}|${line.utr}`)}${fnv(`${line.narration}|${workspaceId}`)}`,
    ...line,
  }));

  const cashItems: Omit<CashItemRow, "$id" | "workspaceId">[] = [
    { kind: "rent", date: "2026-11-05", amountPaise: 1_800_000, recurrence: "monthly", label: "Workshop rent" },
    {
      kind: "supplier",
      date: "2026-11-07",
      amountPaise: 850_000,
      recurrence: null,
      label: "Power bill and raw bamboo",
    },
    {
      kind: "salary",
      date: SALARY_DAY,
      amountPaise: 15_800_000,
      recurrence: "monthly",
      label: "Salaries: 8 artisans and 1 accountant",
    },
  ];
  const cash_items: CashItemRow[] = cashItems.map((item, n) => ({ ...base, $id: id(`k${n + 1}`), ...item }));

  return {
    workspaces: [workspace],
    customers,
    invoices,
    invoice_lines,
    events,
    promises,
    bank_txns,
    cash_items,
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** The 13 characters after the state code, plus "Z" and the check character. */
function withCheckDigit(first13: string): string {
  const first14 = `${first13}Z`;
  return first14 + gstinCheckDigit(first14);
}
