// Render Cron Job `app-cron`, scheduled 30 4 * * * UTC (10:00 IST).
// For now it proves the cron → workflow path with the hello task; the Ladder
// ticket replaces this with dailyLadder for every workspace.
import { startHello } from "./workflows.ts";

const taskRunId = await startHello("cron");
console.log(`started hello task run ${taskRunId}`);
