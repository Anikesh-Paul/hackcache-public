// The ElevenLabs call agent, Munim, as checked-in config: prompt, first
// message, voice, model, auth and the two client tools. `pnpm agent:sync`
// (scripts/elevenlabs-agent.ts) creates or updates the agent from this, so the
// agent can be rebuilt from the repo if it is deleted or the key is rotated.
import { readFileSync } from "node:fs";
import { CALL_OUTCOMES, MUNIM_FIRST_MESSAGE } from "@tagada/domain";
import { CALL_VARIABLES } from "../call.ts";
import { MODEL_ID, VOICE_ID } from "../voice.ts";

export const AGENT_NAME = "Tagada Munim";

/** The system prompt, from prompt.md beside this file. */
export const agentPrompt = (): string => readFileSync(new URL("./prompt.md", import.meta.url), "utf8");

type Param = { type: "string" | "integer"; description: string; enum?: readonly string[] };
type ClientTool = {
  type: "client";
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, Param>; required: string[] };
  expects_response: true;
  response_timeout_secs: number;
};

const date = (what: string): Param => ({ type: "string", description: `${what}, as YYYY-MM-DD from the calendar.` });

/** The browser answers both (apps/web/src/lib/call.ts); the server checks `record_outcome` again. */
export const CLIENT_TOOLS: ClientTool[] = [
  {
    type: "client",
    name: "propose_plan",
    description:
      "Checks a Plan the Customer offers against the Owner's rule: a first amount by one date and the rest by another. " +
      "The reply says whether it is accepted and gives every amount and date to say, in Hindi words.",
    parameters: {
      type: "object",
      properties: {
        first_amount_rupees: { type: "integer", description: "The first amount the Customer offers, in whole rupees." },
        first_date: date("When the first amount will be paid"),
        rest_date: date("When the rest will be paid"),
      },
      required: ["first_amount_rupees", "first_date", "rest_date"],
    },
    expects_response: true,
    response_timeout_secs: 10,
  },
  {
    type: "client",
    name: "record_outcome",
    description:
      "Records what the call agreed or learnt, once, at the end. The reply is \"recorded\", or an error saying what to do instead.",
    parameters: {
      type: "object",
      properties: {
        outcome: { type: "string", description: "What the call came to.", enum: CALL_OUTCOMES },
        date: date("The promised date, the first instalment's date, the payment date already made, or the callback date"),
        rest_date: date("For a plan: when the rest will be paid"),
        amount_rupees: {
          type: "integer",
          description: "For a plan, the first amount in whole rupees. For a promise of part of the bill, that amount; leave it out for the whole bill.",
        },
        reference: { type: "string", description: "For already_paid: the UPI or bank reference the Customer gives." },
        notes: { type: "string", description: "Anything the Owner should know, briefly, in the Customer's words." },
      },
      required: ["outcome"],
    },
    expects_response: true,
    response_timeout_secs: 20,
  },
];

/** The agent's body for create and update, with the client tools by their IDs. */
export function agentBody(toolIds: readonly string[], prompt = agentPrompt()) {
  return {
    name: AGENT_NAME,
    conversation_config: {
      agent: {
        language: "hi",
        first_message: MUNIM_FIRST_MESSAGE,
        prompt: {
          prompt,
          llm: "gemini-2.5-flash",
          temperature: 0.3,
          tool_ids: [...toolIds],
          built_in_tools: { end_call: { name: "end_call", description: "", params: { system_tool_type: "end_call" } } },
        },
        // Every call sends real values (variablesFor in ../call.ts); these only fill the dashboard's test calls.
        dynamic_variables: {
          dynamic_variable_placeholders: Object.fromEntries(CALL_VARIABLES.map((name) => [name, PLACEHOLDERS[name] ?? ""])),
        },
      },
      tts: { voice_id: VOICE_ID, model_id: MODEL_ID },
    },
    // A private agent: a call needs a conversation token from the server, so the agent ID alone cannot start one.
    platform_settings: { auth: { enable_auth: true } },
    tags: ["tagada"],
  };
}

const PLACEHOLDERS: Partial<Record<(typeof CALL_VARIABLES)[number], string>> = {
  business_name: "Tripura Bamboo Works",
  customer_name: "Gupta",
  customer_gender: "male",
  invoice_no: "TBW/26-27/0019",
  amount_words: "एक लाख अठारह हज़ार रुपये",
  stage: "overdue",
  days_overdue: "12",
};
