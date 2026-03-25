"""JSON renderer used in non-interactive automation flows."""

from __future__ import annotations

import json
from typing import Any


class JsonRenderer:
    """Write structured output only."""

    def emit(self, payload: Any) -> None:
        print(json.dumps(payload, ensure_ascii=False), flush=True)
