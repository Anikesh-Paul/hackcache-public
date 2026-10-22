// Render Workflows service `app-ladder`. The SDK starts its task server on its
// own when Render runs this file (RENDER_SDK_SOCKET_PATH is set there).
// dailyLadder and sendReminder arrive with the Ladder ticket.
import { task, type TaskContext } from "@renderinc/sdk/workflows";

export const hello = task(
  { name: "hello", timeoutSeconds: 30 },
  function hello(ctx: TaskContext, who: string): { greeting: string; taskRunId: string | undefined } {
    return { greeting: `Namaste, ${who}`, taskRunId: ctx.metadata.taskRunId };
  },
);
