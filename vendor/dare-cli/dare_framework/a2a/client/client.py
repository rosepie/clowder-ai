"""A2A Client: call remote tasks/send, tasks/get, tasks/cancel (a2acn.com)."""

from __future__ import annotations

import json
import logging
from typing import Any

from dare_framework.a2a.types import text_part

logger = logging.getLogger(__name__)


class A2AClient:
    """Client for calling a remote A2A agent (tasks/send, tasks/get, tasks/cancel)."""

    def __init__(
        self,
        base_url: str,
        *,
        headers: dict[str, str] | None = None,
        bearer_token: str | None = None,
        timeout_seconds: float = 60.0,
    ) -> None:
        """Initialize client with agent base URL (from AgentCard.url).

        Args:
            base_url: Agent base URL (e.g. from AgentCard["url"]).
            headers: Optional HTTP headers (e.g. for custom auth).
            bearer_token: If set, adds Authorization: Bearer <token> to all requests.
            timeout_seconds: Request timeout.
        """
        self._base_url = base_url.rstrip("/")
        self._headers = dict(headers) if headers else {}
        if bearer_token:
            self._headers["Authorization"] = f"Bearer {bearer_token.strip()}"
        self._timeout = timeout_seconds

    def _post_json_rpc(self, method: str, params: dict[str, Any], request_id: int | str = 1) -> dict[str, Any]:
        """Send JSON-RPC request and return response (sync)."""
        try:
            import httpx
        except ImportError as e:
            raise ImportError("httpx required for A2A client. pip install httpx") from e

        body = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params}
        url = f"{self._base_url}/"
        h = {**self._headers, "Content-Type": "application/json"}
        with httpx.Client(timeout=self._timeout) as client:
            response = client.post(url, json=body, headers=h)
            response.raise_for_status()
            data = response.json()
        if "error" in data:
            err = data["error"]
            raise A2AClientError(err.get("code", -1), err.get("message", "Unknown error"), err.get("data"))
        return data.get("result", {})

    async def _post_json_rpc_async(self, method: str, params: dict[str, Any], request_id: int | str = 1) -> dict[str, Any]:
        """Send JSON-RPC request and return response (async)."""
        try:
            import httpx
        except ImportError as e:
            raise ImportError("httpx required for A2A client. pip install httpx") from e

        body = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params}
        url = f"{self._base_url}/"
        h = {**self._headers, "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(url, json=body, headers=h)
            response.raise_for_status()
            data = response.json()
        if "error" in data:
            err = data["error"]
            raise A2AClientError(err.get("code", -1), err.get("message", "Unknown error"), err.get("data"))
        return data.get("result", {})

    def send(self, message_text: str, *, task_id: str | None = None, session_id: str | None = None) -> dict[str, Any]:
        """Call tasks/send with a text message. Returns task state dict."""
        from uuid import uuid4
        params: dict[str, Any] = {
            "id": task_id or str(uuid4()),
            "message": {"role": "user", "parts": [text_part(message_text)]},
        }
        if session_id is not None:
            params["sessionId"] = session_id
        return self._post_json_rpc("tasks/send", params)

    async def send_async(
        self,
        message_text: str,
        *,
        task_id: str | None = None,
        session_id: str | None = None,
    ) -> dict[str, Any]:
        """Async: call tasks/send with a text message."""
        from uuid import uuid4
        params: dict[str, Any] = {
            "id": task_id or str(uuid4()),
            "message": {"role": "user", "parts": [text_part(message_text)]},
        }
        if session_id is not None:
            params["sessionId"] = session_id
        return await self._post_json_rpc_async("tasks/send", params)

    def get(self, task_id: str, session_id: str | None = None) -> dict[str, Any]:
        """Call tasks/get. Returns task state dict."""
        params: dict[str, Any] = {"id": task_id}
        if session_id is not None:
            params["sessionId"] = session_id
        return self._post_json_rpc("tasks/get", params)

    async def get_async(self, task_id: str, session_id: str | None = None) -> dict[str, Any]:
        """Async: call tasks/get."""
        params = {"id": task_id}
        if session_id is not None:
            params["sessionId"] = session_id
        return await self._post_json_rpc_async("tasks/get", params)

    def cancel(self, task_id: str, session_id: str | None = None) -> dict[str, Any]:
        """Call tasks/cancel."""
        params = {"id": task_id}
        if session_id is not None:
            params["sessionId"] = session_id
        return self._post_json_rpc("tasks/cancel", params)

    async def cancel_async(self, task_id: str, session_id: str | None = None) -> dict[str, Any]:
        """Async: call tasks/cancel."""
        params = {"id": task_id}
        if session_id is not None:
            params["sessionId"] = session_id
        return await self._post_json_rpc_async("tasks/cancel", params)

    async def send_subscribe(
        self,
        message_text: str,
        *,
        task_id: str | None = None,
        session_id: str | None = None,
    ):
        """Async generator: call tasks/sendSubscribe (SSE), yield task state events as dicts."""
        try:
            import httpx
        except ImportError as e:
            raise ImportError("httpx required for A2A client. pip install httpx") from e

        from uuid import uuid4
        params = {
            "id": task_id or str(uuid4()),
            "message": {"role": "user", "parts": [text_part(message_text)]},
        }
        if session_id is not None:
            params["sessionId"] = session_id
        body = {"jsonrpc": "2.0", "id": 1, "method": "tasks/sendSubscribe", "params": params}
        url = f"{self._base_url}/"
        h = {**self._headers, "Content-Type": "application/json", "Accept": "text/event-stream"}
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            async with client.stream("POST", url, json=body, headers=h) as response:
                response.raise_for_status()
                buffer = ""
                async for chunk in response.aiter_text():
                    buffer += chunk
                    while "\n\n" in buffer:
                        event_block, buffer = buffer.split("\n\n", 1)
                        for line in event_block.split("\n"):
                            if line.startswith("data:"):
                                data = line[5:].strip()
                                if data:
                                    try:
                                        yield json.loads(data)
                                    except json.JSONDecodeError:
                                        pass
                                break


class A2AClientError(Exception):
    """JSON-RPC or transport error from A2A server."""

    def __init__(self, code: int, message: str, data: Any = None) -> None:
        self.code = code
        self.message = message
        self.data = data
        super().__init__(f"[{code}] {message}")
