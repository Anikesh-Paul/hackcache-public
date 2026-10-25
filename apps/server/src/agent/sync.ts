// Creates or updates the ElevenLabs agent from ./config.ts: the client tools
// first (matched by name, so a second run updates them), then the agent with
// their IDs. Returns the agent ID for ELEVENLABS_AGENT_ID.
import { CLIENT_TOOLS, agentBody } from "./config.ts";

const API = "https://api.elevenlabs.io/v1/convai";

type Fetch = typeof fetch;

export type SyncResult = { agentId: string; created: boolean; tools: { name: string; id: string; created: boolean }[] };

export async function syncAgent(
  opts: { apiKey: string; agentId?: string | null; log?: (line: string) => void },
  http: Fetch = fetch,
): Promise<SyncResult> {
  const log = opts.log ?? (() => {});
  const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await http(`${API}${path}`, {
      method,
      headers: { "xi-api-key": opts.apiKey, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`ElevenLabs ${method} ${path}: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  };

  const listed = await call<{ tools?: { id: string; tool_config?: { name?: string } }[] }>("GET", "/tools");
  const tools: SyncResult["tools"] = [];
  for (const tool of CLIENT_TOOLS) {
    const found = listed.tools?.find((t) => t.tool_config?.name === tool.name);
    if (found) {
      await call("PATCH", `/tools/${encodeURIComponent(found.id)}`, { tool_config: tool });
      tools.push({ name: tool.name, id: found.id, created: false });
    } else {
      const made = await call<{ id: string }>("POST", "/tools", { tool_config: tool });
      tools.push({ name: tool.name, id: made.id, created: true });
    }
    log(`tool ${tool.name}: ${tools[tools.length - 1]?.created ? "created" : "updated"}`);
  }

  const body = agentBody(tools.map((t) => t.id));
  if (opts.agentId) {
    await call("PATCH", `/agents/${encodeURIComponent(opts.agentId)}`, body);
    log(`agent ${opts.agentId}: updated`);
    return { agentId: opts.agentId, created: false, tools };
  }
  const made = await call<{ agent_id: string }>("POST", "/agents/create", body);
  log(`agent ${made.agent_id}: created`);
  return { agentId: made.agent_id, created: true, tools };
}
