"""Small EchoValue key-value client shared by both demo agents.

Standard library only - no `pip install` required.

API reference: https://docs.echovalue.dev/key-value/
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Optional

BASE_URL = "https://api.echovalue.dev"

# The API sits behind Cloudflare, which rejects requests that use a default
# library user agent (403 "error code: 1010"). Always send an explicit one.
USER_AGENT = "echovalue-examples/1.0"

# Each set/get/delete costs 1 credit. https://docs.echovalue.dev/key-value/
MAX_VALUE_BYTES = 1000


class EchoValueError(RuntimeError):
    """Any unexpected EchoValue API failure."""


class AuthError(EchoValueError):
    """HTTP 401 - the token is missing, too short, or invalid."""


class InsufficientCreditsError(EchoValueError):
    """HTTP 402 - the wallet has no credits left."""

    def __init__(self, message: str, recharge_url: str) -> None:
        super().__init__(message)
        self.recharge_url = recharge_url


class KeyNotFoundError(EchoValueError):
    """HTTP 404 - the key does not exist or has expired."""


class EchoValueClient:
    """Tiny wrapper around the `/kv/<bucket>/<key>` endpoints."""

    def __init__(
        self,
        token: str,
        base_url: str = BASE_URL,
        timeout: float = 10.0,
    ) -> None:
        if not token or len(token) < 10:
            raise ValueError("ECHOVALUE_TOKEN must be at least 10 characters")
        self._token = token
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout

    def save(
        self,
        bucket: str,
        key: str,
        value: Any,
        ttl: int = 2_592_000,  # 30 days, the documented maximum
    ) -> None:
        """Store a string, dict, or list. Dicts/lists are JSON-encoded."""
        if isinstance(value, (dict, list)):
            value = json.dumps(value, separators=(",", ":"))
        body = str(value).encode("utf-8")
        if len(body) > MAX_VALUE_BYTES:
            raise ValueError(
                f"value is {len(body)} bytes; EchoValue allows {MAX_VALUE_BYTES}"
            )
        self._request("POST", self._url(bucket, key, ttl=int(ttl)), body)

    def load(self, bucket: str, key: str) -> str:
        return self._request("GET", self._url(bucket, key)).decode("utf-8")

    def load_json(self, bucket: str, key: str) -> Any:
        return json.loads(self.load(bucket, key))

    def delete(self, bucket: str, key: str) -> None:
        self._request("DELETE", self._url(bucket, key))

    def _url(self, bucket: str, key: str, ttl: Optional[int] = None) -> str:
        url = f"{self._base_url}/kv/{bucket}/{key}"
        return f"{url}?ttl={ttl}" if ttl is not None else url

    def _request(self, method: str, url: str, body: Optional[bytes] = None) -> bytes:
        request = urllib.request.Request(url, data=body, method=method)
        # The token is sent on every request and never logged.
        request.add_header("x-token", self._token)
        request.add_header("User-Agent", USER_AGENT)
        request.add_header("Content-Type", "text/plain; charset=utf-8")
        try:
            with urllib.request.urlopen(request, timeout=self._timeout) as response:
                return response.read()
        except urllib.error.HTTPError as err:
            self._raise_for_status(err)
        except urllib.error.URLError as err:
            raise EchoValueError(f"EchoValue request failed: {err.reason}") from err
        raise EchoValueError("EchoValue request failed")

    def _raise_for_status(self, err: urllib.error.HTTPError) -> None:
        detail = err.read().decode("utf-8", "replace").strip()
        if err.code == 401:
            raise AuthError("EchoValue rejected the token (HTTP 401)")
        if err.code == 402:
            recharge_url = f"{self._base_url}/recharge"
            raise InsufficientCreditsError(
                f"EchoValue wallet is out of credits (HTTP 402). "
                f"Recharge at {recharge_url}",
                recharge_url,
            )
        if err.code == 404:
            raise KeyNotFoundError(f"Key not found (HTTP 404): {detail}")
        raise EchoValueError(f"EchoValue error (HTTP {err.code}): {detail}")
