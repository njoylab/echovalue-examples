"""Agent B (executor): reads the plan Agent A wrote and continues the work.

Run this after `agent_a.py`, as a separate process:

    python3 agent_b.py

It fetches shared state over HTTP - not from local memory - so it works
even when the two agents run in different processes, containers, or hosts.
"""

from __future__ import annotations

import json
import os
import sys

from shared_state import (
    AuthError,
    EchoValueClient,
    EchoValueError,
    InsufficientCreditsError,
    KeyNotFoundError,
)

BUCKET = os.environ.get("ECHOVALUE_BUCKET", "agent-demo")
KEY = os.environ.get("ECHOVALUE_KEY", "handoff")
RESULT_KEY = os.environ.get("ECHOVALUE_RESULT_KEY", "brief")
TTL_SECONDS = 3600


def execute(plan: dict) -> dict:
    """Turn the planner's steps into a finished brief (no LLM required)."""
    topic = plan["topic"]
    steps = plan.get("steps", [])
    return {
        "topic": topic,
        "producer": "agent-b",
        "consumed_from": plan.get("producer", "unknown"),
        "status": "done",
        "summary": (
            f"{topic}: {len(steps)} steps executed. "
            "Key points: cheaper reads, fewer round trips, simpler deploys."
        ),
    }


def run(client: EchoValueClient) -> dict:
    plan = client.load_json(BUCKET, KEY)
    brief = execute(plan)
    client.save(BUCKET, RESULT_KEY, brief, ttl=TTL_SECONDS)
    return brief


def main() -> int:
    token = os.environ.get("ECHOVALUE_TOKEN", "")
    if len(token) < 10:
        print("Set ECHOVALUE_TOKEN (see .env.example).", file=sys.stderr)
        return 2

    client = EchoValueClient(token)

    try:
        brief = run(client)
    except KeyNotFoundError:
        print(
            f"No plan found at {BUCKET}/{KEY}. Run `python3 agent_a.py` first.",
            file=sys.stderr,
        )
        return 1
    except InsufficientCreditsError as err:
        print(f"Out of credits: {err}", file=sys.stderr)
        print(f"Recharge here: {err.recharge_url}", file=sys.stderr)
        return 1
    except AuthError as err:
        print(f"Auth failed: {err}", file=sys.stderr)
        return 1
    except (EchoValueError, ValueError, json.JSONDecodeError) as err:
        print(f"Failed to execute plan: {err}", file=sys.stderr)
        return 1

    print("agent-b (executor)")
    print(f"  read plan from {BUCKET}/{KEY} over HTTP (1 credit)")
    print(f"  producer={brief['consumed_from']} topic={brief['topic']!r}")
    print(f"  wrote brief to {BUCKET}/{RESULT_KEY} (1 credit)")
    print(f"  {brief['summary']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
