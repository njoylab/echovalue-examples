import test from "node:test";
import assert from "node:assert/strict";
import { buildPlan, run as runPlanner, BUCKET, KEY } from "./agent-a.ts";
import { execute, run as runConsumer, RESULT_KEY } from "./agent-b.ts";
import { KeyNotFoundError, type KeyValueStore } from "./client.ts";

class FakeStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  readonly saves: string[] = [];

  async save(bucket: string, key: string, value: unknown): Promise<void> {
    this.data.set(`${bucket}/${key}`, JSON.stringify(value));
    this.saves.push(`${bucket}/${key}`);
  }

  async load(bucket: string, key: string): Promise<string> {
    const value = this.data.get(`${bucket}/${key}`);
    if (value === undefined) {
      throw new KeyNotFoundError("missing");
    }
    return value;
  }

  async loadJson<T>(bucket: string, key: string): Promise<T> {
    return JSON.parse(await this.load(bucket, key)) as T;
  }

  async delete(bucket: string, key: string): Promise<void> {
    this.data.delete(`${bucket}/${key}`);
  }
}

test("buildPlan produces a planner-shaped plan", () => {
  const plan = buildPlan("edge caching");
  assert.equal(plan.producer, "agent-a");
  assert.equal(plan.status, "planned");
  assert.equal(plan.steps.length, 3);
});

test("execute consumes the planner's output", () => {
  const brief = execute(buildPlan("edge caching"));
  assert.equal(brief.producer, "agent-b");
  assert.equal(brief.consumed_from, "agent-a");
  assert.equal(brief.status, "done");
  assert.match(brief.summary, /edge caching/);
});

test("state is handed off between the two agents", async () => {
  const store = new FakeStore();
  await runPlanner(store, "edge caching");
  const brief = await runConsumer(store);

  assert.equal(brief.topic, "edge caching");
  assert.equal(brief.consumed_from, "agent-a");
  assert.deepEqual(store.saves, [`${BUCKET}/${KEY}`, `${BUCKET}/${RESULT_KEY}`]);
});

test("the consumer fails without a producer", async () => {
  await assert.rejects(runConsumer(new FakeStore()), KeyNotFoundError);
});
