import { describe, expect, it } from "vitest";
import { proofReadout } from "./proof.ts";

describe("proofReadout", () => {
  it("shows the UTR, the parsed amount, the date and the payee", () => {
    const readout = proofReadout(
      JSON.stringify({
        utr: "609812345678",
        amountText: "₹60,000.00",
        dateText: "06/11/2026",
        payeeVpa: "tripura@upi",
        confidence: 0.9,
      }),
    );
    expect(readout).toMatchObject({
      utr: "609812345678",
      amount: "₹60,000",
      dateText: "06/11/2026",
      payeeVpa: "tripura@upi",
    });
  });

  it("reads nothing when the screenshot has not been read", () => {
    expect(proofReadout(null)).toBeNull();
    expect(proofReadout("{")).toBeNull();
  });
});
