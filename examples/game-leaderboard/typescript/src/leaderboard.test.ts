import test from "node:test";
import assert from "node:assert/strict";
import {
  addScore,
  MAX_ENTRIES,
  parseLeaderboard,
  parseScore,
  sanitizeName,
  serialize,
  top,
  type Score,
} from "./leaderboard.ts";

test("sanitizeName trims, collapses whitespace, and truncates", () => {
  assert.equal(sanitizeName("  Neo  "), "Neo");
  assert.equal(sanitizeName("a   b"), "a b");
  assert.equal(sanitizeName("x".repeat(40))?.length, 16);
  assert.equal(sanitizeName("   "), null);
  assert.equal(sanitizeName(42), null);
});

test("parseScore accepts numbers and numeric strings, rejects junk", () => {
  assert.equal(parseScore(1234), 1234);
  assert.equal(parseScore("1234"), 1234);
  assert.equal(parseScore(12.9), 12);
  assert.equal(parseScore(-1), null);
  assert.equal(parseScore("nope"), null);
  assert.equal(parseScore(Number.POSITIVE_INFINITY), null);
});

test("addScore sorts descending and caps entries", () => {
  const entries: Score[] = [];
  for (let i = 0; i < MAX_ENTRIES + 5; i += 1) {
    entries.push({ name: `p${i}`, score: i });
  }
  const result = addScore(entries, { name: "best", score: 9999 });
  assert.equal(result.length, MAX_ENTRIES);
  assert.equal(result[0].name, "best");
  for (let i = 1; i < result.length; i += 1) {
    assert.ok(result[i - 1].score >= result[i].score);
  }
});

test("parseLeaderboard is defensive", () => {
  assert.deepEqual(parseLeaderboard("not json"), []);
  assert.deepEqual(parseLeaderboard('{"a":1}'), []);
  const cleaned = parseLeaderboard(
    JSON.stringify([
      { name: "a", score: 10 },
      { name: "", score: 5 },
      { name: "b", score: "7" },
      { name: "c", score: -1 },
    ]),
  );
  assert.deepEqual(cleaned, [
    { name: "a", score: 10 },
    { name: "b", score: 7 },
  ]);
});

test("serialize stays within the 1000-byte limit", () => {
  const big: Score[] = Array.from({ length: MAX_ENTRIES }, (_, i) => ({
    name: "x".repeat(16),
    score: 1_000_000_000 - i,
  }));
  const payload = serialize(big);
  assert.ok(new TextEncoder().encode(payload).length <= 1000);
});

test("top returns at most the requested number", () => {
  const entries = Array.from({ length: 15 }, (_, i) => ({ name: `p${i}`, score: i }));
  assert.equal(top(entries).length, 10);
  assert.equal(top(entries, 3).length, 3);
});
