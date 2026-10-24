import { describe, expect, it } from "vitest";
import { differencePaise, percentOfPaise } from "@tagada/money";
import {
  bankTxnId,
  importCount,
  importSummary,
  invoicesForMatch,
  matchCredit,
  matcherBrief,
  parseStatement,
  type MatchInvoice,
} from "./index.ts";

const NO_FAKE = /fake/i;

function invoice(over: Partial<MatchInvoice> & Pick<MatchInvoice, "id" | "number" | "customerName" | "totalPaise">): MatchInvoice {
  return {
    customerId: over.customerId ?? "c1",
    buyerType: "goods",
    issueDate: "2026-09-01",
    taxablePaise: over.totalPaise,
    paidPaise: 0,
    lines: [],
    ...over,
  };
}

const INV_12 = invoice({
  id: "i12",
  number: "INV/26-27/0012",
  customerName: "Barua Stores",
  totalPaise: 500_000,
  issueDate: "2026-09-14",
});

function credit(narration: string, amountPaise: number, reference = "UTR1") {
  return { date: "2026-10-30", narration, reference, amountPaise };
}

describe("matchCredit", () => {
  it("finds one Invoice from INV/26-27/0012, INV 26-27 12 and 0012", () => {
    const other = invoice({
      id: "i13",
      number: "INV/26-27/0013",
      customerName: "Someone Else",
      customerId: "c2",
      totalPaise: 500_000,
    });
    for (const narration of [
      "NEFT INV/26-27/0012",
      "paid INV 26-27 12",
      "ref 0012",
      "inv  26-27   12",
      "INV_26/27_12",
      "inv/2026-27/12",
      "INV - 26 - 27 - 0012",
      "inv.26.27.012",
    ]) {
      const match = matchCredit(credit(narration, INV_12.totalPaise), [other, INV_12]);
      expect(match.kind, narration).toBe("exact");
      expect(match.allocations.map((a) => a.invoiceId)).toEqual(["i12"]);
    }
  });

  it("says the named Customer has nothing open, not that the narration names no one, when their Invoices are paid", () => {
    const paid = { ...INV_12, paidPaise: INV_12.totalPaise };
    for (const narration of ["UPI BARUA STORES", "NEFT INV/26-27/0012"]) {
      const match = matchCredit(credit(narration, 500_000), [paid]);
      expect(match.kind, narration).toBe("unknown");
      expect(match.note, narration).toBe("Nothing is open for Barua Stores, so this is not applied to an Invoice.");
    }
    expect(matchCredit(credit("UPI SOMEONE", 500_000), [paid]).note).toBe(
      "Unknown deposit: no Invoice number and no Customer name in this narration.",
    );
  });

  it("keeps a paid Invoice from the books with nothing owed, so it is named but never matched", () => {
    const row = { $id: "i12", number: "INV/26-27/0012", customerId: "c1", issueDate: "2026-09-14", taxablePaise: 500_000, totalPaise: 500_000 };
    const books = invoicesForMatch({
      customers: [{ $id: "c1", name: "Barua Stores", buyerType: "goods" }],
      invoices: [
        // A covered Invoice can be paid with paise short of the total: the rest was kept back as TDS.
        { ...row, paidPaise: 499_500, status: "paid" },
        { ...row, $id: "i13", number: "INV/26-27/0013", paidPaise: 0, status: "draft" },
      ],
      lines: [],
    });
    expect(books.map((invoice) => [invoice.id, invoice.paidPaise])).toEqual([["i12", 500_000]]);
    const match = matchCredit(credit("NEFT BARUA STORES", 500), books);
    expect(match).toMatchObject({ kind: "unknown", allocations: [], note: "Nothing is open for Barua Stores, so this is not applied to an Invoice." });
  });

  it("does not treat a different series prefix as the same Invoice", () => {
    const tbw = invoice({ id: "tbw", number: "TBW/26-27/0012", customerName: "Other Stores", customerId: "c2", totalPaise: 500_000 });
    const match = matchCredit(credit("NEFT INV/26-27/0012", 500_000), [tbw, INV_12]);
    expect(match.allocations.map((a) => a.invoiceId)).toEqual(["i12"]);
  });

  it("does not let a bare padded number outvote the prefix or the Customer named beside it", () => {
    const tbw = invoice({ id: "tbw", number: "TBW/26-27/0012", customerName: "Other Stores", customerId: "c2", totalPaise: 500_000 });
    expect(matchCredit(credit("NEFT INV/26-27/0012", 500_000), [tbw]).kind).toBe("unknown");

    const das = invoice({ id: "das", number: "TBW/26-27/0018", customerName: "Das & Sons", customerId: "c3", totalPaise: 500_000 });
    const cheque = matchCredit(credit("CLG CHQ 000012 DAS AND SONS", 500_000), [INV_12, das]);
    expect(cheque.allocations.map((a) => a.invoiceId)).toEqual(["das"]);
    const padded = matchCredit(credit("NEFT 0012 DAS AND SONS", 500_000), [INV_12, das]);
    expect(padded.allocations.map((a) => a.invoiceId)).toEqual(["das"]);
  });

  it("does not take a serial that is buried in a longer number", () => {
    const match = matchCredit(credit("UPI/CR/430200120000/PHONEPE", 500_000, "430200120000"), [INV_12]);
    expect(match.kind).toBe("unknown");
    expect(match.allocations).toEqual([]);
  });

  it("treats M/s Barua Stores Pvt Ltd and barua stores as the same Customer", () => {
    for (const narration of ["NEFT CR-M/s Barua Stores Pvt Ltd", "barua stores", "M/S BARUA STORES PVT. LTD."]) {
      const match = matchCredit(credit(narration, INV_12.totalPaise), [INV_12]);
      expect(match.kind, narration).toBe("exact");
      expect(match.allocations[0]?.invoiceId).toBe("i12");
    }
  });

  it("treats Das & Sons and DAS AND SONS as the same Customer", () => {
    const das = invoice({ id: "das", number: "TBW/26-27/0018", customerName: "Das & Sons", totalPaise: 3_234_000 });
    const match = matchCredit(credit("IMPS/P2A/DAS AND SONS/TBW 26-27 18", 1_800_000), [das]);
    expect(match.kind).toBe("part");
    expect(match.allocations).toEqual([{ invoiceId: "das", amountPaise: 1_800_000 }]);
    expect(match.note).toContain("still owed");
    expect(differencePaise(das.totalPaise, 1_800_000)).toBe(1_434_000);
  });

  it("allocates one credit across Invoices oldest first, unless the narration names one", () => {
    const older = invoice({
      id: "old",
      number: "TBW/26-27/0008",
      customerName: "Barua Stores",
      totalPaise: 100_000,
      issueDate: "2026-08-01",
    });
    const newer = invoice({
      id: "new",
      number: "TBW/26-27/0009",
      customerName: "Barua Stores",
      totalPaise: 200_000,
      issueDate: "2026-09-01",
    });
    const both = matchCredit(credit("NEFT M/S BARUA STORES PVT LTD", 300_000), [newer, older]);
    expect(both.kind).toBe("multi");
    expect(both.allocations).toEqual([
      { invoiceId: "old", amountPaise: 100_000 },
      { invoiceId: "new", amountPaise: 200_000 },
    ]);

    const named = matchCredit(credit("NEFT TBW/26-27/0009 BARUA STORES", 200_000), [older, newer]);
    expect(named.kind).toBe("exact");
    expect(named.allocations).toEqual([{ invoiceId: "new", amountPaise: 200_000 }]);
  });

  it("covers both Invoices when the narration names the two of them", () => {
    const older = invoice({
      id: "old",
      number: "TBW/26-27/0008",
      customerName: "Barua Stores",
      totalPaise: 100_000,
      issueDate: "2026-08-01",
    });
    const newer = invoice({
      id: "new",
      number: "TBW/26-27/0009",
      customerName: "Barua Stores",
      totalPaise: 200_000,
      issueDate: "2026-09-01",
    });
    const match = matchCredit(credit("TBW/26-27/0009 and TBW 26-27 8", 300_000), [newer, older]);
    expect(match.kind).toBe("multi");
    expect(match.allocations.map((a) => a.invoiceId)).toEqual(["old", "new"]);
  });

  it("leaves the rest of a part payment owed, and does not call the Invoice paid", () => {
    const match = matchCredit(credit("BARUA STORES", 200_000), [INV_12]);
    expect(match.kind).toBe("part");
    expect(match.allocations).toEqual([{ invoiceId: "i12", amountPaise: 200_000 }]);
    expect(match.note).toContain("still owed");
    expect(JSON.stringify(match)).not.toMatch(/paid/i);
  });

  it("flags a shortfall of exactly 1%, 2% or 10% of taxable value as possible TDS", () => {
    const bill = invoice({
      id: "bill",
      number: "TBW/26-27/0003",
      customerName: "Roy Furnishings",
      buyerType: "services",
      taxablePaise: 1_000_000,
      totalPaise: 1_000_000,
    });
    for (const bps of [100, 200, 1000]) {
      const short = percentOfPaise(bill.taxablePaise, bps);
      const match = matchCredit(credit("ROY FURNISHINGS", differencePaise(bill.totalPaise, short)), [bill]);
      expect(match.kind, String(bps)).toBe("tds");
      expect(match.allocations).toEqual([{ invoiceId: "bill", amountPaise: differencePaise(bill.totalPaise, short), tdsPaise: short }]);
      expect(match.note.toLowerCase()).toContain("tds");
    }
  });

  it("does not flag a shortfall that is not one of those rates", () => {
    const bill = invoice({
      id: "bill",
      number: "TBW/26-27/0003",
      customerName: "Roy Furnishings",
      taxablePaise: 1_000_000,
      totalPaise: 1_000_000,
    });
    const match = matchCredit(credit("ROY FURNISHINGS", differencePaise(bill.totalPaise, 30_000)), [bill]);
    expect(match.kind).toBe("part");
  });

  it("flags 2% of the installation line for a services Customer, not 2% of the goods", () => {
    const hotel = invoice({
      id: "hotel",
      number: "TBW/26-27/0022",
      customerName: "Hotel Gomati View",
      buyerType: "services",
      taxablePaise: 3_450_000,
      totalPaise: 4_000_000,
      lines: [
        { taxablePaise: 3_000_000, gstRateBp: 500, hsn: "940382" },
        { taxablePaise: 450_000, gstRateBp: 1800, hsn: "9987" },
      ],
    });
    const tds = percentOfPaise(450_000, 200);
    expect(tds).toBe(9_000);
    const match = matchCredit(credit("NEFT HOTEL GOMATI VIEW AGARTALA", differencePaise(hotel.totalPaise, tds)), [hotel]);
    expect(match.kind).toBe("tds");
    expect(match.allocations).toEqual([
      { invoiceId: "hotel", amountPaise: differencePaise(hotel.totalPaise, tds), tdsPaise: tds },
    ]);
    expect(match.note.toLowerCase()).toContain("installation");
    const wholeShort = percentOfPaise(hotel.taxablePaise, 200);
    const notInstallation = matchCredit(
      credit("NEFT HOTEL GOMATI VIEW", differencePaise(hotel.totalPaise, wholeShort)),
      [hotel],
    );
    expect(notInstallation.kind).not.toBe("tds");
  });

  it("does not call an 18% furniture line an installation line", () => {
    const shop = invoice({
      id: "shop",
      number: "TBW/26-27/0030",
      customerName: "Roy Furnishings",
      taxablePaise: 1_500_000,
      totalPaise: 1_640_000,
      lines: [
        { taxablePaise: 1_000_000, gstRateBp: 500, hsn: "460211" },
        { taxablePaise: 500_000, gstRateBp: 1800, hsn: "940360" },
      ],
    });
    const short = percentOfPaise(500_000, 200);
    const match = matchCredit(credit("ROY FURNISHINGS", differencePaise(shop.totalPaise, short)), [shop]);
    expect(match.note).not.toContain("installation");
  });

  it("flags 0.1% of taxable value for a large buyer", () => {
    const buyer = invoice({
      id: "big",
      number: "TBW/26-27/0024",
      customerName: "Brahmaputra Home Stores Pvt Ltd",
      buyerType: "large_394Q",
      taxablePaise: 3_000_000,
      totalPaise: 3_150_000,
      lines: [{ taxablePaise: 3_000_000, gstRateBp: 500, hsn: "460211" }],
    });
    const tds = percentOfPaise(3_000_000, 10);
    expect(tds).toBe(3_000);
    const match = matchCredit(
      credit("NEFT BRAHMAPUTRA HOME STORES PVT LTD TDS", differencePaise(buyer.totalPaise, tds)),
      [buyer],
    );
    expect(match.kind).toBe("tds");
    expect(match.allocations[0]).toMatchObject({ invoiceId: "big", tdsPaise: 3_000 });
    expect(match.note).toContain("0.1%");
    expect(match.note.toLowerCase()).toContain("large buyer");
  });

  it("calls a credit above the Invoice overpaid, and keeps the extra off the Invoice", () => {
    const roy = invoice({ id: "roy", number: "TBW/26-27/0007", customerName: "Roy Furnishings", totalPaise: 800_000 });
    const match = matchCredit(credit("ROY FURNISHINGS", 850_000), [roy]);
    expect(match.kind).toBe("overpay");
    expect(match.allocations).toEqual([{ invoiceId: "roy", amountPaise: 800_000 }]);
    expect(match.note).toContain("₹500");
  });

  it("leaves a deposit with no Customer and no Invoice number as an unknown deposit", () => {
    const match = matchCredit(credit("UPI/CR/430219876543/PHONEPE TRANSFER", 1_500_000, "430219876543"), [INV_12]);
    expect(match.kind).toBe("unknown");
    expect(match.allocations).toEqual([]);
    expect(match.note.toLowerCase()).toContain("unknown");
  });

  it("never uses the word fake", () => {
    const samples = [
      matchCredit(credit("BARUA STORES", INV_12.totalPaise), [INV_12]),
      matchCredit(credit("NOBODY", 100), [INV_12]),
      matchCredit(credit("BARUA STORES", 100), [INV_12]),
    ];
    for (const match of samples) expect(JSON.stringify(match)).not.toMatch(NO_FAKE);
  });
});

