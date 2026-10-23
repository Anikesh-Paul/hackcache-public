import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  differencePaise,
  formatDate,
  nearestPaise,
  percentOfPaise,
  sharePaise,
  stateName,
  sumPaise,
  upiPayUri,
} from "./index.ts";

describe("paise sums", () => {
  it("adds a list of amounts, and an empty list is ₹0", () => {
    expect(sumPaise([11_800_005, -5, 100])).toBe(11_800_100);
    expect(sumPaise([])).toBe(0);
  });

  it("subtracts what was paid from what is owed", () => {
    expect(differencePaise(11_800_000, 2_000_000)).toBe(9_800_000);
    expect(differencePaise(100, 600)).toBe(-500);
  });

  it("refuses a float", () => {
    expect(() => sumPaise([1.5])).toThrow(/integer/);
    expect(() => differencePaise(1, 0.5)).toThrow(/integer/);
  });

  it("takes a percentage in basis points, rounded half up to the paisa", () => {
    expect(percentOfPaise(450_000, 200)).toBe(9_000); // 2% TDS on ₹4,500 installation
    expect(percentOfPaise(3_000_000, 10)).toBe(3_000); // 0.1% TDS on ₹30,000
    expect(percentOfPaise(333, 50)).toBe(2); // ₹3.33 × 0.5% = 1.665 paise → 2
  });

  it("splits an amount into equal shares, rounded half up to the paisa", () => {
    expect(sharePaise(15_800_000, 9)).toBe(1_755_556); // ₹1,58,000 over 9 pay packets
    expect(sharePaise(300, 2)).toBe(150);
    expect(() => sharePaise(300, 0)).toThrow(/parts/);
  });

  it("rounds to the nearest step for an 'about' figure, half up", () => {
    expect(nearestPaise(1_755_556, 50_000)).toBe(1_750_000); // about ₹17,500
    expect(nearestPaise(1_775_000, 50_000)).toBe(1_800_000);
    expect(nearestPaise(-1_755_556, 50_000)).toBe(-1_750_000);
    expect(() => nearestPaise(100, 0)).toThrow(/step/);
  });
});

describe("UPI pay link", () => {
  it("carries the payee, the amount in rupees with paise, and the invoice number", () => {
    expect(
      upiPayUri({
        vpa: "tripurabamboo@demo",
        payeeName: "Tripura Bamboo Works",
        amountPaise: 11_800_000,
        note: "TBW/26-27/0018",
      }),
    ).toBe("upi://pay?pa=tripurabamboo%40demo&pn=Tripura%20Bamboo%20Works&am=118000.00&cu=INR&tn=TBW%2F26-27%2F0018");
  });

  it("refuses a zero or negative amount", () => {
    expect(() => upiPayUri({ vpa: "a@b", payeeName: "A", amountPaise: 0, note: "x" })).toThrow(/amount/);
  });
});

describe("GST state codes", () => {
  it("names the state for a code", () => {
    expect(stateName("16")).toBe("Tripura");
    expect(stateName("18")).toBe("Assam");
    expect(stateName("19")).toBe("West Bengal");
  });

  it("is null for a code that is not a state", () => {
    expect(stateName("99")).toBeNull();
  });
});

describe("calendar days", () => {
  it("counts whole days between two dates", () => {
    expect(daysBetween("2026-09-25", "2026-11-02")).toBe(38);
    expect(daysBetween("2026-11-02", "2026-09-25")).toBe(-38);
  });

  it("adds days across months and years", () => {
    expect(addDays("2026-08-26", 30)).toBe("2026-09-25");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("dates for people", () => {
  it("writes a short day with the weekday, and a full date with the year", () => {
    expect(formatDate("2026-09-25")).toBe("Fri 25 Sep");
    expect(formatDate("2026-11-02", { year: true })).toBe("Mon 2 Nov 2026");
    expect(formatDate("2026-08-26", { weekday: false, year: true })).toBe("26 Aug 2026");
  });
});
