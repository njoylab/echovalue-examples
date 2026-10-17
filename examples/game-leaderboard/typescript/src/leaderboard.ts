/**
 * Lead scoring and validation. Pure functions - no I/O, easy to test.
 *
 * EchoValue stores a single string per key (max 1000 bytes), so the whole
 * leaderboard lives in one key as a JSON array capped at MAX_ENTRIES.
 */

export type Score = { name: string; score: number };

/** Bound the stored value below the 1000-byte limit. */
export const MAX_ENTRIES = 20;
export const TOP_N = 10;
const MAX_NAME_LENGTH = 16;
const MAX_SCORE = 1_000_000_000;

export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const name = raw.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);
  return name.length > 0 ? name : null;
}

export function parseScore(raw: unknown): number | null {
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    return null;
  }
  const score = Math.trunc(value);
  return score >= 0 && score <= MAX_SCORE ? score : null;
}

function compare(a: Score, b: Score): number {
  return b.score - a.score || a.name.localeCompare(b.name);
}

/** Parse a stored payload defensively - never trust persisted data blindly. */
export function parseLeaderboard(raw: string): Score[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) {
    return [];
  }
  return data
    .map((entry): Score | null => {
      const record = entry as { name?: unknown; score?: unknown };
      const name = sanitizeName(record?.name);
      const score = parseScore(record?.score);
      return name !== null && score !== null ? { name, score } : null;
    })
    .filter((entry): entry is Score => entry !== null)
    .sort(compare)
    .slice(0, MAX_ENTRIES);
}

/** Insert a score, keep the list sorted descending, and cap its size. */
export function addScore(entries: Score[], entry: Score): Score[] {
  return [...entries, entry].sort(compare).slice(0, MAX_ENTRIES);
}

/** Serialize, trimming entries until the payload fits the 1000-byte limit. */
export function serialize(entries: Score[]): string {
  let capped = entries.slice(0, MAX_ENTRIES);
  while (capped.length > 0 && byteLength(JSON.stringify(capped)) > 1000) {
    capped = capped.slice(0, -1);
  }
  return JSON.stringify(capped);
}

export function top(entries: Score[], count = TOP_N): Score[] {
  return entries.slice(0, count);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
