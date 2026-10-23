import { describe, expect, it } from "vitest";
import { checkGstin, invoiceTotals, sumPaise, type GstRate } from "@tagada/money";
import { gradeCustomer, invoiceStanding } from "@tagada/domain";
import { DEMO_TODAY, seedWorld, type World } from "./index.ts";

const ids = { workspaceId: "w64f0c2a91be7d3e85f10", ownerUserId: "64f0c2a91be7d3e85f10" };
const world = seedWorld(ids);

const customer = (name: string) => {
  const found = world.customers.find((c) => c.name === name);
  if (!found) throw new Error(`no customer ${name}`);
  return found;
};
const invoicesOf = (name: string) => world.invoices.filter((i) => i.customerId === customer(name).$id);
const openOf = (name: string) => invoicesOf(name).filter((i) => i.status !== "paid");
/** Grade from the seeded history. Payment dates are the IST day on the payment event. */
const gradeOf = (name: string) => {
  const invoices = invoicesOf(name);
  const ids = new Set(invoices.map((invoice) => invoice.$id));
  return gradeCustomer(
    DEMO_TODAY,
    invoices.map((invoice) => ({ id: invoice.$id, dueDate: invoice.dueDate, status: invoice.status })),
    world.events
      .filter((event) => ids.has(event.invoiceId))
      .map((event) => ({ invoiceId: event.invoiceId, type: event.type, date: event.at.slice(0, 10) })),
    world.promises
      .filter((promise) => ids.has(promise.invoiceId))
      .map((promise) => ({
        invoiceId: promise.invoiceId,
        status: promise.status,
        dates: (JSON.parse(promise.instalments) as { date: string }[]).map((instalment) => instalment.date),
      })),
  );
};

const standing = (invoiceId: string) => {
  const invoice = world.invoices.find((i) => i.$id === invoiceId)!;
  const promises = world.promises
    .filter((p) => p.invoiceId === invoiceId)
    .map((p) => ({ status: p.status, instalments: JSON.parse(p.instalments) }));
  return invoiceStanding(invoice, promises, DEMO_TODAY);
};
const allRows = (w: World) => Object.values(w).flat();

