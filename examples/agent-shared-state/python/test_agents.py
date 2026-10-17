"""Tests for the agent logic using an in-memory fake. No network."""

from __future__ import annotations

import json
import os
import unittest

import agent_a
import agent_b
from shared_state import KeyNotFoundError


class FakeClient:
    """Minimal stand-in for EchoValueClient backed by a dict."""

    def __init__(self) -> None:
        self.store: dict[tuple[str, str], str] = {}
        self.saves: list[tuple[str, str]] = []

    def save(self, bucket: str, key: str, value: object, ttl: int = 0) -> None:
        if isinstance(value, (dict, list)):
            value = json.dumps(value)
        self.store[(bucket, key)] = str(value)
        self.saves.append((bucket, key))

    def load(self, bucket: str, key: str) -> str:
        try:
            return self.store[(bucket, key)]
        except KeyError as err:
            raise KeyNotFoundError("missing") from err

    def load_json(self, bucket: str, key: str) -> object:
        return json.loads(self.load(bucket, key))


class AgentLogicTests(unittest.TestCase):
    def test_plan_shape(self) -> None:
        plan = agent_a.build_plan("edge caching")
        self.assertEqual(plan["producer"], "agent-a")
        self.assertEqual(plan["status"], "planned")
        self.assertEqual(len(plan["steps"]), 3)

    def test_execute_consumes_plan(self) -> None:
        brief = agent_b.execute(agent_a.build_plan("edge caching"))
        self.assertEqual(brief["producer"], "agent-b")
        self.assertEqual(brief["consumed_from"], "agent-a")
        self.assertEqual(brief["status"], "done")
        self.assertIn("edge caching", brief["summary"])

    def test_handoff_between_agents(self) -> None:
        client = FakeClient()
        agent_a.run(client, "edge caching")  # type: ignore[arg-type]
        brief = agent_b.run(client)  # type: ignore[arg-type]

        self.assertEqual(brief["topic"], "edge caching")
        self.assertEqual(brief["consumed_from"], "agent-a")
        self.assertEqual(
            client.saves,
            [(agent_a.BUCKET, agent_a.KEY), (agent_b.BUCKET, agent_b.RESULT_KEY)],
        )

    def test_consumer_fails_without_producer(self) -> None:
        with self.assertRaises(KeyNotFoundError):
            agent_b.run(FakeClient())  # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()
