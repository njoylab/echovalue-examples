/**
 * Minimal leaderboard server. Plain Node.js `http` - no framework.
 *
 *   node --env-file-if-exists=.env src/server.ts
 *
 * Routes:
 *   GET  /                 -> public/index.html
 *   GET  /api/scores       -> { scores: [...top 10] }
 *   POST /api/scores       -> { name, score } -> { scores: [...top 10] }
 *
 * The EchoValue token stays on the server and is never exposed to the browser.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AuthError,
  EchoValueClient,
  EchoValueError,
  InsufficientCreditsError,
  KeyNotFoundError,
  type KeyValueStore,
} from "./echo-value.ts";
import {
  addScore,
  parseLeaderboard,
  parseScore,
  sanitizeName,
  serialize,
  top,
  type Score,
} from "./leaderboard.ts";

const BUCKET = process.env.LEADERBOARD_BUCKET ?? "leaderboard";
const KEY = process.env.LEADERBOARD_KEY ?? "scores";
const TTL = Number(process.env.LEADERBOARD_TTL ?? 2_592_000); // 30 days
const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));
const MAX_BODY_BYTES = 2_000;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

/** Thrown for client input problems; mapped to HTTP 400. */
export class ValidationError extends Error {}

/** Read the leaderboard; a missing key means "no scores yet". */
export async function readLeaderboard(store: KeyValueStore): Promise<Score[]> {
  try {
    return parseLeaderboard(await store.load(BUCKET, KEY));
  } catch (error) {
    if (error instanceof KeyNotFoundError) {
      return [];
    }
    throw error;
  }
}

/** Validate input, merge the new score, persist, and return the new board. */
export async function submitScore(
  store: KeyValueStore,
  nameRaw: unknown,
  scoreRaw: unknown,
): Promise<Score[]> {
  const name = sanitizeName(nameRaw);
  if (name === null) {
    throw new ValidationError("name must be a non-empty string (max 16 chars)");
  }
  const score = parseScore(scoreRaw);
  if (score === null) {
    throw new ValidationError("score must be a number between 0 and 1000000000");
  }

  const entries = addScore(await readLeaderboard(store), { name, score });
  await store.save(BUCKET, KEY, serialize(entries), TTL);
  return entries;
}

/** Translate errors into HTTP status + message. 402 becomes a clear message. */
export function describeError(error: unknown): { status: number; message: string } {
  if (error instanceof ValidationError) {
    return { status: 400, message: error.message };
  }
  if (error instanceof InsufficientCreditsError) {
    return {
      status: 503,
      message:
        "Leaderboard storage is out of credits. Recharge the EchoValue wallet.",
    };
  }
  if (error instanceof AuthError) {
    return { status: 503, message: "Leaderboard storage rejected its token." };
  }
  if (error instanceof EchoValueError) {
    return { status: 502, message: "Leaderboard storage is unavailable." };
  }
  return { status: 500, message: "Unexpected error." };
}

function sendJSON(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        reject(new ValidationError("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const resolved = normalize(join(PUBLIC_DIR, relative));
  if (!resolved.startsWith(PUBLIC_DIR)) {
    sendJSON(res, 404, { error: "not found" });
    return;
  }
  try {
    const file = await readFile(resolved);
    const ext = resolved.slice(resolved.lastIndexOf("."));
    res.writeHead(200, {
      "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream",
    });
    res.end(file);
  } catch {
    sendJSON(res, 404, { error: "not found" });
  }
}

export function createHandler(store: KeyValueStore) {
  return async function handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (url.pathname === "/api/scores") {
        if (req.method === "GET") {
          const entries = await readLeaderboard(store);
          sendJSON(res, 200, { scores: top(entries) });
          return;
        }
        if (req.method === "POST") {
          let payload: { name?: unknown; score?: unknown };
          try {
            payload = JSON.parse(await readBody(req));
          } catch (error) {
            if (error instanceof ValidationError) throw error;
            throw new ValidationError("request body must be JSON");
          }
          const entries = await submitScore(store, payload?.name, payload?.score);
          sendJSON(res, 200, { scores: top(entries) });
          return;
        }
        sendJSON(res, 405, { error: "method not allowed" });
        return;
      }

      if (req.method === "GET") {
        await serveStatic(url.pathname, res);
        return;
      }
      sendJSON(res, 404, { error: "not found" });
    } catch (error) {
      const { status, message } = describeError(error);
      sendJSON(res, status, { error: message });
    }
  };
}

function start(): void {
  const token = process.env.ECHOVALUE_TOKEN ?? "";
  if (token.length < 10) {
    console.error("Set ECHOVALUE_TOKEN (see .env.example).");
    process.exit(2);
  }

  const store = new EchoValueClient({ token });
  const port = Number(process.env.PORT ?? 3000);
  const server = createServer(createHandler(store));
  server.listen(port, () => {
    console.log(`Leaderboard running at http://localhost:${port}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start();
}
