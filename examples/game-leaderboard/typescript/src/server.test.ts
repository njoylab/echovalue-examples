import test from "node:test";
import assert from "node:assert/strict";
import {
  describeError,
  readLeaderboard,
  submitScore,
  ValidationError,
} from "./server.ts";
import { InsufficientCreditsError, KeyNotFoundError, type KeyValueStore } from "./echo-value.ts";

class FakeStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  readonly saves: string[] = [];

  async load(bucket: string, key: string): Promise<string> {
    const value = this.data.get(`${bucket}/${key}`);
    if (value === undefined) {
      throw new KeyNotFoundError("missing");
    }
    return value;
  }

  async save(bucket: string, key: string, value: string): Promise<void> {
    this.data.set(`${bucket}/${key}`, value);
    this.saves.push(`${bucket}/${key}`);
  }
}

test("readLeaderboard returns [] when the key has never been written", async () => {
  assert.deepEqual(await readLeaderboard(new FakeStore()), []);
});

test("submitScore validates, persists, and sorts descending", async () => {
  const store = new FakeStore();
  await submitScore(store, "low", 10);
  const entries = await submitScore(store, "high", 9000);

  assert.deepEqual(entries.map((entry) => entry.name), ["high", "low"]);
  assert.equal(store.saves.length, 2);
});

test("submitScore rejects bad input", async () => {
  const store = new FakeStore();
  await assert.rejects(submitScore(store, "", 10), ValidationError);
  await assert.rejects(submitScore(store, "neo", -5), ValidationError);
  await assert.rejects(submitScore(store, "neo", "abc"), ValidationError);
});

test("describeError maps credit exhaustion to a clear 503", () => {
  const result = describeError(new InsufficientCreditsError("empty", "https://x/recharge"));
  assert.equal(result.status, 503);
  assert.match(result.message, /out of credits/);
});

test("describeError maps validation to 400", () => {
  assert.equal(describeError(new ValidationError("bad")).status, 400);
});
