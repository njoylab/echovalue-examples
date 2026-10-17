import test from "node:test";
import assert from "node:assert/strict";
import {
  AuthError,
  EchoValueClient,
  EchoValueError,
  InsufficientCreditsError,
  KeyNotFoundError,
  type FetchLike,
} from "./client.ts";

type Call = { url: string; init?: RequestInit };

function capture(): { calls: Call[]; fetchImpl: FetchLike } {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response("OK\n", { status: 200 });
  };
  return { calls, fetchImpl };
}

test("rejects a short token", () => {
  assert.throws(() => new EchoValueClient({ token: "short" }), /at least 10/);
});

test("save encodes JSON, sets ttl and the auth header", async () => {
  const { calls, fetchImpl } = capture();
  const client = new EchoValueClient({ token: "valid-token-123", fetchImpl });

  await client.save("bucket", "key", { a: 1 }, 60);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].init?.method, "POST");
  assert.equal(calls[0].url, "https://api.echovalue.dev/kv/bucket/key?ttl=60");
  assert.equal(calls[0].init?.body, '{"a":1}');
  assert.equal(
    (calls[0].init?.headers as Record<string, string>)["x-token"],
    "valid-token-123",
  );
  assert.ok((calls[0].init?.headers as Record<string, string>)["User-Agent"]);
});

test("save rejects an oversized value without calling the API", async () => {
  const { calls, fetchImpl } = capture();
  const client = new EchoValueClient({ token: "valid-token-123", fetchImpl });

  await assert.rejects(client.save("bucket", "key", "x".repeat(1001)), /1000/);
  assert.equal(calls.length, 0);
});

test("load returns the response body", async () => {
  const fetchImpl: FetchLike = async () => new Response("hello\n", { status: 200 });
  const client = new EchoValueClient({ token: "valid-token-123", fetchImpl });
  assert.equal(await client.load("bucket", "key"), "hello\n");
});

test("loadJson parses the response body", async () => {
  const fetchImpl: FetchLike = async () =>
    new Response(JSON.stringify({ status: "done" }), { status: 200 });
  const client = new EchoValueClient({ token: "valid-token-123", fetchImpl });
  assert.deepEqual(await client.loadJson("bucket", "key"), { status: "done" });
});

test("404 raises KeyNotFoundError", async () => {
  const fetchImpl: FetchLike = async () => new Response("Key Not Found", { status: 404 });
  const client = new EchoValueClient({ token: "valid-token-123", fetchImpl });
  await assert.rejects(client.load("bucket", "key"), KeyNotFoundError);
});

test("402 raises InsufficientCreditsError with a recharge url", async () => {
  const fetchImpl: FetchLike = async () => new Response("Payment required", { status: 402 });
  const client = new EchoValueClient({ token: "valid-token-123", fetchImpl });

  await assert.rejects(client.save("bucket", "key", "value"), (error: unknown) => {
    assert.ok(error instanceof InsufficientCreditsError);
    assert.match(error.rechargeUrl, /\/recharge$/);
    return true;
  });
});

test("401 raises AuthError", async () => {
  const fetchImpl: FetchLike = async () => new Response("Unauthorized", { status: 401 });
  const client = new EchoValueClient({ token: "valid-token-123", fetchImpl });
  await assert.rejects(client.load("bucket", "key"), AuthError);
});

test("other statuses raise the base error", async () => {
  const fetchImpl: FetchLike = async () => new Response("boom", { status: 500 });
  const client = new EchoValueClient({ token: "valid-token-123", fetchImpl });
  await assert.rejects(client.load("bucket", "key"), EchoValueError);
});
