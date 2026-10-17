/**
 * Agent B (executor): reads the plan Agent A wrote and continues the work.
 *
 *   node agent-b.ts
 *
 * It fetches shared state over HTTP - not from local memory - so it works
 * even when the two agents run in different processes, containers, or hosts.
 */

import { fileURLToPath } from "node:url";
import {
  AuthError,
  EchoValueClient,
  EchoValueError,
  InsufficientCreditsError,
  KeyNotFoundError,
  type KeyValueStore,
} from "./client.ts";
import { BUCKET, KEY, type Plan } from "./agent-a.ts";

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

export const RESULT_KEY = process.env.ECHOVALUE_RESULT_KEY ?? "brief";
const TTL_SECONDS = 3600;

export type Brief = {
  topic: string;
  producer: string;
  consumed_from: string;
  status: string;
  summary: string;
};

/** Turn the planner's steps into a finished brief (no LLM required). */
export function execute(plan: Plan): Brief {
  const steps = plan.steps ?? [];
  return {
    topic: plan.topic,
    producer: "agent-b",
    consumed_from: plan.producer ?? "unknown",
    status: "done",
    summary:
      `${plan.topic}: ${steps.length} steps executed. ` +
      "Key points: cheaper reads, fewer round trips, simpler deploys.",
  };
}

export async function run(store: KeyValueStore): Promise<Brief> {
  const plan = await store.loadJson<Plan>(BUCKET, KEY);
  const brief = execute(plan);
  await store.save(BUCKET, RESULT_KEY, brief, TTL_SECONDS);
  return brief;
}

async function main(): Promise<number> {
  const token = process.env.ECHOVALUE_TOKEN ?? "";
  if (token.length < 10) {
    console.error("Set ECHOVALUE_TOKEN (see .env.example).");
    return 2;
  }

  const client = new EchoValueClient({ token });

  try {
    const brief = await run(client);
    console.log("agent-b (executor)");
    console.log(`  read plan from ${BUCKET}/${KEY} over HTTP (1 credit)`);
    console.log(`  producer=${brief.consumed_from} topic=${JSON.stringify(brief.topic)}`);
    console.log(`  wrote brief to ${BUCKET}/${RESULT_KEY} (1 credit)`);
    console.log(`  ${brief.summary}`);
    return 0;
  } catch (error) {
    if (error instanceof KeyNotFoundError) {
      console.error(`No plan found at ${BUCKET}/${KEY}. Run "node agent-a.ts" first.`);
      return 1;
    }
    if (error instanceof InsufficientCreditsError) {
      console.error(`Out of credits: ${error.message}`);
      return 1;
    }
    if (error instanceof AuthError) {
      console.error(`Auth failed: ${error.message}`);
      return 1;
    }
    if (error instanceof EchoValueError || error instanceof Error) {
      console.error(`Failed to execute plan: ${error.message}`);
      return 1;
    }
    throw error;
  }
}

if (isMain) {
  process.exitCode = await main();
}
