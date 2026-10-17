"""Agent A (planner): produces a plan and persists it to EchoValue.

Run this first, in its own process:

    python3 agent_a.py "edge caching"

Agent B then reads the plan from a *different* process (and could run on a
different machine or in a different container).
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
)

BUCKET = os.environ.get("ECHOVALUE_BUCKET", "agent-demo")
KEY = os.environ.get("ECHOVALUE_KEY", "handoff")
TTL_SECONDS = 3600


def build_plan(topic: str) -> dict:
    """Deterministic 'thinking' - no LLM required for the basic demo."""
    return {
        "topic": topic,
        "producer": "agent-a",
        "status": "planned",
        "steps": [
            f"Collect two sources about {topic}",
            f"Extract the three key points about {topic}",
            f"Write a 120-word brief on {topic}",
        ],
    }


def run(client: EchoValueClient, topic: str) -> dict:
    plan = build_plan(topic)
    client.save(BUCKET, KEY, plan, ttl=TTL_SECONDS)
    return plan


def main(argv: list[str]) -> int:
    token = os.environ.get("ECHOVALUE_TOKEN", "")
    if len(token) < 10:
        print("Set ECHOVALUE_TOKEN (see .env.example).", file=sys.stderr)
        return 2

    topic = " ".join(argv[1:]) or os.environ.get("TOPIC", "edge caching")
    client = EchoValueClient(token)

    try:
        plan = run(client, topic)
    except InsufficientCreditsError as err:
        print(f"Out of credits: {err}", file=sys.stderr)
        print(f"Recharge here: {err.recharge_url}", file=sys.stderr)
        return 1
    except AuthError as err:
        print(f"Auth failed: {err}", file=sys.stderr)
        return 1
    except (EchoValueError, ValueError) as err:
        print(f"Failed to save plan: {err}", file=sys.stderr)
        return 1

    print("agent-a (planner)")
    print(f"  saved plan to {BUCKET}/{KEY} on EchoValue (1 credit)")
    for index, step in enumerate(plan["steps"], start=1):
        print(f"  {index}. {step}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
