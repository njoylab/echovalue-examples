/**
 * Agent A (planner): produces a plan and persists it to EchoValue.
 *
 *   node agent-a.ts "edge caching"
 *
 * Agent B then reads the plan from a separate process (and could run on a
 * different machine or container).
 */

import { fileURLToPath } from "node:url";
import {
  AuthError,
  EchoValueClient,
  EchoValueError,
  InsufficientCreditsError,
  type KeyValueStore,
} from "./client.ts";

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

export const BUCKET = process.env.ECHOVALUE_BUCKET ?? "agent-demo";
export const KEY = process.env.ECHOVALUE_KEY ?? "handoff";
const TTL_SECONDS = 3600;

export type Plan = {
  topic: string;
  producer: string;
  status: string;
  steps: string[];
};

/** Deterministic "thinking" - no LLM required for the basic demo. */
export function buildPlan(topic: string): Plan {
  return {
    topic,
    producer: "agent-a",
    status: "planned",
    steps: [
      `Collect two sources about ${topic}`,
      `Extract the three key points about ${topic}`,
      `Write a 120-word brief on ${topic}`,
    ],
  };
}

export async function run(store: KeyValueStore, topic: string): Promise<Plan> {
  const plan = buildPlan(topic);
  await store.save(BUCKET, KEY, plan, TTL_SECONDS);
  return plan;
}

async function main(): Promise<number> {
  const token = process.env.ECHOVALUE_TOKEN ?? "";
  if (token.length < 10) {
    console.error("Set ECHOVALUE_TOKEN (see .env.example).");
    return 2;
  }

  const topic = process.argv.slice(2).join(" ") || process.env.TOPIC || "edge caching";
  const client = new EchoValueClient({ token });

  try {
    const plan = await run(client, topic);
    console.log("agent-a (planner)");
    console.log(`  saved plan to ${BUCKET}/${KEY} on EchoValue (1 credit)`);
    plan.steps.forEach((step, index) => console.log(`  ${index + 1}. ${step}`));
    return 0;
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      console.error(`Out of credits: ${error.message}`);
      return 1;
    }
    if (error instanceof AuthError) {
      console.error(`Auth failed: ${error.message}`);
      return 1;
    }
    if (error instanceof EchoValueError || error instanceof Error) {
      console.error(`Failed to save plan: ${error.message}`);
      return 1;
    }
    throw error;
  }
}

if (isMain) {
  process.exitCode = await main();
}
