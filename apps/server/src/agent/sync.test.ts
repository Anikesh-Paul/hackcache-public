import { describe, expect, it } from "vitest";
import { CALL_OUTCOMES, MUNIM_FIRST_MESSAGE } from "@tagada/domain";
import { CALL_VARIABLES } from "../call.ts";
import { CLIENT_TOOLS, agentBody, agentPrompt } from "./config.ts";
import { syncAgent } from "./sync.ts";

const used = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);

describe("the agent config", () => {
  it("names only variables the server sends, in the prompt and the first message", () => {
    const sent = new Set<string>(CALL_VARIABLES);
    expect(used(agentPrompt()).filter((v) => !sent.has(v ?? ""))).toEqual([]);
    expect(used(MUNIM_FIRST_MESSAGE).filter((v) => !sent.has(v ?? ""))).toEqual([]);
    expect(agentPrompt()).toContain("{{stage}}");
    expect(agentPrompt()).toContain("before_due");
  });

  it("declares every variable, the voice, a private agent and both client tools", () => {
    const body = agentBody(["t1", "t2"], "prompt");
    expect(Object.keys(body.conversation_config.agent.dynamic_variables.dynamic_variable_placeholders)).toEqual([...CALL_VARIABLES]);
    expect(body.conversation_config.agent.first_message).toBe(MUNIM_FIRST_MESSAGE);
    expect(body.conversation_config.agent.prompt.tool_ids).toEqual(["t1", "t2"]);
    expect(body.conversation_config.tts.voice_id).toBe("2zRM7PkgwBPiau2jvVXc");
    expect(body.platform_settings.auth.enable_auth).toBe(true);
    expect(CLIENT_TOOLS.map((t) => t.name)).toEqual(["propose_plan", "record_outcome"]);
    expect(CLIENT_TOOLS[1]?.parameters.properties.outcome?.enum).toEqual(CALL_OUTCOMES);
  });
});

type Sent = { method: string; url: string; body: unknown };

function fakeApi(existing: { id: string; tool_config: { name: string } }[]) {
  const sent: Sent[] = [];
  const http = (async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    sent.push({ method: String(init.method), url, body });
    const reply = url.endsWith("/tools") && init.method === "GET"
      ? { tools: existing }
      : url.endsWith("/tools")
        ? { id: `new-${body.tool_config.name}` }
        : { agent_id: "agent-new" };
    return new Response(JSON.stringify(reply), { status: 200 });
  }) as typeof fetch;
  return { sent, http };
}

describe("pnpm agent:sync", () => {
  it("creates the tools and the agent, and gives back its ID", async () => {
    const { sent, http } = fakeApi([]);
    const result = await syncAgent({ apiKey: "xi" }, http);
    expect(result).toMatchObject({ agentId: "agent-new", created: true });
    expect(sent.map((s) => `${s.method} ${s.url.replace("https://api.elevenlabs.io/v1/convai", "")}`)).toEqual([
      "GET /tools",
      "POST /tools",
      "POST /tools",
      "POST /agents/create",
    ]);
    const agent = sent[3]?.body as ReturnType<typeof agentBody>;
    expect(agent.conversation_config.agent.prompt.tool_ids).toEqual(["new-propose_plan", "new-record_outcome"]);
  });

  it("updates the tools it finds by name and the agent it is given", async () => {
    const { sent, http } = fakeApi([{ id: "tp", tool_config: { name: "propose_plan" } }]);
    const result = await syncAgent({ apiKey: "xi", agentId: "agent-1" }, http);
    expect(result).toMatchObject({ agentId: "agent-1", created: false });
    expect(sent.map((s) => `${s.method} ${s.url.replace("https://api.elevenlabs.io/v1/convai", "")}`)).toEqual([
      "GET /tools",
      "PATCH /tools/tp",
      "POST /tools",
      "PATCH /agents/agent-1",
    ]);
  });

  it("stops with ElevenLabs' answer when a request fails", async () => {
    const http = (async () => new Response("bad key", { status: 401 })) as typeof fetch;
    await expect(syncAgent({ apiKey: "xi" }, http)).rejects.toThrow(/GET \/tools: 401 bad key/);
  });
});
