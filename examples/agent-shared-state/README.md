# Share State Between AI Agents Without Redis

Two independent AI agent processes that hand off work through EchoValue instead of
shared memory. Agent A produces a plan and stores it; Agent B reads it back over
HTTP and finishes the job. The two processes never share a heap, and they could run
in different containers or on different hosts.

```
agent-a (process 1)  --HTTP POST-->  EchoValue  --HTTP GET-->  agent-b (process 2)
   builds a plan                     agent-demo/handoff            executes it
```

The basic demo is deterministic and needs **no LLM** - only a token. An optional
section shows how to expose the same storage to a real LLM agent.

## When this is useful

- A planner agent and a worker agent run as separate services.
- A serverless function needs to pass state to the next invocation.
- A cron job writes a result that a web request reads later.
- You want shared flags, locks, or status between agents without deploying Redis.

## Prerequisites

- Python 3.10+ (Python example) or Node.js 22.18+ (TypeScript example).
- A free EchoValue token.

## Setup

```sh
# Get a free token (100 credits, no registration)
curl 'https://api.echovalue.dev/token' -d 'token=new'
```

## Python

```sh
cd python
cp .env.example .env        # paste the token into ECHOVALUE_TOKEN
./demo.sh "edge caching"    # runs both agents as separate processes
```

Or run the two agents yourself, in two terminals:

```sh
export ECHOVALUE_TOKEN=your-token

# terminal 1
python3 agent_a.py "edge caching"

# terminal 2 (run after agent A finishes)
python3 agent_b.py
```

Expected output:

```
agent-a (planner)
  saved plan to agent-demo/handoff on EchoValue (1 credit)
  1. Collect two sources about edge caching
  2. Extract the three key points about edge caching
  3. Write a 120-word brief on edge caching

agent-b (executor)
  read plan from agent-demo/handoff over HTTP (1 credit)
  producer=agent-a topic='edge caching'
  wrote brief to agent-demo/brief (1 credit)
  edge caching: 3 steps executed. Key points: cheaper reads, fewer round trips, simpler deploys.
```

`agent-a.py` and `agent-b.py` share `shared_state.py`, a small client built only on
the Python standard library. No `pip install` required.

## TypeScript

```sh
cd typescript
cp .env.example .env        # paste the token into ECHOVALUE_TOKEN
./demo.sh "edge caching"
```

Or with explicit environment variables:

```sh
export ECHOVALUE_TOKEN=your-token
node agent-a.ts "edge caching"
node agent-b.ts
```

Expected output is the same as the Python version. The TypeScript client uses the
global `fetch` (Node 18+) and has no runtime dependencies. `npm install` only pulls
dev tools for `npm test` and `npm run typecheck`.

## Credit consumption

| Operation | Credits |
| --------- | ------- |
| Agent A stores the plan | 1 |
| Agent B reads the plan | 1 |
| Agent B stores the brief | 1 |
| **Total per demo** | **3** |

The free token includes 100 credits, so you can run the demo about 33 times. If the
wallet runs out, the API returns HTTP 402 and the clients print a recharge link
(`GET /recharge`).

## Tests

Tests mock the HTTP layer, consume no credits, and need no secrets.

```sh
# Python
cd python && python3 -m unittest discover -v

# TypeScript
cd typescript && npm install && npm test && npm run typecheck
```

Optional live tests hit the real API (a few credits) and are disabled by default:

```sh
RUN_LIVE_TESTS=1 ECHOVALUE_TOKEN=... python3 -m unittest test_live -v
RUN_LIVE_TESTS=1 ECHOVALUE_TOKEN=... npm run test:live
```

## Optional: real LLM agents

The storage mechanism is the point, so the demo avoids an LLM provider. To drive it
with a model instead, see `python/optional_anthropic_agent.py` and
`typescript/optional/anthropic-agent.ts`. They register `save_state` / `read_state`
as tools and route tool calls to the same client. These files require the
`anthropic` SDK and an `ANTHROPIC_API_KEY`, and are not covered by the tests.

Based on the official guide: https://docs.echovalue.dev/guides/agent-shared-state/

## Notes

- Bucket and key names must be 30 characters or fewer and match `[A-Za-z0-9_-]`.
- Values are capped at 1000 bytes; the client JSON-encodes objects and arrays.
- The default TTL is 30 days. The demo sets a 1-hour TTL so stale keys clean up.
- Keep the token in an environment variable. It is sent only in the `x-token`
  header and is never logged.
