// Starts the hello-world workflow task from the server and waits for it.
//   node apps/server/dist/start-hello.js          (Render shell)
//   pnpm --filter @tagada/server start-hello      (local, reads .env)
import { Render } from "@renderinc/sdk";
import { HELLO_TASK } from "./workflows.ts";

const run = await new Render().workflows.runTask(HELLO_TASK, ["server"]);
console.log(`hello task ${run.id}: ${run.status}`, JSON.stringify(run.results));
