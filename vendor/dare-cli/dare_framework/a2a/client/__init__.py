"""A2A Client: discover agents and call tasks/send, tasks/get (a2acn.com)."""

from dare_framework.a2a.client.client import A2AClient, A2AClientError
from dare_framework.a2a.client.discovery import discover_agent_card

__all__ = ["A2AClient", "A2AClientError", "discover_agent_card"]
