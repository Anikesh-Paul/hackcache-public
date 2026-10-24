import { Render } from "@renderinc/sdk";
import type { LadderRunner, RunSummary } from "./ladder.ts";

/** The workflow service's name in render.yaml; task slugs are `<service>/<task>`. */
export const WORKFLOW_SERVICE = "app-ladder";
export const HELLO_TASK = `${WORKFLOW_SERVICE}/hello`;
export const DAILY_LADDER_TASK = `${WORKFLOW_SERVICE}/dailyLadder`;

/** Starts the hello-world task. `new Render()` reads RENDER_API_KEY. */
export async function startHello(who: string) {
  const run = await new Render().workflows.startTask(HELLO_TASK, [who]);
  return run.taskRunId;
}

/**
 * Starts `dailyLadder` for one workspace and Demo date. The key makes a
 * second start for the same day (a cron retry) return the first run.
 */
export async function startDailyLadder(workspaceId: string, demoDate: string) {
  const run = await new Render().workflows.startTask(DAILY_LADDER_TASK, [workspaceId, demoDate], {
    idempotencyKey: `ladder-${workspaceId}-${demoDate}`,
  });
  return run.taskRunId;
}

type Workflows = Pick<Render["workflows"], "startTask" | "getTaskRun">;
type RunDetails = Awaited<ReturnType<Workflows["getTaskRun"]>>;

const ENDED = new Set<string>(["succeeded", "completed", "failed", "canceled"]);

/**
 * Starts a task and waits for it to end. The SDK's own wait listens to an event
 * stream only, and a run that ends without its event reaching us would wait
 * forever: so the run is also asked for every few seconds, up to a limit.
 */
export async function runAndWait(
  workflows: Workflows,
  task: string,
  input: unknown[],
  { pollMs = 3_000, timeoutMs = 300_000 }: { pollMs?: number; timeoutMs?: number } = {},
): Promise<RunDetails> {
  const stop = new AbortController();
  const started = await workflows.startTask(task, input, { signal: stop.signal });
  const deadline = Date.now() + timeoutMs;
  const polled = (async (): Promise<RunDetails> => {
    while (!stop.signal.aborted) {
      await new Promise((r) => setTimeout(r, pollMs));
      if (stop.signal.aborted) break;
      const run = await workflows.getTaskRun(started.taskRunId).catch(() => null);
      if (run && ENDED.has(run.status)) return run;
      if (Date.now() > deadline) {
        throw new Error(`${task} ${started.taskRunId} still ${run?.status ?? "unknown"} after ${timeoutMs / 1000}s`);
      }
    }
    return new Promise<never>(() => {});
  })();
  try {
    // A dropped event stream leaves the polling to answer.
    return await Promise.race([started.get().catch(() => polled), polled]);
  } finally {
    stop.abort();
  }
}

/** The Demo date stepper on Render: runs `dailyLadder` on the workflow service and waits for its summary. */
export function renderRunner(): LadderRunner {
  const render = new Render();
  return async (workspaceId, demoDate) => {
    const run = await runAndWait(render.workflows, DAILY_LADDER_TASK, [workspaceId, demoDate]);
    const [summary] = run.results;
    if (run.status !== "succeeded" && run.status !== "completed") {
      throw new Error(`dailyLadder ${run.id} ${run.status}: ${run.error ?? "no error given"}`);
    }
    if (typeof summary !== "object" || summary === null || !("runId" in summary)) {
      throw new Error(`dailyLadder ${run.id} returned no summary`);
    }
    return summary as RunSummary;
  };
}