describe("bank credit ids", () => {
  const line = {
    workspaceId: "w1",
    date: "2026-10-30",
    amountPaise: 1_800_000,
    reference: "430315550921",
    narration: "IMPS DAS AND SONS",
  };

  it("builds a bt_ id from the date, amount and reference, stable for the same line", () => {
    const id = bankTxnId(line);
    expect(id).toMatch(/^bt_[0-9a-f]{16}$/);
    expect(bankTxnId(line)).toBe(id);
    expect(bankTxnId({ ...line, amountPaise: line.amountPaise + 1 })).not.toBe(id);
  });

  it("gives a re-exported line the same id when only the narration or the reference's case changed", () => {
    const id = bankTxnId(line);
    const reworded = { ...line, narration: "imps das and sons " };
    expect(bankTxnId(reworded)).toBe(id);
    const cash = { ...line, reference: "CASH DEP AGARTALA", narration: "CASH DEP AGARTALA" };
    expect(bankTxnId({ ...cash, reference: "cash dep  agartala" })).toBe(bankTxnId(cash));
  });

  it("counts a second import of the same lines, even reordered, as already imported", () => {
    const ids = ["bt_aaa", "bt_bbb", "bt_ccc"];
    const first = importCount(new Set(), ids);
    expect(first).toMatchObject({ already: 0, added: 3 });
    const again = importCount(new Set(first.freshIds), [...ids].reverse());
    expect(again).toMatchObject({ already: 3, added: 0, freshIds: [] });
    expect(importSummary(again.already, again.added)).toBe("3 already imported, 0 new");
  });

  it("counts a repeated line inside one file once", () => {
    expect(importCount(new Set(), ["bt_aaa", "bt_aaa"])).toMatchObject({ already: 1, added: 1 });
  });
});

