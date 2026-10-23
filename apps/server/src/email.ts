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
   */
  idempotencyKey: string;
};

export type Mailer = {
  send(mail: Mail): Promise<{ ok: true; id: string } | { ok: false; error: string }>;
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
        const body = (await res.json().catch(() => null)) as { id?: unknown; message?: unknown } | null;
        if (res.ok && typeof body?.id === "string") return { ok: true, id: body.id };
        return { ok: false, error: `Resend ${res.status}: ${typeof body?.message === "string" ? body.message : "no reason given"}` };
      } catch (e) {
        return { ok: false, error: `Resend unreachable: ${e instanceof Error ? e.message : String(e)}` };
      }
    },
  };
}
