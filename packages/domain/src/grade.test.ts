import { describe, expect, it } from "vitest";
import { grade, gradeCustomer } from "./index.ts";

const TODAY = "2026-11-02";
const NONE = { disputeDates: [] as string[], brokenPromiseDates: [] as string[] };

describe("grade", () => {
  it("is A at 7 days late when there is no Dispute in the last 6 months", () => {
    expect(grade({ today: TODAY, paidDaysLate: [7], openDueDates: [], ...NONE })).toMatchObject({
      grade: "A",
      avgDelayDays: 7,
      reason: "usually pays 7 days late",
    });
  });

  it("is A when they pay on time", () => {
    expect(grade({ today: TODAY, paidDaysLate: [0, 0], openDueDates: [], ...NONE }).grade).toBe("A");
  });

  it("is B, not A, when a Dispute falls on the first day of the 6-month window", () => {
    // 2 Nov 2026 minus 6 calendar months is 2 May 2026.
    const result = grade({
      today: TODAY,
      paidDaysLate: [3],
      openDueDates: [],
      disputeDates: ["2026-05-02"],
      brokenPromiseDates: [],
    });
    expect(result.grade).toBe("B");
    expect(result.reason).toContain("Dispute");
  });

  it("is A again when the only Dispute is the day before that window", () => {
    const result = grade({
      today: TODAY,
      paidDaysLate: [3],
      openDueDates: [],
      disputeDates: ["2026-05-01"],
      brokenPromiseDates: [],
    });
    expect(result.grade).toBe("A");
    expect(result.reason).not.toContain("Dispute");
  });

  it("is B at 8 days late, and still B at exactly 30", () => {
    expect(grade({ today: TODAY, paidDaysLate: [8], openDueDates: [], ...NONE }).grade).toBe("B");
    expect(grade({ today: TODAY, paidDaysLate: [30], openDueDates: [], ...NONE }).grade).toBe("B");
  });

  it("is C when the average is over 30 days late", () => {
    const result = grade({ today: TODAY, paidDaysLate: [31], openDueDates: [], ...NONE });
    expect(result.grade).toBe("C");
    expect(result.reason).toContain("usually pays 31 days late");
  });

  it("rounds the average half up, so 14 and 10 days late is 12", () => {
    const result = grade({
      today: TODAY,
      paidDaysLate: [14, 10],
      openDueDates: ["2026-09-25"],
      ...NONE,
    });
    expect(result).toMatchObject({
      grade: "B",
      avgDelayDays: 12,
      reason: "usually pays 12 days late; this one is 38 days late",
    });
  });

  it("is C when a Promise was broken 90 days ago, even if they otherwise pay on time", () => {
    // 4 Aug 2026 is 90 days before 2 Nov 2026.
    const result = grade({
      today: TODAY,
      paidDaysLate: [0],
      openDueDates: [],
      disputeDates: [],
      brokenPromiseDates: ["2026-08-04"],
    });
    expect(result.grade).toBe("C");
    expect(result.reason).toContain("Promise was broken");
  });

  it("is A when that Promise was broken a day earlier than 90 days", () => {
    expect(
      grade({
        today: TODAY,
        paidDaysLate: [0],
        openDueDates: [],
        disputeDates: [],
        brokenPromiseDates: ["2026-08-03"],
      }).grade,
    ).toBe("A");
  });

  it("is C when an Invoice is still open 90 days past its due date", () => {
    const result = grade({
      today: TODAY,
      paidDaysLate: [0],
      openDueDates: ["2026-08-04"],
      ...NONE,
    });
    expect(result.grade).toBe("C");
    expect(result.reason).toContain("an Invoice is 90 days past due");
  });

  it("stays A when the open Invoice is 89 days late and they pay on time", () => {
    const result = grade({ today: TODAY, paidDaysLate: [0], openDueDates: ["2026-08-05"], ...NONE });
    expect(result.grade).toBe("A");
    expect(result.reason).toContain("this one is 89 days late");
  });

  it("is B, with no invented average, when nothing has been paid and nothing is 90 days open", () => {
    expect(grade({ today: TODAY, paidDaysLate: [], openDueDates: [], ...NONE })).toEqual({
      grade: "B",
      avgDelayDays: null,
      reason: "no Invoice paid yet",
    });
  });

  it("is C from a 90-day-open Invoice even when nothing has been paid", () => {
    const result = grade({ today: TODAY, paidDaysLate: [], openDueDates: ["2026-08-04"], ...NONE });
    expect(result.grade).toBe("C");
    expect(result.reason).toContain("no Invoice paid yet");
  });
});

describe("gradeCustomer", () => {
  it("counts days late from the payment date, and ignores another Customer's events", () => {
    const result = gradeCustomer(
      TODAY,
      [
        { id: "i1", dueDate: "2026-06-06", status: "paid" },
        { id: "i2", dueDate: "2026-09-25", status: "sent" },
      ],
      [
        { invoiceId: "i1", type: "payment", date: "2026-06-20" },
        { invoiceId: "other", type: "dispute", date: "2026-10-01" },
      ],
      [],
    );
    expect(result).toMatchObject({ grade: "B", avgDelayDays: 14 });
    expect(result.reason).toBe("usually pays 14 days late; this one is 38 days late");
  });

  it("treats a broken Promise's instalment date as the day it broke", () => {
    const result = gradeCustomer(
      TODAY,
      [{ id: "i1", dueDate: "2026-06-06", status: "paid" }],
      [{ invoiceId: "i1", type: "payment", date: "2026-06-06" }],
      [{ invoiceId: "i1", status: "broken", dates: ["2026-08-04"] }],
    );
    expect(result.grade).toBe("C");
  });

  it("does not let a kept Promise or a draft change the grade", () => {
    const result = gradeCustomer(
      TODAY,
      [
        { id: "i1", dueDate: "2026-06-06", status: "paid" },
        { id: "draft", dueDate: "2026-01-01", status: "draft" },
      ],
      [{ invoiceId: "i1", type: "payment", date: "2026-06-06" }],
      [{ invoiceId: "i1", status: "kept", dates: ["2026-08-04"] }],
    );
    expect(result.grade).toBe("A");
  });
});