describe("matcherBrief", () => {
  it("passes the three cases /proof shows", () => {
    const rows = matcherBrief();
    expect(rows.map((row) => row.expected)).toEqual(["i12, i12, i12", "Barua Stores", "Possible TDS"]);
    expect(rows.every((row) => row.pass)).toBe(true);
  });
});

describe("parseStatement", () => {
  it("reads a bank CSV, and parses the amount with the money parser", () => {
    const parsed = parseStatement(`date,narration,utr,amount
2026-11-01,"UPI/CR/609812345678/GUPTA TRADERS",609812345678,"₹60,000.00"
`);
    expect(parsed).toEqual({
      ok: true,
      credits: [
        {
          date: "2026-11-01",
          narration: "UPI/CR/609812345678/GUPTA TRADERS",
          reference: "609812345678",
          amountPaise: 6_000_000,
        },
      ],
    });
  });

  it("accepts a day-first date and a credit column", () => {
    const parsed = parseStatement("Txn Date,Particulars,Reference,Credit\n01/11/2026,GUPTA TRADERS,609812345678,60000\n");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.credits[0]).toMatchObject({ date: "2026-11-01", amountPaise: 6_000_000, reference: "609812345678" });
  });

  it("refuses a file with no amount column", () => {
    const parsed = parseStatement("date,narration\n2026-11-01,hello\n");
    expect(parsed.ok).toBe(false);
  });
});
