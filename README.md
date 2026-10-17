# EchoValue Examples

Practical examples of using HTTP key-value storage without setting up a database.

EchoValue is a hosted key-value API. You send one HTTP request with a token, a
bucket, and a key; it stores a small string (up to 1000 bytes) that you can read
back later. No schema, no server, no connection pool. New tokens include 100 free
credits and need no registration.

## Minimal example

```sh
# 1. Get a free token (100 credits)
TOKEN=$(curl -s 'https://api.echovalue.dev/token' -d 'token=new')

# 2. Store a value (1 credit)
curl 'https://api.echovalue.dev/kv/default/greeting' \
  -H "x-token: $TOKEN" \
  -d 'hello world'

# 3. Read it back (1 credit)
curl 'https://api.echovalue.dev/kv/default/greeting' -H "x-token: $TOKEN"
# -> hello world
```

Every key-value call costs 1 credit. The balance and cost come back in the
`x-balance` and `x-cost` response headers. Failed requests still consume credits
except `GET /token/logs`.

## Examples

### [Share state between AI agents without Redis](examples/agent-shared-state/)

Two independent agent processes that hand off a task through EchoValue instead of
in-memory state. Available in Python and TypeScript, and the demo runs without any
LLM provider.

### [Build a game leaderboard without a database](examples/game-leaderboard/)

A minimal Node.js server and browser page that store a top-10 high score list in a
single EchoValue key. TypeScript, no framework, no database.

## Get a token

```sh
curl 'https://api.echovalue.dev/token' -d 'token=new'
```

Tokens are free and anonymous. Keep yours in an environment variable or a `.env`
file. Never commit it and never ship it to the browser.

## Pricing

| Tier | Price | Credits |
| ---- | ----- | ------- |
| Free | $0 | 100 |
| Standard | $4 | 1,000,000 |
| Pro | $10 | 3,000,000 |

Credits never expire and there is no subscription. Check the balance with
`GET /token` or the `x-balance` header, and add credits with `GET /recharge`.

## Documentation

- Overview: https://docs.echovalue.dev/
- Key-value store: https://docs.echovalue.dev/key-value/
- Agent shared state guide: https://docs.echovalue.dev/guides/agent-shared-state/
- API cheat sheet: https://docs.echovalue.dev/api-cheat-sheet/
- Errors: https://docs.echovalue.dev/errors/

## Notes

- Values are strings up to 1000 bytes. Keys and buckets are up to 30 characters
  matching `[A-Za-z0-9_-]`. The default TTL is 30 days.
- The API is served behind Cloudflare, which rejects default library user agents
  with HTTP 403 (`error code: 1010`). Send an explicit `User-Agent` header. Every
  example here does this.
- Each example folder is independent and has its own README, tests, and
  `.env.example`.
