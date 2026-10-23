// Render Workflows service `app-ladder`. The SDK starts its task server on its
// own when Render runs this file (RENDER_SDK_SOCKET_PATH is set there).
// `dailyLadder` plans one workspace's Demo date and fans out one
// `sendReminder` per Reminder, each on its own compute; Render retries a
// failed send, and the Reminder's key keeps the retry from sending twice.
import { task, type TaskContext } from "@renderinc/sdk/workflows";
import {
  runLadder,
  sendReminder as send,
  type ReminderJob,
  type RunSummary,
  type SendResult,
} from "@tagada/server/ladder";
import { ladderDepsFromEnv } from "@tagada/server/ladder-env";

const deps = ladderDepsFromEnv();

export const hello = task(
  { name: "hello", timeoutSeconds: 30 },
  function hello(ctx: TaskContext, who: string): { greeting: string; taskRunId: string | undefined } {
    return { greeting: `Namaste, ${who}`, taskRunId: ctx.metadata.taskRunId };
  },
);

export const sendReminder = task(
  { name: "sendReminder", timeoutSeconds: 60, retry: { maxRetries: 2, waitDurationMs: 1000, backoffScaling: 2 } },
  async function sendReminder(_ctx: TaskContext, job: ReminderJob): Promise<SendResult> {
    const result = await send(deps, job);
    // Throwing hands the retry to Render; the next attempt finds the same key, not yet sent.
    if (result === "failed") throw new Error(`reminder ${job.invoiceId} stage ${job.stage} failed; retrying`);
    return result;
  },
);

export const dailyLadder = task(
  { name: "dailyLadder", timeoutSeconds: 600 },
  async function dailyLadder(ctx: TaskContext, workspaceId: string, demoDate: string): Promise<RunSummary> {
    const runId = ctx.metadata.taskRunId ?? `local-${Date.now()}`;
    // runLadder fans the sends out with Promise.all; each is its own task run, retried by Render.
    return runLadder(deps, workspaceId, demoDate, runId, (job) =>
      ctx.run(sendReminder, job).catch((): SendResult => "failed"),
    );
  },
);
