"""A2A Server: expose DARE Agent over A2A protocol."""

from dare_framework.a2a.server.agent_card import build_agent_card
from dare_framework.a2a.server.transport import create_a2a_app

__all__ = ["build_agent_card", "create_a2a_app"]
