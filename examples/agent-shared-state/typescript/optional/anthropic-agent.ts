/**
 * Optional: plug real LLM agents into the same shared state (not tested).
 *
 * Mirrors https://docs.echovalue.dev/guides/agent-shared-state/
 * Requires: `npm install @anthropic-ai/sdk` and ANTHROPIC_API_KEY.
 * The basic demo (agent-a.ts / agent-b.ts) needs neither.
 */

import Anthropic from "@anthropic-ai/sdk";
import { EchoValueClient } from "../client.ts";

const TOOLS: Anthropic.Tool[] = [
  {
    name: "save_state",
    description: "Save a value to shared agent state",
    input_schema: {
      type: "object",
      properties: { key: { type: "string" }, value: { type: "string" } },
      required: ["key", "value"],
    },
  },
  {
    name: "read_state",
    description: "Read a value from shared agent state",
    input_schema: {
      type: "object",
      properties: { key: { type: "string" } },
      required: ["key"],
    },
  },
];

const token = process.env.ECHOVALUE_TOKEN ?? "";
if (token.length < 10) {
  console.error("Set ECHOVALUE_TOKEN");
  process.exit(2);
}

const client = new EchoValueClient({ token });
const anthropic = new Anthropic();

const response = await anthropic.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 512,
  tools: TOOLS,
  messages: [{ role: "user", content: "Save status=done under key pipeline" }],
});

for (const block of response.content) {
  if (block.type !== "tool_use") continue;
  const args = block.input as { key: string; value?: string };
  if (block.name === "save_state" && args.value !== undefined) {
    await client.save("agent-demo", args.key, args.value, 3600);
    console.log(`save_state ${args.key} -> OK`);
  } else if (block.name === "read_state") {
    console.log(`read_state ${args.key} -> ${await client.load("agent-demo", args.key)}`);
  }
}
