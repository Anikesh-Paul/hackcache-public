import { describe, expect, it } from "vitest";
import { checkProof, proofFromModel, type ProofExtract } from "./index.ts";

const TODAY = "2026-11-02";
const GUPTA_BALANCE = 11_800_000; // ₹1,18,000
const UTR = "609812345678";

function extracted(over: Partial<ProofExtract> = {}): ProofExtract {
  return {
    utr: UTR,
    amountText: "₹60,000.00",
    dateText: "01/11/2026",
    payeeVpa: "tripura@upi",
    confidence: 0.8,
    ...over,
  };
}

const noCredits: { utr: string | null; amountPaise: number }[] = [];

describe("checkProof", () => {
  it("says not found yet when the amount is part of the Invoice and the UTR is not in the bank", () => {
    const view = checkProof({ extracted: extracted(), today: TODAY, balancePaise: GUPTA_BALANCE, credits: noCredits });
    expect(view.result).toBe("not_found_yet");
    expect(view.label).toBe("Not found yet");
    expect(view.amountPaise).toBe(6_000_000);
  });

  it("turns that proof into Matched once a Bank credit has the same UTR and amount", () => {
    const before = checkProof({ extracted: extracted(), today: TODAY, balancePaise: GUPTA_BALANCE, credits: noCredits });
    expect(before.result).toBe("not_found_yet");
    const after = checkProof({
      extracted: extracted(),
      today: TODAY,
      balancePaise: GUPTA_BALANCE,
      credits: [{ utr: UTR, amountPaise: 6_000_000 }],
    });
    expect(after.result).toBe("found");
    expect(after.label).toBe("Matched ✓");
    expect(after.amountPaise).toBe(6_000_000);
  });

  it("says amount differs when the screenshot is more than the Invoice, and never says fake", () => {
    const view = checkProof({
      extracted: extracted({ amountText: "₹1,50,000.00" }),
      today: TODAY,
      balancePaise: GUPTA_BALANCE,
      credits: [{ utr: UTR, amountPaise: 6_000_000 }],
    });
    expect(view.result).toBe("amount_mismatch");
    expect(view.label).toBe("Amount differs");
    expect(`${view.label} ${view.note}`).not.toMatch(/fake/i);
  });

  it("parses the printed amount and ignores a number sitting beside it", () => {
    const model = {
      utr: UTR,
      amountText: "60000",
      amountPaise: 60000,
      amount: 60_000,
      dateText: "2026-11-01",
      payeeVpa: "tripura@upi",
      confidence: 60000,
    };
    const read = proofFromModel(model);
    expect(read?.amountText).toBe("60000");
    const view = checkProof({
      extracted: read ?? extracted(),
      today: TODAY,
      balancePaise: GUPTA_BALANCE,
      credits: [{ utr: UTR, amountPaise: 6_000_000 }],
    });
    expect(view.amountPaise).toBe(6_000_000);
    expect(view.result).toBe("found");
  });

  it("refuses a model reply that sends a number and no printed amount", () => {
    expect(proofFromModel({ utr: UTR, amountPaise: 6_000_000, dateText: "2026-11-01" })).toBeNull();
  });

  it("says amount differs when the printed amount is not an amount", () => {
    const view = checkProof({
      extracted: extracted({ amountText: "about sixty thousand" }),
      today: TODAY,
      balancePaise: GUPTA_BALANCE,
      credits: [],
    });
    expect(view.result).toBe("amount_mismatch");
    expect(view.amountPaise).toBeNull();
  });

  it("does not match a UTR whose Bank credit is a different amount", () => {
    const view = checkProof({
      extracted: extracted(),
      today: TODAY,
      balancePaise: GUPTA_BALANCE,
      credits: [{ utr: UTR, amountPaise: 5_000_000 }],
    });
    expect(view.result).toBe("amount_mismatch");
    expect(view.label).toBe("Amount differs");
  });

  it("does not call a screenshot dated after the Demo date matched", () => {
    const view = checkProof({
      extracted: extracted({ dateText: "03/11/2026" }),
      today: TODAY,
      balancePaise: GUPTA_BALANCE,
      credits: [{ utr: UTR, amountPaise: 6_000_000 }],
    });
    expect(view.result).toBe("not_found_yet");
    expect(view.label).not.toBe("Matched ✓");
  });
});
