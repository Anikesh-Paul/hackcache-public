import { describe, expect, it } from "vitest";
import { DEFAULT_PLAN_RULE } from "@tagada/domain";
import { amountSaid, personas } from "./call-script.ts";

const gupta = { owedPaise: 11_800_000, today: "2026-11-02", rule: DEFAULT_PLAN_RULE };

describe("persona cards", () => {
  it("give Gupta ji the ₹40k offer, then साठ हज़ार on Friday", () => {
    const [cooperative, short, dispute] = personas(gupta);
    expect(cooperative).toMatchObject({ key: "cooperative", title: "Cooperative" });
    expect(cooperative?.lines[0]?.hi).toBe("हाँ जी, शुक्रवार को पूरे एक लाख अठारह हज़ार रुपये दे दूँगा।");
    expect(short?.lines.map((l) => l.hi)).toEqual([
      "इस हफ़्ते मुश्किल है। शुक्रवार को चालीस हज़ार रुपये दे सकता हूँ, बाकी अगले महीने।",
      "ठीक है, शुक्रवार को साठ हज़ार रुपये दे दूँगा, बाकी बुधवार, दो दिसंबर तक।",
    ]);
    expect(short?.lines.map((l) => l.en)).toEqual([
      "It's hard this week. I can pay ₹40,000 on Friday, the rest next month.",
      "OK, I'll pay ₹60,000 on Friday and the rest by Wed 2 Dec.",
    ]);
    expect(dispute?.key).toBe("dispute");
  });

  it("keep the second offer at or above the rule's minimum", () => {
    const [, short] = personas({ ...gupta, owedPaise: 10_900_000 }); // minimum ₹54,500
    expect(short?.lines[1]?.en).toMatch(/^OK, I'll pay ₹60,000/);
  });
});

describe("amountSaid", () => {
  it("finds an amount the agent said from the words it was handed", () => {
    const known = new Map([
      ["उनसठ हज़ार रुपये", 5_900_000],
      ["एक लाख अठारह हज़ार रुपये", 11_800_000],
    ]);
    expect(amountSaid("क्या आप उनसठ हज़ार रुपये शुक्रवार तक दे पाएँगे?", known)).toBe(5_900_000);
    expect(amountSaid("नमस्ते जी", known)).toBeNull();
  });
});
