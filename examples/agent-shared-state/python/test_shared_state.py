"""Unit tests for the EchoValue client. No network, no credits consumed.

Run: python3 -m unittest discover -v
"""

from __future__ import annotations

import io
import json
import unittest
import urllib.error
from unittest import mock

import shared_state
from shared_state import (
    AuthError,
    EchoValueClient,
    EchoValueError,
    InsufficientCreditsError,
    KeyNotFoundError,
)


def http_error(code: int, body: str = "error") -> urllib.error.HTTPError:
    return urllib.error.HTTPError(
        url="https://api.echovalue.dev/kv/b/k",
        code=code,
        msg="err",
        hdrs=None,  # type: ignore[arg-type]
        fp=io.BytesIO(body.encode()),
    )


class FakeResponse:
    def __init__(self, body: bytes) -> None:
        self._body = body

    def read(self) -> bytes:
        return self._body

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *_: object) -> None:
        return None


class ClientTests(unittest.TestCase):
    def test_rejects_short_token(self) -> None:
        with self.assertRaises(ValueError):
            EchoValueClient("short")

    @mock.patch("shared_state.urllib.request.urlopen")
    def test_save_encodes_json_and_sets_ttl(self, urlopen: mock.Mock) -> None:
        urlopen.return_value = FakeResponse(b"OK\n")
        client = EchoValueClient("valid-token-123")
        client.save("bucket", "key", {"a": 1}, ttl=60)

        request = urlopen.call_args.args[0]
        self.assertEqual(request.method, "POST")
        self.assertTrue(request.full_url.endswith("/kv/bucket/key?ttl=60"))
        self.assertEqual(request.data, b'{"a":1}')
        self.assertEqual(request.get_header("X-token"), "valid-token-123")
        self.assertEqual(request.get_header("User-agent"), shared_state.USER_AGENT)

    @mock.patch("shared_state.urllib.request.urlopen")
    def test_save_rejects_oversized_value(self, urlopen: mock.Mock) -> None:
        client = EchoValueClient("valid-token-123")
        with self.assertRaises(ValueError):
            client.save("bucket", "key", "x" * 1001)
        urlopen.assert_not_called()

    @mock.patch("shared_state.urllib.request.urlopen")
    def test_load_returns_body(self, urlopen: mock.Mock) -> None:
        urlopen.return_value = FakeResponse(b"hello\n")
        client = EchoValueClient("valid-token-123")
        self.assertEqual(client.load("bucket", "key"), "hello\n")

    @mock.patch("shared_state.urllib.request.urlopen")
    def test_load_json_parses_body(self, urlopen: mock.Mock) -> None:
        urlopen.return_value = FakeResponse(json.dumps({"status": "done"}).encode())
        client = EchoValueClient("valid-token-123")
        self.assertEqual(client.load_json("bucket", "key"), {"status": "done"})

    @mock.patch("shared_state.urllib.request.urlopen")
    def test_missing_key_raises(self, urlopen: mock.Mock) -> None:
        urlopen.side_effect = http_error(404, "Key Not Found")
        client = EchoValueClient("valid-token-123")
        with self.assertRaises(KeyNotFoundError):
            client.load("bucket", "key")

    @mock.patch("shared_state.urllib.request.urlopen")
    def test_402_raises_insufficient_credits(self, urlopen: mock.Mock) -> None:
        urlopen.side_effect = http_error(402, "Payment required")
        client = EchoValueClient("valid-token-123")
        with self.assertRaises(InsufficientCreditsError) as ctx:
            client.save("bucket", "key", "value")
        self.assertIn("/recharge", ctx.exception.recharge_url)

    @mock.patch("shared_state.urllib.request.urlopen")
    def test_401_raises_auth_error(self, urlopen: mock.Mock) -> None:
        urlopen.side_effect = http_error(401, "Unauthorized")
        client = EchoValueClient("valid-token-123")
        with self.assertRaises(AuthError):
            client.load("bucket", "key")

    @mock.patch("shared_state.urllib.request.urlopen")
    def test_other_errors_raise_base_error(self, urlopen: mock.Mock) -> None:
        urlopen.side_effect = http_error(500, "boom")
        client = EchoValueClient("valid-token-123")
        with self.assertRaises(EchoValueError):
            client.load("bucket", "key")


if __name__ == "__main__":
    unittest.main()
