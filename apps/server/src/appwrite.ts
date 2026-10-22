import { Client, Query, TablesDB } from "node-appwrite";
import { DATABASE_ID } from "@tagada/appwrite";
import { requireEnv } from "./env.ts";

export function adminClient(): Client {
  return new Client()
    .setEndpoint(requireEnv("APPWRITE_ENDPOINT"))
    .setProject(requireEnv("APPWRITE_PROJECT"))
    .setKey(requireEnv("APPWRITE_KEY"));
}

/** One cheap read that needs the key's rows.read scope. */
export async function probeAppwrite(client: Client): Promise<void> {
  await new TablesDB(client).listRows({
    databaseId: DATABASE_ID,
    tableId: "workspaces",
    queries: [Query.limit(1)],
    total: false,
  });
}
