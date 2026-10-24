import { describe, expect, it } from "vitest";
import { suggestedInBank, waitingInBank, type BankSuggestion } from "./index.ts";

const open = (id: string, totalPaise: number, paidPaise = 0) => ({ $id: id, totalPaise, paidPaise, status: "sent" as const });

describe("Invoices with an unconfirmed Bank credit suggested against them", () => {
  it("names each Invoice a suggested credit pays in full, with the money in the bank", () => {
    const credits: BankSuggestion[] = [
      { matchStatus: "suggested", allocations: [{ invoiceId: "roy", amountPaise: 2_381_000 }] },
      // Barua: one credit for two Invoices.
      { matchStatus: "suggested", allocations: [{ invoiceId: "b1", amountPaise: 1_000_000 }, { invoiceId: "b2", amountPaise: 500_000 }] },
    ];
    const waiting = waitingInBank(credits, [open("roy", 2_381_000), open("b1", 1_000_000), open("b2", 500_000), open("kalita", 2_750_000)]);
    expect([...waiting.entries()]).toEqual([
      ["roy", 2_381_000],
      ["b1", 1_000_000],
      ["b2", 500_000],
    ]);
  });

  it("counts TDS kept back towards what the Invoice owes, but not as money in the bank", () => {
    const credits: BankSuggestion[] = [
      { matchStatus: "suggested", allocations: [{ invoiceId: "hotel", amountPaise: 980_000, tdsPaise: 20_000 }] },
    ];
    expect(waitingInBank(credits, [open("hotel", 1_000_000)]).get("hotel")).toBe(980_000);
  });

  it("leaves out a part payment, a confirmed credit, an unmatched one and a paid Invoice", () => {
    const credits: BankSuggestion[] = [
      { matchStatus: "suggested", allocations: [{ invoiceId: "das", amountPaise: 500_000 }] },
      { matchStatus: "confirmed", allocations: [{ invoiceId: "sen", amountPaise: 1_000_000 }] },
      { matchStatus: "unmatched", allocations: [] },
      { matchStatus: "suggested", allocations: [{ invoiceId: "old", amountPaise: 1_000_000 }] },
    ];
    const invoices = [open("das", 1_434_000), open("sen", 1_000_000), { ...open("old", 1_000_000, 1_000_000), status: "paid" as const }];
    expect(waitingInBank(credits, invoices).size).toBe(0);
    // A part payment still shows what is in the bank against the Invoice.
    expect(suggestedInBank(credits).get("das")).toBe(500_000);
  });

  it("counts what is still owed after part payments already recorded", () => {
    const credits: BankSuggestion[] = [{ matchStatus: "suggested", allocations: [{ invoiceId: "das", amountPaise: 934_000 }] }];
    expect(waitingInBank(credits, [open("das", 1_434_000, 500_000)]).get("das")).toBe(934_000);
  });
});
