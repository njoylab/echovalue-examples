"""Optional live integration test. Disabled unless RUN_LIVE_TESTS=1.

It writes and deletes one key against the real API, costing 2 credits.
Never run this in CI without a real token.

    RUN_LIVE_TESTS=1 ECHOVALUE_TOKEN=... python3 -m unittest test_live -v
"""

from __future__ import annotations

import os
import unittest

from shared_state import EchoValueClient, KeyNotFoundError

RUN_LIVE = os.environ.get("RUN_LIVE_TESTS") == "1" and len(
    os.environ.get("ECHOVALUE_TOKEN", "")
) >= 10


@unittest.skipUnless(RUN_LIVE, "set RUN_LIVE_TESTS=1 and ECHOVALUE_TOKEN to enable")
class LiveTests(unittest.TestCase):
    def test_roundtrip(self) -> None:
        client = EchoValueClient(os.environ["ECHOVALUE_TOKEN"])
        bucket, key = "agent-demo", "live-test"
        client.save(bucket, key, "hello from examples", ttl=60)
        try:
            self.assertEqual(client.load(bucket, key).strip(), "hello from examples")
        finally:
            client.delete(bucket, key)
        with self.assertRaises(KeyNotFoundError):
            client.load(bucket, key)


if __name__ == "__main__":
    unittest.main()
