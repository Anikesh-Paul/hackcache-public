// Reminder emails through Resend. With no domain of our own, they go out from
// Resend's shared address, which only delivers to the Resend account's own
// email: the Demo inbox.

export type Mail = {
  /** "<business> via Tagada". */
  fromName: string;
  to: string;
  replyTo: string | null;
  subject: string;
  text: string;
  /**
   * Resend keeps it 24 hours and drops a second request under it, so an
   * email whose send was not noted (the process died) is not sent again.
   * A second request with a different body is refused (409), so the key
   * names the seeding of the world as well as the Reminder.
   */
  idempotencyKey: string;
};

/** `repeat`: Resend already holds the key for another request, so trying again cannot help. */
export type Mailer = {
  send(mail: Mail): Promise<{ ok: true; id: string } | { ok: false; error: string; repeat?: boolean }>;
};

/** A display name Resend takes as is: no quotes, angle brackets or line breaks. */
function displayName(name: string): string {
  return name.replace(/["<>\r\n\\]/g, "").trim();
}

export function resendMailer(apiKey: string | undefined, fromDomain: string | undefined): Mailer | null {
  if (!apiKey) return null;
  const from = `onboarding@${fromDomain || "resend.dev"}`;
  return {
    async send(mail) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
            "idempotency-key": mail.idempotencyKey,
          },
          body: JSON.stringify({
            from: `${displayName(mail.fromName)} <${from}>`,
            to: [mail.to],
            ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
            subject: mail.subject,
            text: mail.text,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        const body = (await res.json().catch(() => null)) as { id?: unknown; message?: unknown; name?: unknown } | null;
        if (res.ok && typeof body?.id === "string") return { ok: true, id: body.id };
        const error = `Resend ${res.status}: ${typeof body?.message === "string" ? body.message : "no reason given"}`;
        // A 409 is a used key; only "concurrent_idempotent_requests" (one still in flight) is worth another try.
        if (res.status === 409 && body?.name !== "concurrent_idempotent_requests") return { ok: false, error, repeat: true };
        return { ok: false, error };
      } catch (e) {
        return { ok: false, error: `Resend unreachable: ${e instanceof Error ? e.message : String(e)}` };
      }
    },
  };
}
