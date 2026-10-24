// The Ladder's dependencies from the environment, for the workflow service.
import { adminClient, appwriteWorlds } from "./appwrite.ts";
import { mailsCustomers, resendMailer } from "./email.ts";
import { requireEnv } from "./env.ts";
import type { LadderDeps } from "./ladder.ts";

export function ladderDepsFromEnv(): LadderDeps {
  return {
    worlds: appwriteWorlds(adminClient()),
    mailer: resendMailer(process.env.RESEND_API_KEY, process.env.EMAIL_FROM_DOMAIN),
    demoInbox: process.env.DEMO_INBOX_EMAIL || null,
    mailCustomers: mailsCustomers(process.env.RESEND_API_KEY, process.env.EMAIL_FROM_DOMAIN),
    webOrigin: requireEnv("WEB_ORIGIN"),
  };
}
