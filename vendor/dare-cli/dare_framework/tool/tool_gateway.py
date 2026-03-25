from typing import Any

from dare_framework.context import Context
from dare_framework.plan import Envelope
from dare_framework.tool._internal.runtime_context_override import (
    RUNTIME_CONTEXT_PARAM,
    RuntimeContextOverride,
)
from dare_framework.tool import IToolGateway, IToolManager, ToolResult, CapabilityDescriptor, RunContext


class ToolGateway(IToolGateway):
    _RUNTIME_CONTEXT_PARAM = RUNTIME_CONTEXT_PARAM

    def __init__(self, tool_manager: IToolManager):
        self._tool_manager = tool_manager

    def list_capabilities(self) -> list[CapabilityDescriptor]:
        return self._tool_manager.list_capabilities()

    # noinspection PyMethodOverriding
    async def invoke(
            self,
            capability_id: str,
            *,
            envelope: Envelope,
            context: Context | None = None,
            **params: Any,
    ) -> ToolResult:
        if envelope.allowed_capability_ids and capability_id not in envelope.allowed_capability_ids:
            raise PermissionError(f"Capability '{capability_id}' not allowed by envelope")
        tool_params = dict(params)
        runtime_context = context
        runtime_context_override = tool_params.pop(self._RUNTIME_CONTEXT_PARAM, None)
        # Ignore caller-provided values on this reserved key unless they carry
        # the internal wrapper type injected by GovernedToolGateway.
        if isinstance(runtime_context_override, RuntimeContextOverride):
            runtime_context = runtime_context_override.context
            if context is not None:
                # `context` was consumed by this gateway's reserved kwarg slot;
                # recover it as an explicit tool argument when collision occurs.
                tool_params.setdefault("context", context)
        tool = self._tool_manager.get_tool(capability_id)
        tool_context = RunContext(runtime_context)
        return await tool.execute(run_context=tool_context, **tool_params)
