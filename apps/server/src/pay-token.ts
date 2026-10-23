// Pay links: base64url(workspaceId ~ invoiceId ~ expiry) . base64url(HMAC).
// Checked with the secret alone, so a guessed or expired token is refused
// before anything is read from the database.
import { createHmac, timingSafeEqual } from "node:crypto";

export type PayRef = { workspaceId: string; invoiceId: string };

/** A checked link: the Invoice it names, and the token itself, which must still be the Invoice's own. */
export type PayLink = PayRef & { token: string };

export type PayCheck = { ok: true; ref: PayLink } | { ok: false; reason: "invalid" | "expired" };

export type PayTokens = {
  sign(ref: PayRef): string;
  verify(token: string): PayCheck;
};

/** Longer than a Demo world lives (30 days), so a link never dies before its world. */
const LIFETIME_S = 60 * 24 * 60 * 60;
const ID = /^[A-Za-z0-9._-]{1,36}$/;

export function payTokens(secret: string, now: () => number = Date.now): PayTokens {
  const mac = (payload: string) => createHmac("sha256", secret).update(payload).digest();
  return {
    sign({ workspaceId, invoiceId }) {
      if (!ID.test(workspaceId) || !ID.test(invoiceId)) throw new Error("not a row ID");
      const expiry = Math.floor(now() / 1000) + LIFETIME_S;
      const payload = `${workspaceId}~${invoiceId}~${expiry}`;
      return `${Buffer.from(payload).toString("base64url")}.${mac(payload).toString("base64url")}`;
    },
    verify(token) {
      const invalid: PayCheck = { ok: false, reason: "invalid" };
      const match = /^([A-Za-z0-9_-]{1,200})\.([A-Za-z0-9_-]{43})$/.exec(token);
      if (!match) return invalid;
      const payload = Buffer.from(match[1] ?? "", "base64url").toString();
      const given = Buffer.from(match[2] ?? "", "base64url");
      const expected = mac(payload);
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return invalid;
      // Signed by us, so the payload is ours; check its shape anyway.
      const [workspaceId = "", invoiceId = "", expiry = ""] = payload.split("~");
      if (!ID.test(workspaceId) || !ID.test(invoiceId) || !/^\d{1,12}$/.test(expiry)) return invalid;
      if (Number(expiry) * 1000 < now()) return { ok: false, reason: "expired" };
      return { ok: true, ref: { workspaceId, invoiceId, token } };
    },
  };
}
