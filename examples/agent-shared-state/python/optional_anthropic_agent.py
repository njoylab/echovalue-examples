"""Optional: plug real LLM agents into the same shared state (not tested).

This mirrors the official guide:
https://docs.echovalue.dev/guides/agent-shared-state/

Requires `pip install anthropic` and an ANTHROPIC_API_KEY. The basic demo
(`agent_a.py` / `agent_b.py`) needs neither.
"""

from __future__ import annotations

import os
import sys

from shared_state import EchoValueClient

TOOLS = [
    {
        "name": "save_state",
        "description": "Save a value to shared agent state",
        "input_schema": {
            "type": "object",
            "properties": {
                "key": {"type": "string"},
                "value": {"type": "string"},
            },
            "required": ["key", "value"],
        },
    },
    {
        "name": "read_state",
        "description": "Read a value from shared agent state",
        "input_schema": {
            "type": "object",
            "properties": {"key": {"type": "string"}},
            "required": ["key"],
        },
    },
]


def main() -> int:
    try:
        from anthropic import Anthropic
    except ImportError:
        print("pip install anthropic", file=sys.stderr)
        return 1

    token = os.environ.get("ECHOVALUE_TOKEN", "")
    if len(token) < 10:
        print("Set ECHOVALUE_TOKEN", file=sys.stderr)
        return 2

    client = EchoValueClient(token)
    anthropic = Anthropic()

    response = anthropic.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=512,
        tools=TOOLS,
        messages=[{"role": "user", "content": "Save status=done under key pipeline"}],
    )

    for block in response.content:
        if block.type != "tool_use":
            continue
        if block.name == "save_state":
            client.save("agent-demo", block.input["key"], block.input["value"], ttl=3600)
            print(f"save_state {block.input['key']} -> OK")
        elif block.name == "read_state":
            print(f"read_state {block.input['key']} -> {client.load('agent-demo', block.input['key'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
