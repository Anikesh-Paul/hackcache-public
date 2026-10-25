import { beforeEach, describe, expect, it } from "vitest";
import type { PaySlip } from "@tagada/appwrite";
import { createApp } from "./app.ts";
import { memoryFiles, memoryStore } from "./memory-store.ts";
import { payTokens } from "./pay-token.ts";

const USER = "64f0c2a91be7d3e85f10";
const WORKSPACE = `w${USER}`;
const OWNER = [`read("user:${USER}")`, `update("user:${USER}")`];
const DAY = 24 * 60 * 60 * 1000;

let db: ReturnType<typeof memoryStore>;
let files: ReturnType<typeof memoryFiles>;
let app: ReturnType<typeof createApp>;
let now: number;
let spoken: string[];
let pending: Promise<void>[];

beforeEach(async () => {
  db = memoryStore();
  files = memoryFiles();
  now = Date.parse("2026-10-23T10:00:00Z");
  spoken = [];
  pending = [];
  app = createApp({
    probeAppwrite: async () => {},
    demo: {
      userFromJwt: async (jwt) => (jwt === "jwt-asha" ? USER : null),
      worlds: db.store,
      later: (task) => void pending.push(task),
      tokens: payTokens("test-secret", () => now),
    },
    files: files.files,
    voice: {
      async speak(text) {
        spoken.push(text);
        return new TextEncoder().encode(`mp3:${text.length}`);
      },
    },
  });
  await app.request("/api/demo/start", { method: "POST", headers: { authorization: "Bearer jwt-asha" } });
  while (pending.length) await pending.shift();
});

const customerId = (name: string) => db.table("customers").find((c) => c.name === name)?.$id;

/** The seeded open Invoice of a Customer, with its pay token. */
function openInvoice(name: string) {
  const found = db.table("invoices").find((i) => i.customerId === customerId(name) && i.status !== "paid");
  if (!found || typeof found.payToken !== "string") throw new Error(`no open invoice with a pay link for ${name}`);
  return { $id: found.$id, number: String(found.number), payToken: found.payToken };
}

const gupta = () => openInvoice("Gupta Traders");

