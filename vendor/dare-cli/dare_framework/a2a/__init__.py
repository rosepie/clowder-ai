"""A2A (Agent-to-Agent) protocol support for DARE Framework.

Design and roadmap: see DESIGN.md in this package.
Reference: https://a2acn.com/

Server usage:
    from dare_framework.a2a.server import build_agent_card, create_a2a_app

    card = build_agent_card(config, "http://localhost:8010")
    app = create_a2a_app(card, agent.run)
    # Run with: uvicorn your_module:app --host 0.0.0.0 --port 8010
"""

from dare_framework.a2a.server import build_agent_card, create_a2a_app
from dare_framework.a2a.client import A2AClient, A2AClientError, discover_agent_card
from dare_framework.a2a import types as a2a_types

__all__ = [
    "build_agent_card",
    "create_a2a_app",
    "A2AClient",
    "A2AClientError",
    "discover_agent_card",
    "a2a_types",
]
