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

/** The Demo date stepper on Render: runs `dailyLadder` on the workflow service and waits for its summary. */
export function renderRunner(): LadderRunner {
  const render = new Render();
  return async (workspaceId, demoDate) => {
    const run = await render.workflows.runTask(DAILY_LADDER_TASK, [workspaceId, demoDate]);
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