describe("seedWorld", () => {
  it("gives the same world every run", () => {
    expect(seedWorld(ids)).toEqual(world);
    expect(JSON.stringify(seedWorld(ids))).toBe(JSON.stringify(world));
  });

  it("holds 12 Customers, 31 Invoices with their lines, bank statement 1, events, Promises and cash items", () => {
    expect(world.workspaces).toHaveLength(1);
    expect(world.customers).toHaveLength(12);
    expect(world.invoices).toHaveLength(31);
    expect(world.invoice_lines.length).toBeGreaterThan(31);
    expect(world.bank_txns).toHaveLength(7);
    expect(world.events.length).toBeGreaterThan(31);
    expect(world.promises.length).toBeGreaterThan(0);
    expect(world.cash_items).toHaveLength(3);
  });

  it("puts every row in this workspace, under an ID no other world uses", () => {
    for (const row of allRows(world)) expect(row.workspaceId).toBe(ids.workspaceId);
    const other = seedWorld({ workspaceId: "w0000000000000000000a", ownerUserId: "0000000000000000000a" });
    const mine = new Set(allRows(world).map((r) => r.$id));
    for (const row of allRows(other)) expect(mine.has(row.$id)).toBe(false);
  });

  it("uses Appwrite-valid row IDs, unique per table, short enough for a reminder key", () => {
    for (const rows of Object.values(world)) {
      const seen = new Set(rows.map((r) => r.$id));
      expect(seen.size).toBe(rows.length);
      for (const row of rows) expect(row.$id).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/);
    }
    // reminders are keyed rem_<invoiceId>_s<stage>, at most 36 characters
    for (const invoice of world.invoices) expect(`rem_${invoice.$id}_s6`.length).toBeLessThanOrEqual(36);
  });

  it("opens on Mon 2 Nov 2026 with salary day Tue 10 Nov and ₹74,500 in the bank", () => {
    const [ws] = world.workspaces;
    expect(ws).toMatchObject({
      $id: ids.workspaceId,
      ownerUserId: ids.ownerUserId,
      businessName: "Tripura Bamboo Works",
      stateCode: "16",
      registrationType: "regular",
      udyamType: "micro",
      isTrader: false,
      today: "2026-11-02",
      salaryDay: "2026-11-10",
      openingCashPaise: 7_450_000,
      autoSendStages: [1, 2],
    });
    expect(ws?.gstin?.startsWith("16")).toBe(true);
    expect(JSON.parse(ws?.planRule ?? "")).toEqual({ minFirstPct: 50, firstWithinDays: 7, restWithinDays: 30 });
  });

  it("gives every GSTIN a valid check digit, in its Customer's state", () => {
    expect(checkGstin(world.workspaces[0]?.gstin ?? "")).toEqual({ ok: true });
    for (const c of world.customers) {
      expect(checkGstin(c.gstin ?? "")).toEqual({ ok: true });
      expect(c.gstin?.slice(0, 2)).toBe(c.stateCode);
    }
  });

  it("stores the totals money computes from each Invoice's lines", () => {
    for (const invoice of world.invoices) {
      const lines = world.invoice_lines.filter((l) => l.invoiceId === invoice.$id);
      const priced = invoiceTotals({
        registration: "regular",
        supplierStateCode: "16",
        placeOfSupplyStateCode: world.customers.find((c) => c.$id === invoice.customerId)!.stateCode!,
        aggregateTurnoverPaise: world.workspaces[0]!.aggregateTurnoverPaise!,
        lines: lines.map((l) => ({
          quantity: l.qtyMilli / 1000,
          ratePaise: l.ratePaise,
          discountPercent: l.discountBp / 100,
          gstRatePercent: (l.gstRateBp / 100) as GstRate,
        })),
      });
      expect(invoice).toMatchObject({
        docType: priced.docType,
        taxablePaise: priced.taxablePaise,
        cgstPaise: priced.cgstPaise,
        sgstPaise: priced.sgstPaise,
        igstPaise: priced.igstPaise,
        roundOffPaise: priced.roundOffPaise,
        totalPaise: priced.totalPaise,
      });
    }
  });

  it("numbers Invoices in one FY series in date order", () => {
    const sorted = [...world.invoices].sort((a, b) => a.issueDate.localeCompare(b.issueDate));
    expect(sorted.map((i) => i.number)).toEqual(sorted.map((_, n) => `TBW/26-27/${String(n + 1).padStart(4, "0")}`));
  });

  it("has Gupta Traders' ₹1,18,000 IGST Invoice, −₹0.05 round-off, 38 days late", () => {
    const gupta = customer("Gupta Traders");
    expect(gupta).toMatchObject({ stateCode: "19", place: "Kolkata", creditDays: 30, consentCalls: true });
    const [hero] = openOf("Gupta Traders");
    expect(hero).toMatchObject({
      issueDate: "2026-08-26",
      dueDate: "2026-09-25",
      taxablePaise: 11_238_100,
      igstPaise: 561_905,
      cgstPaise: 0,
      roundOffPaise: -5,
      totalPaise: 11_800_000,
      paidPaise: 0,
      status: "sent",
      ladderStage: 3,
    });
    expect(standing(hero!.$id)).toMatchObject({ state: "overdue", daysLate: 38 });
    const lines = world.invoice_lines.filter((l) => l.invoiceId === hero!.$id);
    expect(lines.every((l) => l.gstRateBp === 500 && l.discountBp === 0)).toBe(true);
  });

  it("grades Gupta Traders B, usually pays 12 days late", () => {
    const gupta = gradeOf("Gupta Traders");
    expect(gupta.grade).toBe("B");
    expect(gupta.avgDelayDays).toBe(12);
    expect(gupta.reason).toContain("usually pays 12 days late");
  });

  it("grades Sen Handicrafts A, Paul Gift House C, and names Debnath Crafts' Dispute", () => {
    expect(gradeOf("Sen Handicrafts").grade).toBe("A");
    expect(gradeOf("Paul Gift House").grade).toBe("C");
    expect(gradeOf("Debnath Crafts").reason).toContain("Dispute");
  });

  it("has open Invoices in every Ageing bucket, with Paul Gift House's ₹8,400 at 112 days", () => {
    const late = world.invoices.filter((i) => i.status !== "paid").map((i) => standing(i.$id).daysLate);
    expect(late.some((d) => d >= 1 && d <= 30)).toBe(true);
    expect(late.some((d) => d >= 31 && d <= 60)).toBe(true);
    expect(late.some((d) => d >= 61 && d <= 90)).toBe(true);
    expect(late.some((d) => d > 90)).toBe(true);
    const old = openOf("Paul Gift House").find((i) => standing(i.$id).daysLate === 112);
    expect(old?.totalPaise).toBe(840_000);
  });

  it("has Debnath Crafts' Dispute pausing the Ladder, and Chakma Emporium's kept Promise", () => {
    const [disputed] = openOf("Debnath Crafts");
    expect(disputed).toMatchObject({ status: "disputed", pauseReason: "dispute" });
    expect(
      world.events.some((e) => e.invoiceId === disputed!.$id && e.type === "dispute" && e.actor === "customer"),
    ).toBe(true);
    const chakma = invoicesOf("Chakma Emporium").map((i) => i.$id);
    expect(world.promises.some((p) => chakma.includes(p.invoiceId) && p.status === "kept")).toBe(true);
  });

  it("has a 10% discount line for Barua Stores and an 18% installation line for Hotel Gomati View", () => {
    const barua = invoicesOf("Barua Stores").map((i) => i.$id);
    expect(world.invoice_lines.some((l) => barua.includes(l.invoiceId) && l.discountBp === 1000)).toBe(true);
    const hotel = invoicesOf("Hotel Gomati View").map((i) => i.$id);
    expect(
      world.invoice_lines.some((l) => hotel.includes(l.invoiceId) && l.gstRateBp === 1800 && l.hsn === "9987"),
    ).toBe(true);
  });

  it("puts each bank case in statement 1, and no credit from Gupta Traders", () => {
    const amounts = world.bank_txns.map((t) => t.amountPaise);
    const total = (name: string, n = 0) => openOf(name)[n]!.totalPaise;
    expect(amounts).toContain(total("Sen Handicrafts")); // exact
    expect(amounts).toContain(1_800_000); // Das & Sons, part
    expect(amounts).toContain(total("Barua Stores", 0) + total("Barua Stores", 1)); // two Invoices
    expect(amounts).toContain(total("Roy Furnishings") + 50_000); // ₹500 over
    expect(amounts).toContain(1_500_000); // unknown UPI deposit
    expect(amounts).toContain(total("Hotel Gomati View") - 9_000); // 2% TDS on ₹4,500 installation
    expect(amounts).toContain(total("Brahmaputra Home Stores Pvt Ltd") - 3_000); // 0.1% TDS on ₹30,000
    expect(world.bank_txns.some((t) => /gupta/i.test(t.narration))).toBe(false);
    expect(world.bank_txns.every((t) => t.matchStatus !== "confirmed" && t.date < DEMO_TODAY)).toBe(true);
  });

  it("suggests each credit's match without confirming it, keeping TDS apart, and leaves the unknown deposit alone", () => {
    for (const t of world.bank_txns) {
      if (t.matchKind === "unknown") {
        expect(t).toMatchObject({ matchStatus: "unmatched", allocations: null });
        continue;
      }
      expect(t.matchStatus).toBe("suggested");
      const allocations = JSON.parse(t.allocations!) as { invoiceId: string; amountPaise: number }[];
      const allocated = sumPaise(allocations.map((a) => a.amountPaise));
      expect(t.matchKind === "overpay" ? allocated < t.amountPaise : allocated === t.amountPaise).toBe(true);
      for (const a of allocations) expect(world.invoices.find((i) => i.$id === a.invoiceId)?.status).toBe("sent");
    }
    const hotel = world.bank_txns.find((t) => t.matchKind === "tds" && /HOTEL/.test(t.narration))!;
    expect(JSON.parse(hotel.allocations!)).toEqual([
      { invoiceId: openOf("Hotel Gomati View")[0]!.$id, amountPaise: hotel.amountPaise, tdsPaise: 9_000 },
    ]);
  });

  it("has Das & Sons' remaining ₹14,340 promised for Fri 6 Nov, pausing the Ladder", () => {
    const [das] = openOf("Das & Sons");
    expect(das).toMatchObject({ totalPaise: 3_234_000, pausedUntil: "2026-11-06", pauseReason: "promise" });
    const promise = world.promises.find((p) => p.invoiceId === das!.$id);
    expect(promise?.status).toBe("approved");
    expect(JSON.parse(promise!.instalments)).toEqual([{ amountPaise: 1_434_000, date: "2026-11-06" }]);
    expect(standing(das!.$id).state).toBe("promised");
  });

  it("has rent, power and raw bamboo, and salaries due before the next salary day", () => {
    const items = world.cash_items.map((c) => [c.kind, c.date, c.amountPaise]);
    expect(items).toEqual([
      ["rent", "2026-11-05", 1_800_000],
      ["supplier", "2026-11-07", 850_000],
      ["salary", "2026-11-10", 15_800_000],
    ]);
  });

  it("gives every Invoice a timeline that starts when it was sent", () => {
    for (const invoice of world.invoices) {
      const events = world.events.filter((e) => e.invoiceId === invoice.$id).sort((a, b) => a.at.localeCompare(b.at));
      expect(events[0]).toMatchObject({ type: "sent", actor: "owner" });
      expect(events[0]?.at.startsWith(invoice.issueDate)).toBe(true);
      if (invoice.status === "paid") expect(events.some((e) => e.type === "payment")).toBe(true);
    }
  });

  it("never writes stage numbers or reminder keys into an event the Owner reads", () => {
    for (const e of world.events) expect(e.summary).not.toMatch(/rem_|stage \d/i);
  });
});
