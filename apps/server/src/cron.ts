// Render Cron Job `app-cron`, scheduled 30 4 * * * UTC (10:00 IST): starts
// `dailyLadder` for every workspace on its own Demo date, never the clock.
import { adminClient, everyWorkspace } from "./appwrite.ts";
import { startDailyLadder } from "./workflows.ts";

let started = 0;
let failed = 0;
for await (const { workspaceId, today } of everyWorkspace(adminClient())) {
  try {
    await startDailyLadder(workspaceId, today);
    started++;
  } catch (e) {
    failed++;
    console.error(`dailyLadder for ${workspaceId} on ${today} did not start`, e);
  }
}
console.log(`started dailyLadder for ${started} workspaces; ${failed} failed to start`);
if (failed > 0) process.exitCode = 1;
