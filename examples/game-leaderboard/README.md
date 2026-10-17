# Build a Game Leaderboard Without a Database

A small browser game needs to store high scores without provisioning a database.
This example stores the whole leaderboard in a single EchoValue key and serves it
back sorted, top 10 first.

```
browser  --POST /api/scores-->  Node server  --HTTP PUT/GET-->  EchoValue
         <--GET  /api/scores--               (bucket "leaderboard", key "scores")
```

The browser only talks to the local server. The EchoValue token stays on the
server and is never sent to the client.

## Stack

- Plain `node:http` server - no Express, no framework.
- TypeScript, run directly by Node (no build step).
- Static HTML/CSS/JS frontend - no React, no bundler.
- Storage: EchoValue key-value API.

## Prerequisites

- Node.js 22.18+.

## Setup

```sh
cd typescript
cp .env.example .env        # paste your token into ECHOVALUE_TOKEN
npm install                 # dev tools only (typescript, @types/node)
npm start                   # http://localhost:3000
```

Open http://localhost:3000, enter a name and a score, and submit. Refresh the page
or restart the server - the scores persist because they live in EchoValue.

Get a free token first:

```sh
curl 'https://api.echovalue.dev/token' -d 'token=new'
```

## HTTP API

| Method | Path | Body | Result |
| ------ | ---- | ---- | ------ |
| `GET` | `/api/scores` | - | `{ "scores": [ ...top 10 ] }` |
| `POST` | `/api/scores` | `{ "name": "neo", "score": 9000 }` | `{ "scores": [ ...top 10 ] }` |

Example:

```sh
curl -s http://localhost:3000/api/scores
# {"scores":[{"name":"neo","score":9000},{"name":"trinity","score":8500}]}

curl -s -X POST http://localhost:3000/api/scores \
  -H 'content-type: application/json' \
  -d '{"name":"morpheus","score":7000}'
```

## How it is stored

EchoValue stores one string per key (max 1000 bytes), so the leaderboard is a JSON
array in `leaderboard/scores`:

```json
[{"name":"neo","score":9000},{"name":"trinity","score":8500}]
```

- On read, the server fetches the key and sorts scores descending.
- On write, it reads, inserts, sorts, caps the list at 20 entries, and stores it.
- A missing key (`404`) means "no scores yet" and returns an empty board.
- The list is capped so the serialized payload stays under 1000 bytes.

## Error handling

- Invalid input returns `400`.
- Credit exhaustion (`HTTP 402` from EchoValue) returns `503` with
  `{"error":"Leaderboard storage is out of credits. Recharge the EchoValue wallet."}`
  A recharge link is available via `GET /recharge`.
- Other storage failures return `502` with a short message.
- The browser shows the server's error message instead of failing silently.

## Credit consumption

| Operation | Credits |
| --------- | ------- |
| Load the leaderboard (`GET /api/scores`) | 1 |
| Submit a score (`POST /api/scores`, one read + one write) | 2 |

Scores persist for the key's TTL (30 days by default; set `LEADERBOARD_TTL`).

## Tests

Tests mock the API, consume no credits, and need no secrets.

```sh
npm test          # unit tests (node:test)
npm run typecheck # tsc --noEmit
```

Optional live test (a few credits), disabled by default:

```sh
RUN_LIVE_TESTS=1 ECHOVALUE_TOKEN=... npm run test:live
```

## Limitations

- The read-modify-write update is not atomic. Two simultaneous submissions can lose
  one update. This is acceptable for a small game; add a queue or a lock key if you
  need strict correctness.
- Only the top 20 scores are retained, so the board fits in one 1000-byte value.
- The client keeps the full leaderboard in one key rather than one key per player,
  which keeps every read to a single API call.

## Notes

- All storage happens server-side; the token is never exposed to the browser.
- Values are capped at 1000 bytes and bucket/key names at 30 characters.
- The API is behind Cloudflare and requires an explicit `User-Agent` header, which
  the client sends.