const get = (token: string) => app.request(`/api/pay/${token}`);
const post = (token: string, action: string, body: unknown = {}) =>
  app.request(`/api/pay/${token}/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const eventsOf = (invoiceId: string) => db.table("events").filter((e) => e.invoiceId === invoiceId);
const inbox = () => db.table("inbox");

describe("pay tokens on the seeded Invoices", () => {
  it("every unpaid Invoice has a pay link", () => {
    const unpaid = db.table("invoices").filter((i) => i.status !== "paid");
    expect(unpaid.length).toBeGreaterThan(5);
    for (const invoice of unpaid) expect(invoice.payToken).toEqual(expect.any(String));
  });
});

describe("GET /api/pay/:token", () => {
  it("shows Gupta Traders their Invoice, what is owed and Plans inside the rule", async () => {
    const res = await get(gupta().payToken);
    expect(res.status).toBe(200);
    const slip = (await res.json()) as PaySlip;
    expect(slip).toMatchObject({
      today: "2026-11-02",
      from: { businessName: "Tripura Bamboo Works", upiVpa: "tripurabamboo@demo" },
      customer: { name: "Gupta Traders", lang: "hi" },
      invoice: { number: gupta().number, dueDate: "2026-09-25", totalPaise: 11_800_000, balancePaise: 11_800_000, daysLate: 38 },
      state: "owing",
      plan: null,
      screenshotSent: false,
      rule: { minFirstPct: 50, firstWithinDays: 7, restWithinDays: 30 },
    });
    expect(slip.choices[0]).toEqual([
      { amountPaise: 5_900_000, date: "2026-11-09" },
      { amountPaise: 5_900_000, date: "2026-12-02" },
    ]);
  });

  it("tells Roy Furnishings their payment is waiting for the bank to confirm, not how late it is", async () => {
    const slip = (await (await get(openInvoice("Roy Furnishings").payToken)).json()) as PaySlip;
    expect(slip.invoice.daysLate).toBeGreaterThan(0);
    expect(slip.state).toBe("paid_claim");
    // Roy never said he had paid, so the page asks for no screenshot and thanks him for nothing.
    expect(slip).toMatchObject({ screenshotSent: false, inBank: true });
    // A part payment in the bank (Das & Sons) still leaves the rest owing.
    expect(((await (await get(openInvoice("Das & Sons").payToken)).json()) as PaySlip).state).not.toBe("paid_claim");
  });

  it("refuses a guessed token without reading the database", async () => {
    const before = db.lists();
    const res = await get("0123456789abcdef0123456789abcdef");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "invalid_link" });
    expect((await post("abc.def", "paid")).status).toBe(404);
    expect(db.lists()).toBe(before);
  });

  it("refuses a link the Invoice no longer carries, such as one from before Reset demo", async () => {
    const old = gupta().payToken;
    now += DAY; // the reseeded world signs new links
    await app.request("/api/demo/reset", { method: "POST", headers: { authorization: "Bearer jwt-asha" } });
    while (pending.length) await pending.shift();
    expect(gupta().payToken).not.toBe(old);
    expect((await get(old)).status).toBe(404);
    expect((await post(old, "paid")).status).toBe(404);
    expect((await get(gupta().payToken)).status).toBe(200);
  });

  it("refuses an expired token without reading the database", async () => {
    const token = gupta().payToken;
    now += 61 * DAY;
    const before = db.lists();
    const res = await get(token);
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "link_expired" });
    expect(db.lists()).toBe(before);
  });
});

describe("POST /api/pay/:token/paid and /screenshot", () => {
  it("records 'already paid' for the Owner, once", async () => {
    const invoice = gupta();
    const res = await post(invoice.payToken, "paid");
    expect(res.status).toBe(200);
    expect(((await res.json()) as PaySlip).state).toBe("paid_claim");

    const claim = eventsOf(invoice.$id).find((e) => e.type === "paid_claim");
    expect(claim).toMatchObject({ actor: "customer", workspaceId: WORKSPACE, $permissions: OWNER });
    expect(inbox()).toEqual([
      expect.objectContaining({ kind: "paid_claim", refId: claim?.$id, read: false, $permissions: OWNER }),
    ]);
    expect(String(claim?.summary)).not.toMatch(/fake/i);

    await post(invoice.payToken, "paid");
    expect(inbox()).toHaveLength(1);
  });

  it("stores the screenshot for the Owner alone and tells the Inbox", async () => {
    const invoice = gupta();
    const form = new FormData();
    form.append("file", new File([new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])], "upi.jpg", { type: "image/jpeg" }));
    const res = await app.request(`/api/pay/${invoice.payToken}/screenshot`, { method: "POST", body: form });
    expect(res.status).toBe(200);
    const slip = (await res.json()) as PaySlip;
    expect(slip).toMatchObject({ state: "paid_claim", screenshotSent: true, inBank: false });

    const [fileId] = [...files.screenshots.keys()];
    expect(files.screenshots.get(fileId ?? "")).toMatchObject({ ownerUserId: USER });
    const event = eventsOf(invoice.$id).find((e) => e.type === "proof_uploaded");
    expect(JSON.parse(String(event?.payload))).toEqual({ fileId });
    expect(inbox()).toEqual([expect.objectContaining({ kind: "proof_uploaded", refId: event?.$id })]);
  });

  it("refuses a file that is not an image, or too big", async () => {
    const send = (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return app.request(`/api/pay/${gupta().payToken}/screenshot`, { method: "POST", body: form });
    };
    expect((await send(new File(["hello"], "note.txt", { type: "text/plain" }))).status).toBe(400);
    expect((await send(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", { type: "image/png" }))).status).toBe(
      400,
    );
    expect(files.screenshots.size).toBe(0);
  });
});

describe("POST /api/pay/:token/accept-plan", () => {
  it("records a Plan inside the rule as agreed and pauses the Ladder", async () => {
    const invoice = gupta();
    const before = (await (await get(invoice.payToken)).json()) as PaySlip;
    const res = await post(invoice.payToken, "accept-plan", { instalments: before.choices[0] });
    expect(res.status).toBe(200);
    const slip = (await res.json()) as PaySlip;
    expect(slip).toMatchObject({ state: "plan", plan: before.choices[0] });

    const promise = db.table("promises").find((p) => p.invoiceId === invoice.$id);
    expect(promise).toMatchObject({ source: "link", status: "approved", $permissions: OWNER });
    expect(JSON.parse(String(promise?.instalments))).toEqual(before.choices[0]);
    expect(db.table("invoices").find((i) => i.$id === invoice.$id)).toMatchObject({
      pauseReason: "plan",
      pausedUntil: "2026-12-02",
    });
    expect(inbox()).toEqual([expect.objectContaining({ kind: "plan_accepted" })]);

    const again = await post(invoice.payToken, "accept-plan", { instalments: before.choices[0] });
    expect(again.status).toBe(409);
  });

  it("asks the Owner about a Plan outside the rule", async () => {
    const invoice = gupta();
    const res = await post(invoice.payToken, "accept-plan", {
      instalments: [
        { amountPaise: 4_000_000, date: "2026-11-06" },
        { amountPaise: 7_800_000, date: "2026-12-02" },
      ],
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as PaySlip).state).toBe("asked");
    expect(db.table("promises").find((p) => p.invoiceId === invoice.$id)).toMatchObject({ status: "needs_owner" });
    expect(db.table("invoices").find((i) => i.$id === invoice.$id)).toMatchObject({ pauseReason: null });
    expect(inbox()).toEqual([expect.objectContaining({ kind: "needs_decision" })]);
  });

  it("refuses a Plan without both dates, and writes nothing", async () => {
    const writes = db.writes();
    const res = await post(gupta().payToken, "accept-plan", {
      instalments: [
        { amountPaise: 6_000_000, date: "2026-11-06" },
        { amountPaise: 5_800_000, date: null },
      ],
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_plan", reason: expect.stringContaining("date") });
    expect(db.writes()).toBe(writes);
  });

  it("passes 'talk to the Owner' to the Inbox without a Plan", async () => {
    const res = await post(gupta().payToken, "accept-plan", { talkToOwner: true });
    expect(res.status).toBe(200);
    expect(((await res.json()) as PaySlip).state).toBe("asked");
    expect(db.table("promises").filter((p) => p.invoiceId === gupta().$id)).toEqual([]);
    expect(inbox()).toEqual([expect.objectContaining({ kind: "needs_decision" })]);
  });
});

describe("POST /api/pay/:token/dispute", () => {
  it("sets the Invoice disputed and the Ladder paused", async () => {
    const invoice = gupta();
    const res = await post(invoice.payToken, "dispute", { reason: "Two chairs arrived broken" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as PaySlip).state).toBe("disputed");
    expect(db.table("invoices").find((i) => i.$id === invoice.$id)).toMatchObject({
      status: "disputed",
      pauseReason: "dispute",
      pausedUntil: null,
    });
    const event = eventsOf(invoice.$id).find((e) => e.type === "dispute");
    expect(event?.summary).toContain("Two chairs arrived broken");
    expect(inbox()).toEqual([expect.objectContaining({ kind: "dispute", refId: event?.$id })]);
  });

  it("needs a reason in words", async () => {
    expect((await post(gupta().payToken, "dispute", { reason: "  " })).status).toBe(400);
  });
});

describe("a paid Invoice", () => {
  it("shows as paid and takes no more actions", async () => {
    const paid = db.table("invoices").find((i) => i.status === "paid");
    if (!paid) throw new Error("no paid invoice");
    const token = payTokens("test-secret", () => now).sign({ workspaceId: WORKSPACE, invoiceId: paid.$id });
    expect(((await (await get(token)).json()) as PaySlip).state).toBe("paid");
    expect((await post(token, "paid")).status).toBe(409);
    expect((await post(token, "dispute", { reason: "x" })).status).toBe(409);
  });
});

describe("GET /api/pay/:token/audio", () => {
  it("reads the slip aloud in Hindi once, then plays the stored copy", async () => {
    const first = await app.request(`/api/pay/${gupta().payToken}/audio`);
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("audio/mpeg");
    // The web origin plays it with <audio>, which CORP same-origin would block.
    expect(first.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    await app.request(`/api/pay/${gupta().payToken}/audio`);
    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toContain("एक लाख अठारह हज़ार रुपये");
    expect(files.audio.size).toBe(1);
  });

  it("reads a Bengali page in Bengali, with the same voice path", async () => {
    const res = await app.request(`/api/pay/${gupta().payToken}/audio?lang=bn`);
    expect(res.status).toBe(200);
    expect(spoken.at(-1)).toContain("নমস্কার");
    expect(spoken.at(-1)).not.toContain("हिंदी");
    expect(spoken.at(-1)).toContain("টাকা");
    expect(spoken.at(-1)).not.toContain("₹");
  });

  it("reads an English page with spoken dates, not ISO ones", async () => {
    const res = await app.request(`/api/pay/${gupta().payToken}/audio?lang=en`);
    expect(res.status).toBe(200);
    expect(spoken.at(-1)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe("POST /api/invoices/:id/dispute", () => {
  it("lets the Owner mark their own Invoice disputed", async () => {
    const invoice = gupta();
    const res = await app.request(`/api/invoices/${invoice.$id}/dispute`, {
      method: "POST",
      headers: { authorization: "Bearer jwt-asha", "content-type": "application/json" },
      body: JSON.stringify({ reason: "Customer says the blinds were the wrong size" }),
    });
    expect(res.status).toBe(200);
    expect(db.table("invoices").find((i) => i.$id === invoice.$id)).toMatchObject({ status: "disputed", pauseReason: "dispute" });
    expect(eventsOf(invoice.$id).find((e) => e.type === "dispute")).toMatchObject({ actor: "owner" });
    expect(inbox()).toEqual([]);
  });

  it("is 401 without a session", async () => {
    const res = await app.request(`/api/invoices/${gupta().$id}/dispute`, { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
  });
});
