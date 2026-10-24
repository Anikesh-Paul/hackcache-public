import { describe, expect, it } from "vitest";
import { addDays } from "@tagada/money";
import {
  AUTO_SEND_SWITCHES,
  DEFAULT_AUTO_SEND,
  ladderDay,
  nextAction,
  promiseBroken,
  type LadderInvoice,
  type PromiseFacts,
} from "./index.ts";

// Due on Tue 10 Nov: heads-up on 7 Nov, due-date reminder on 10 Nov, then 17 Nov, 24 Nov, 1 Dec, 10 Dec.
const invoice: LadderInvoice = {
  $id: "i1",
  customerId: "c1",
  totalPaise: 11_800_000,
  paidPaise: 0,
  status: "sent",
  dueDate: "2026-11-10",
  ladderStage: 0,
  pausedUntil: null,
  pauseReason: null,
};

const next = (over: Partial<LadderInvoice>, today: string, promises: PromiseFacts[] = [], autoSendStages = [1, 2]) =>
  nextAction({ invoice: { ...invoice, ...over }, promises, today, autoSendStages });

describe("nextAction", () => {
  it("never chases a cancelled Invoice", () => {
    expect(next({ status: "cancelled" }, "2026-11-17")).toEqual({ kind: "wait", why: "cancelled" });
  });

  it("counts whole IST days from the due date: the heads-up waits until 3 days before", () => {
    expect(next({}, "2026-11-06")).toEqual({ kind: "wait", why: "not_yet", on: "2026-11-07" });
    expect(next({}, "2026-11-07")).toEqual({ kind: "act", stage: 1, send: "auto", amountPaise: 11_800_000 });
  });

  it("sends the due-date reminder on the due date itself", () => {
    expect(next({ ladderStage: 1 }, "2026-11-10")).toMatchObject({ kind: "act", stage: 2 });
  });

  it("takes each stage once: a stage already taken is never offered again", () => {
    expect(next({ ladderStage: 2 }, "2026-11-10")).toEqual({ kind: "wait", why: "not_yet", on: "2026-11-17" });
  });

  it("catches a late Invoice up to the overdue reminder, but never skips a stage the Owner takes", () => {
    expect(next({ ladderStage: 0 }, "2026-12-20")).toMatchObject({ stage: 3 });
    expect(next({ ladderStage: 3 }, "2026-12-20")).toMatchObject({ stage: 4 });
  });

  it("pauses while a Promise or a Plan is running", () => {
    const promise: PromiseFacts = { status: "approved", instalments: [{ amountPaise: 11_800_000, date: "2026-11-20" }] };
    const plan: PromiseFacts = {
      status: "approved",
      instalments: [
        { amountPaise: 6_000_000, date: "2026-11-20" },
        { amountPaise: 5_800_000, date: "2026-12-16" },
      ],
    };
    expect(next({ ladderStage: 2 }, "2026-11-18", [promise])).toEqual({ kind: "wait", why: "paused" });
    expect(next({ ladderStage: 2 }, "2026-11-18", [plan])).toEqual({ kind: "wait", why: "paused" });
  });

  it("pauses while a Plan waits for the Owner's decision", () => {
    const asked: PromiseFacts = { status: "needs_owner", instalments: [{ amountPaise: 4_000_000, date: "2026-11-20" }] };
    expect(next({ ladderStage: 2 }, "2026-11-18", [asked])).toEqual({ kind: "wait", why: "paused" });
  });

  it("stops for a Dispute, whatever the date", () => {
    expect(next({ status: "disputed", ladderStage: 3 }, "2026-12-20")).toEqual({ kind: "wait", why: "disputed" });
  });

  it("resumes the day after a Promise is broken", () => {
    const promise: PromiseFacts = { status: "approved", instalments: [{ amountPaise: 11_800_000, date: "2026-11-24" }] };
    expect(next({ ladderStage: 3 }, "2026-11-24", [promise])).toEqual({ kind: "wait", why: "paused" });
    expect(next({ ladderStage: 3 }, "2026-11-25", [promise])).toMatchObject({ kind: "act", stage: 4 });
  });

  it("asks for the rest only, once part is paid", () => {
    expect(next({ ladderStage: 1, paidPaise: 2_000_000, status: "part" }, "2026-11-10")).toMatchObject({
      amountPaise: 9_800_000,
    });
  });

  it("takes the stage days from configuration", () => {
    const early = nextAction({ invoice, promises: [], today: "2026-11-05", autoSendStages: [1], stageDays: [-5, 0, 7, 14, 21, 30] });
    expect(early).toMatchObject({ kind: "act", stage: 1 });
  });

  it("never sends the Payment Demand Letter on its own, even if the stage is switched on", () => {
    const all = [1, 2, 3, 4, 5, 6];
    expect(next({ ladderStage: 4 }, "2026-12-01", [], all)).toMatchObject({ stage: 5, send: "owner" });
    expect(next({ ladderStage: 3 }, "2026-11-24", [], all)).toMatchObject({ stage: 4, send: "owner" });
    expect(next({ ladderStage: 5 }, "2026-12-10", [], all)).toMatchObject({ stage: 6, send: "owner" });
  });

  it("leaves a stage that is switched off for the Owner to send", () => {
    expect(next({ ladderStage: 2 }, "2026-11-17", [], [1, 2])).toMatchObject({ stage: 3, send: "owner" });
    expect(next({ ladderStage: 2 }, "2026-11-17", [], [1, 2, 3])).toMatchObject({ stage: 3, send: "auto" });
  });

  it("does nothing for a paid Invoice, or once the Ladder is climbed", () => {
    expect(next({ status: "paid", paidPaise: 11_800_000 }, "2026-11-10")).toEqual({ kind: "wait", why: "paid" });
    expect(next({ ladderStage: 6 }, "2027-01-10")).toEqual({ kind: "wait", why: "done" });
  });
});

