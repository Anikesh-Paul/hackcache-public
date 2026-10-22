// Creates the `main` database, all tables, columns, indexes and the storage
// buckets. Idempotent: a second run reports "nothing to do".
//   pnpm appwrite:setup        (reads .env if present)
// Needs APPWRITE_SETUP_KEY: a key with database/table/column/index and bucket
// write scopes. Delete that key once the schema is final.
import { Client } from "node-appwrite";
import { schema } from "@tagada/appwrite";
import { setupAppwrite } from "@tagada/appwrite/setup";

const need = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (see .env.example)`);
  return v;
};

const client = new Client()
  .setEndpoint(need("APPWRITE_ENDPOINT"))
  .setProject(need("APPWRITE_PROJECT"))
  .setKey(need("APPWRITE_SETUP_KEY"));

const ops = await setupAppwrite(client, schema, (line) => console.log(line));
console.log(ops.length === 0 ? "Schema is up to date: nothing to do." : `Done: ${ops.length} change(s).`);
