/**
 * Optional live integration test. Disabled unless RUN_LIVE_TESTS=1.
 * Writes and deletes one key against the real API (costs ~3 credits):
 *
 *   RUN_LIVE_TESTS=1 ECHOVALUE_TOKEN=... npm run test:live
 */

import test from "node:test";
import assert from "node:assert/strict";
import { EchoValueClient } from "./echo-value.ts";
import { parseLeaderboard, serialize } from "./leaderboard.ts";

const token = process.env.ECHOVALUE_TOKEN ?? "";
const runLive = process.env.RUN_LIVE_TESTS === "1" && token.length >= 10;

test("leaderboard roundtrip against the live API", { skip: !runLive }, async () => {
  const client = new EchoValueClient({ token });
  const bucket = "leaderboard";
  const key = "live-test";

  await client.save(bucket, key, serialize([{ name: "neo", score: 9000 }]), 60);
  const entries = parseLeaderboard(await client.load(bucket, key));
  assert.deepEqual(entries, [{ name: "neo", score: 9000 }]);
});
