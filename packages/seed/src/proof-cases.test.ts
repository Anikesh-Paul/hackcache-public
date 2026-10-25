import { describe, expect, it } from "vitest";
import { odrCaseFile, type DocumentInvoice, type DocumentReminder } from "@tagada/domain";
import { runForecastCases } from "./proof-cases.ts";
import { seedWorld } from "./index.ts";

describe("forecast headline on /proof", () => {
  it("computes the seeded shortfall, then the spare, from the books", () => {
    const results = runForecastCases();
    expect(results.map((result) => result.actual)).toEqual([
      "Salary day in 8 days, ₹48,000 short",
      "Salary covered, ₹12,000 spare",
    ]);
    expect(results.every((result) => result.pass && result.area === "Forecast")).toBe(true);
  });
});

describe("Gupta's ODR case file from the seed", () => {
  const world = seedWorld({ workspaceId: "w64f0c2a91be7d3e85f10", ownerUserId: "64f0c2a91be7d3e85f10" });
  const [workspace] = world.workspaces;
  const gupta = world.customers.find((customer) => customer.name === "Gupta Traders");
  const invoice = world.invoices.find(
    (row) => row.customerId === gupta?.$id && row.totalPaise === 11_800_000 && row.status === "sent",
  );

  it("includes the stored call transcript excerpt and the Reminder history", () => {
    if (!workspace || !gupta || !invoice) throw new Error("Gupta's open Invoice is missing from the seed");
    const doc: DocumentInvoice = {
      $id: invoice.$id,
      number: invoice.number,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      totalPaise: invoice.totalPaise,
      paidPaise: invoice.paidPaise,
      status: invoice.status,
      ladderStage: invoice.ladderStage,
      pausedUntil: invoice.pausedUntil,
      pauseReason: invoice.pauseReason,
    };
    const reminders: DocumentReminder[] = world.reminders
      .filter((reminder) => reminder.invoiceId === invoice.$id)
      .map((reminder) => ({
        invoiceId: reminder.invoiceId,
        sentDate: reminder.sentDate,
        stage: reminder.stage,
        channel: reminder.channel,
        status: reminder.status,
      }));
    const file = odrCaseFile({
      seller: {
        businessName: workspace.businessName,
        address: workspace.address,
        gstin: workspace.gstin,
        upiVpa: workspace.upiVpa,
        ownerEmail: workspace.ownerEmail,
        udyamType: workspace.udyamType,
        udyamNumber: workspace.udyamNumber,
        isTrader: workspace.isTrader,
      },
      customer: { name: gupta.name, address: gupta.address, place: gupta.place },
      invoices: [doc],
      reminders,
      calls: world.calls
        .filter((call) => call.invoiceId === invoice.$id)
        .map((call) => ({ invoiceId: call.invoiceId, startedAt: call.startedAt, transcript: call.transcript })),
      today: workspace.today,
    });
    expect(file.reminders.map((line) => line.text)).toEqual([
      "Friendly heads-up, sent by email",
      "Due-date reminder, sent by email",
      "Overdue reminder with pay link, sent on WhatsApp",
    ]);
    expect(file.transcriptExcerpt).toContain("I will look at it and call you back.");
    expect(file.transcriptExcerpt).toMatch(/^Munim: नमस्ते Gupta जी, मैं Tripura Bamboo Works की ओर से AI सहायक मुनीम बोल रही हूँ।/);
    expect(world.calls).toHaveLength(1);
    // The case file's call is on the Invoice timeline too, on the same day.
    const [call] = world.calls;
    const onTimeline = world.events.filter((e) => e.invoiceId === invoice.$id && e.type === "call");
    expect(onTimeline.map((e) => e.at.slice(0, 10))).toEqual([call!.startedAt!.slice(0, 10)]);
    expect(onTimeline[0]?.actor).toBe("ai");
  });
});
