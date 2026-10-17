import test from "node:test";
import assert from "node:assert/strict";
import {
  AuthError,
  EchoValueClient,
  InsufficientCreditsError,
  KeyNotFoundError,
  type FetchLike,
} from "./echo-value.ts";

type Call = { url: string; init?: RequestInit };

test("save sets the auth header, body, and ttl", async () => {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response("OK\n", { status: 200 });
  };
  const client = new EchoValueClient({ token: "valid-token-123", fetchImpl });

  await client.save("leaderboard", "scores", "[1]", 60);

  assert.equal(calls[0].url, "https://api.echovalue.dev/kv/leaderboard/scores?ttl=60");
  assert.equal(calls[0].init?.body, "[1]");
  assert.equal(
    (calls[0].init?.headers as Record<string, string>)["x-token"],
    "valid-token-123",
  );
  assert.ok((calls[0].init?.headers as Record<string, string>)["User-Agent"]);
});

test("402 raises InsufficientCreditsError with a recharge url", async () => {
  const fetchImpl: FetchLike = async () => new Response("Payment required", { status: 402 });
  const client = new EchoValueClient({ token: "valid-token-123", fetchImpl });

  await assert.rejects(client.load("leaderboard", "scores"), (error: unknown) => {
    assert.ok(error instanceof InsufficientCreditsError);
    assert.match(error.rechargeUrl, /\/recharge$/);
    return true;
  });
});

test("404 raises KeyNotFoundError", async () => {
  const fetchImpl: FetchLike = async () => new Response("Key Not Found", { status: 404 });
  const client = new EchoValueClient({ token: "valid-token-123", fetchImpl });
  await assert.rejects(client.load("leaderboard", "scores"), KeyNotFoundError);
});

test("401 raises AuthError", async () => {
  const fetchImpl: FetchLike = async () => new Response("Unauthorized", { status: 401 });
  const client = new EchoValueClient({ token: "valid-token-123", fetchImpl });
  await assert.rejects(client.load("leaderboard", "scores"), AuthError);
});
