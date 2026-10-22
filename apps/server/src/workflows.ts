import { Render } from "@renderinc/sdk";

/** The workflow service's name in render.yaml; task slugs are `<service>/<task>`. */
export const WORKFLOW_SERVICE = "app-ladder";
export const HELLO_TASK = `${WORKFLOW_SERVICE}/hello`;

/** Starts the hello-world task. `new Render()` reads RENDER_API_KEY. */
export async function startHello(who: string) {
  const run = await new Render().workflows.startTask(HELLO_TASK, [who]);
  return run.taskRunId;
}
