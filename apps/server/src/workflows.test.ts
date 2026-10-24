import { describe, expect, it } from "vitest";
import { runAndWait } from "./workflows.ts";

type Fake = Parameters<typeof runAndWait>[0];

/** A workflows client whose event stream answers with `streamed` (or never), and whose status reads `statuses` in turn. */
function fake(streamed: "never" | "fails" | object, statuses: string[]) {
  let asked = 0;
  let signal: AbortSignal | undefined;
  const client = {
    startTask: async (_task: string, _input: unknown[], options?: { signal?: AbortSignal }) => {
      signal = options?.signal;
      return {
        taskRunId: "trn-1",
        get: () =>
          streamed === "never"
            ? new Promise(() => {})
            : streamed === "fails"
              ? Promise.reject(new Error("SSE connection error"))
              : Promise.resolve(streamed),
      };
    },
    getTaskRun: async () => {
      const status = statuses[Math.min(asked, statuses.length - 1)];
      asked += 1;
      return { id: "trn-1", status, results: [{ runId: "r1" }] };
    },
  } as unknown as Fake;
  return { client, asked: () => asked, aborted: () => signal?.aborted ?? false };
}

describe("runAndWait", () => {
  it("returns the streamed result when the event arrives", async () => {
    const f = fake({ id: "trn-1", status: "succeeded", results: [] }, ["running"]);
    await expect(runAndWait(f.client, "app-ladder/dailyLadder", [], { pollMs: 50 })).resolves.toMatchObject({ status: "succeeded" });
    expect(f.aborted()).toBe(true);
  });

  it("finds the end by asking when the event never arrives", async () => {
    const f = fake("never", ["running", "running", "succeeded"]);
    const run = await runAndWait(f.client, "app-ladder/dailyLadder", [], { pollMs: 1 });
    expect(run).toMatchObject({ status: "succeeded", results: [{ runId: "r1" }] });
    expect(f.asked()).toBe(3);
    expect(f.aborted()).toBe(true);
  });

  it("falls back to asking when the event stream fails", async () => {
    const f = fake("fails", ["failed"]);
    await expect(runAndWait(f.client, "app-ladder/dailyLadder", [], { pollMs: 1 })).resolves.toMatchObject({ status: "failed" });
  });

  it("gives up after the limit instead of waiting forever", async () => {
    const f = fake("never", ["running"]);
    await expect(runAndWait(f.client, "app-ladder/dailyLadder", [], { pollMs: 1, timeoutMs: 20 })).rejects.toThrow(
      "app-ladder/dailyLadder trn-1 still running after 0.02s",
    );
  });
});
