/**
 * Optional live integration test. Disabled unless RUN_LIVE_TESTS=1.
 *
 * It writes and deletes one key against the real API, costing 2 credits:
 *
 *   RUN_LIVE_TESTS=1 ECHOVALUE_TOKEN=... npm run test:live
 */

import test from "node:test";
import assert from "node:assert/strict";
import { EchoValueClient, KeyNotFoundError } from "./client.ts";

const token = process.env.ECHOVALUE_TOKEN ?? "";
const runLive = process.env.RUN_LIVE_TESTS === "1" && token.length >= 10;

test("roundtrip against the live API", { skip: !runLive }, async () => {
  const client = new EchoValueClient({ token });
  const bucket = "agent-demo";
  const key = "live-test";

  await client.save(bucket, key, "hello from examples", 60);
  try {
    assert.equal((await client.load(bucket, key)).trim(), "hello from examples");
  } finally {
    await client.delete(bucket, key);
  }
  await assert.rejects(client.load(bucket, key), KeyNotFoundError);
});
