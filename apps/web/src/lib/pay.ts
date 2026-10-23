// The Customer's side of the pay link. It talks only to the server, with the
// pay token; it never touches Appwrite or the Owner's session.
import type { PayInstalment, PaySlip } from "@tagada/appwrite";

export type { PayInstalment, PaySlip };

const SERVER_URL = import.meta.env.VITE_SERVER_URL;

/** Why the slip could not be shown or an action failed: the server's error code. */
export class PayError extends Error {
  constructor(
    readonly code: string,
    readonly reason?: string,
  ) {
    super(code);
  }
}

async function call(token: string, path: string, init?: RequestInit): Promise<PaySlip> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_URL}/api/pay/${encodeURIComponent(token)}${path}`, init);
  } catch {
    throw new PayError("offline");
  }
  const data = (await res.json().catch(() => null)) as (PaySlip & { error?: string; reason?: string }) | null;
  if (!res.ok || !data) throw new PayError(data?.error ?? "pay_unavailable", data?.reason);
  return data;
}

const post = (token: string, action: string, body: unknown = {}) =>
  call(token, `/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

export const pay = {
  slip: (token: string) => call(token, ""),
  paid: (token: string) => post(token, "paid"),
  plan: (token: string, instalments: PayInstalment[]) => post(token, "accept-plan", { instalments }),
  talkToOwner: (token: string) => post(token, "accept-plan", { talkToOwner: true }),
  dispute: (token: string, reason: string) => post(token, "dispute", { reason }),
  screenshot: (token: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return call(token, "/screenshot", { method: "POST", body: form });
  },
  audioUrl: (token: string) => `${SERVER_URL}/api/pay/${encodeURIComponent(token)}/audio`,
};
