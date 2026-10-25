import { describe, expect, it } from "vitest";
import { blankCustomer, customerBody } from "./customer-form.ts";

describe("a new Customer", () => {
  it("is callable by default in a Demo world, and the body says so for the server to record", () => {
    const draft = blankCustomer();
    expect(draft.consentCalls).toBe(true);
    expect(customerBody({ ...draft, name: "Judge Stores", stateCode: "19" }).consentCalls).toBe(true);
  });

  it("keeps an unticked box unticked", () => {
    expect(customerBody({ ...blankCustomer(), consentCalls: false }).consentCalls).toBe(false);
  });
});
