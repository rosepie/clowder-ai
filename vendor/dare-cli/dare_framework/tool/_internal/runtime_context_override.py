"""Internal marker for runtime-context override between gateway layers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from dare_framework.context import Context


RUNTIME_CONTEXT_PARAM = "__dare_runtime_context__"


@dataclass(frozen=True)
class RuntimeContextOverride:
    """Opaque wrapper so user payload keys cannot spoof runtime context."""

    context: Context | None


__all__ = ["RUNTIME_CONTEXT_PARAM", "RuntimeContextOverride"]
