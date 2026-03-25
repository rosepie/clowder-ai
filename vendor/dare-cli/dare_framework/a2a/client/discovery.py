"""A2A Agent discovery: well-known URI and direct URL (a2acn.com/specification/discovery)."""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


async def discover_agent_card(
    base_url: str,
    *,
    headers: dict[str, str] | None = None,
    timeout_seconds: float = 10.0,
) -> dict[str, Any]:
    """Fetch AgentCard from well-known URI: GET {base_url}/.well-known/agent.json.

    Args:
        base_url: Agent server base URL (e.g. https://localhost:8010), no trailing slash.
        headers: Optional HTTP headers (e.g. Authorization).
        timeout_seconds: Request timeout.

    Returns:
        AgentCard as dict.

    Raises:
        Exception: On network or parse error.
    """
    try:
        import httpx
    except ImportError as e:
        raise ImportError("httpx required for A2A client. pip install httpx") from e

    url = f"{base_url.rstrip('/')}/.well-known/agent.json"
    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        response = await client.get(url, headers=headers or {})
        response.raise_for_status()
        return response.json()


def discover_agent_card_sync(
    base_url: str,
    *,
    headers: dict[str, str] | None = None,
    timeout_seconds: float = 10.0,
) -> dict[str, Any]:
    """Synchronous version of discover_agent_card."""
    try:
        import httpx
    except ImportError as e:
        raise ImportError("httpx required for A2A client. pip install httpx") from e

    url = f"{base_url.rstrip('/')}/.well-known/agent.json"
    with httpx.Client(timeout=timeout_seconds) as client:
        response = client.get(url, headers=headers or {})
        response.raise_for_status()
        return response.json()