describe("promiseBroken", () => {
  const plan: PromiseFacts = {
    status: "approved",
    instalments: [
      { amountPaise: 6_000_000, date: "2026-11-06" },
      { amountPaise: 5_800_000, date: "2026-12-02" },
    ],
  };

  it("is not broken on the day an instalment is due", () => {
    expect(promiseBroken(plan, invoice, "2026-11-06")).toBe(false);
  });

  it("is broken the day after an instalment that was not paid", () => {
    expect(promiseBroken(plan, invoice, "2026-11-07")).toBe(true);
  });

  it("is on track while what is still owed is no more than the instalments to come", () => {
    expect(promiseBroken(plan, { ...invoice, paidPaise: 6_000_000, status: "part" }, "2026-11-07")).toBe(false);
  });

  it("only an agreed Promise can be broken", () => {
    expect(promiseBroken({ ...plan, status: "needs_owner" }, invoice, "2026-11-07")).toBe(false);
  });
});

describe("ladderDay", () => {
  const second: LadderInvoice = { ...invoice, $id: "i2", dueDate: "2026-11-12", ladderStage: 1 };
  const other: LadderInvoice = { ...invoice, $id: "i3", customerId: "c2" };

  it("sends one message per Customer per IST day, the oldest Invoice first; the rest roll to tomorrow", () => {
    // Both owe a due-date reminder today; i1 fell due a day earlier, so it goes first.
    const steps = ladderDay({
      invoices: [{ ...second, dueDate: "2026-11-10" }, { ...invoice, ladderStage: 1, dueDate: "2026-11-09" }],
      promises: [],
      today: "2026-11-10",
      autoSendStages: [1, 2],
      sentToday: [],
    });
    expect(steps.map((s) => [s.invoiceId, s.stage, s.send])).toEqual([
      ["i1", 2, "auto"],
      ["i2", 2, "capped"],
    ]);
  });

  it("caps a Customer who was already sent a message today", () => {
    const steps = ladderDay({ invoices: [invoice, other], promises: [], today: "2026-11-07", autoSendStages: [1, 2], sentToday: ["c1"] });
    expect(steps.map((s) => [s.invoiceId, s.send])).toEqual([
      ["i1", "capped"],
      ["i3", "auto"],
    ]);
  });

  it("holds every step, the Owner's too, for a Customer already messaged today", () => {
    const steps = ladderDay({
      invoices: [{ ...invoice, ladderStage: 3, dueDate: "2026-10-01" }],
      promises: [],
      today: "2026-11-10",
      autoSendStages: [1, 2],
      sentToday: ["c1"],
    });
    expect(steps.map((s) => [s.stage, s.send])).toEqual([[4, "capped"]]);
  });

  it("does not cap what the Owner sends", () => {
    const steps = ladderDay({
      invoices: [
        { ...invoice, ladderStage: 3, dueDate: "2026-10-01" },
        { ...invoice, $id: "i2", ladderStage: 1, dueDate: "2026-11-10" },
      ],
      promises: [],
      today: "2026-11-10",
      autoSendStages: [1, 2],
      sentToday: [],
    });
    expect(steps.map((s) => [s.invoiceId, s.stage, s.send])).toEqual([
      ["i1", 4, "owner"],
      ["i2", 2, "auto"],
    ]);
  });

  it("skips paused Invoices, reading each Invoice's own Promises", () => {
    const steps = ladderDay({
      invoices: [invoice, other],
      promises: [{ invoiceId: "i1", status: "approved", instalments: [{ amountPaise: 1, date: "2026-11-30" }] }],
      today: "2026-11-07",
      autoSendStages: [1, 2],
      sentToday: [],
    });
    expect(steps.map((s) => s.invoiceId)).toEqual(["i3"]);
  });

  it("walks one Invoice through every stage by the Demo date, each once, on its day", () => {
    let current = { ...invoice };
    const taken: [string, number, string][] = [];
    for (let today = "2026-11-01"; today <= "2026-12-31"; today = addDays(today, 1)) {
      for (const step of ladderDay({ invoices: [current], promises: [], today, autoSendStages: [1, 2, 3], sentToday: [] })) {
        taken.push([today, step.stage, step.send]);
        // The run sends the auto stages; the Owner takes the rest the same day.
        current = { ...current, ladderStage: step.stage };
      }
    }
    expect(taken).toEqual([
      ["2026-11-07", 1, "auto"],
      ["2026-11-10", 2, "auto"],
      ["2026-11-17", 3, "auto"],
      ["2026-11-24", 4, "owner"],
      ["2026-12-01", 5, "owner"],
      ["2026-12-10", 6, "owner"],
    ]);
  });
});

describe("auto-send switches", () => {
  it("offer the three message stages, with the heads-up and due-date reminder on by default", () => {
    expect(AUTO_SEND_SWITCHES).toEqual([1, 2, 3]);
    expect(DEFAULT_AUTO_SEND).toEqual([1, 2]);
  });
});
