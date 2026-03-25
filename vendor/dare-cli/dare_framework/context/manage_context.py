"""Context management tool - update core and discard messages.

迁移自 `tool._internal.tools.manage_context`，语义保持不变，只是归属到 context 域。
"""

from __future__ import annotations

from typing import Any, TypedDict

from dare_framework.tool.kernel import ITool
from dare_framework.tool._internal.util.__tool_schema_util import (
    infer_input_schema_from_execute,
    infer_output_schema_from_execute,
)
from dare_framework.tool.types import (
    CapabilityKind,
    RunContext,
    ToolResult,
    ToolType,
)

# 工具名常量，供 ReactAgent 排他性检查使用
MANAGE_CONTEXT_TOOL_NAME = "manage_context"

# CORE 格式必含段（与 plan_v2/prompts 中描述一致，调用时校验）
_CORE_REQUIRED_SECTIONS = ("任务", "规划", "执行摘要", "下一步计划")


class ManageContextOutput(TypedDict, total=False):
    """Output schema for manage_context."""

    success: bool
    message: str
    core_updated: bool
    discard_count: int
    task_complete: bool


class ManageContextTool(ITool):
    """Context 管理工具：更新 core、清理 discard。

    【排他性】调用此工具时，不得同时调用其他工具。若需更新 context 且同时执行其他操作，
    请分两轮：先单独调用 manage_context，下一轮再调用其他工具。

    部分模型在 tool call 时不返回 content，无法通过 ---context--- 块更新 context，
    此时必须使用此工具。
    """

    @property
    def name(self) -> str:
        return MANAGE_CONTEXT_TOOL_NAME

    @property
    def description(self) -> str:
        return (
            "更新 context：将重要信息写入 CORE、清理指定 id 的 TEMPORARY 消息、审核任务完成情况更新task_complete。"
            "【排他性】某轮只能调用 manage_context，不能同时调用其他工具。"
            "【用于结束任务】当task_complete=true时，应在下一步计划中写\"无，任务已完成。请下轮返回纯文本进行任务总结以结束任务！\"。"
            "一条信息可以被清理的条件是：要么对任务无用，要么它已经面向交付进行了内容输出，未来的内容输出不再依赖该条临时信息；你要真的查看过交付件以判断是否已经满足清理条件！！！"
            "入参格式："
            "reasoning（string，必填）：说明本轮为何这样更新 core、为什么丢弃/保留了哪些临时消息、任务是否已完成。"
            "core（string，必填）：四段文本，形如 \"任务：xxx\\n\\n规划：xxx\\n\\n执行摘要：xxx\\n\\n下一步计划：xxx\"  。"
            "discard（array[string]，必填）：要删除的 TEMPORARY 消息 id 列表，无则传 []。"
            "task_complete（boolean，必填）：true=任务已完成可结束，false=未完成需继续，对照 USER_TASK 判断。"
        )

    @property
    def input_schema(self) -> dict[str, Any]:
        schema = infer_input_schema_from_execute(type(self).execute)
        # 明确 core 的用法，避免 LLM 传数组/对象或缺少四段
        if "properties" in schema and "core" in schema["properties"]:
            props = schema["properties"]["core"]
            if isinstance(props, dict):
                props = dict(props)
                props["description"] = (
                    "字符串，不能是数组/对象。必须包含四段，并按顺序以这四个小标题开头："
                    "\"任务：\"、\"规划：\"、\"执行摘要：\"、\"下一步计划：\"。"
                    "推荐格式：\"任务：xxx\\n\\n规划：xxx\\n\\n执行摘要：xxx\\n\\n下一步计划：xxx\"。"
                )
                props["examples"] = [
                    "任务：xxx\\n\\n规划：xxx\\n\\n执行摘要：xxx\\n\\n下一步计划：xxx"
                ]
                schema["properties"]["core"] = props
        # 明确 reasoning 的用法，引导 LLM 写出结构化解释
        if "properties" in schema and "reasoning" in schema["properties"]:
            props = schema["properties"]["reasoning"]
            if isinstance(props, dict):
                props = dict(props)
                props["description"] = (
                    "字符串，解释本轮为何这样更新 context。按顺序回答三点，可用 1/2/3 编号："
                    "1) 为何如此更新 core；2) 为何丢弃/保留哪些 TEMPORARY（写明具体 id）；"
                    "3) 任务是否完成：task_complete=true 时说明已满足 USER_TASK；"
                    "task_complete=false 时说明还缺什么、下一步计划是什么。"
                )
                props["examples"] = [
                    "1. 更新 core：xxx\\n2. 丢弃/保留：xxx\\n3. 任务完成度：xxx"
                ]
                schema["properties"]["reasoning"] = props
        # 明确 discard 的用法，避免 LLM 传 "" 或 null
        if "properties" in schema and "discard" in schema["properties"]:
            props = schema["properties"]["discard"]
            if isinstance(props, dict):
                props = dict(props)
                props["description"] = (
                    "数组，元素为要删除的消息 id。无删除时传 []，勿传 \"\" 或 null。"
                    "元素可为字符串或数字（如 [7, 8] 或 [\"7\", \"8\"]），调用时形式为 "
                    "\"discard\": [] 或 \"discard\": [\"7\", \"8\"]。"
                )
                props["examples"] = [
                    [],
                    [7, 8],
                ]
                schema["properties"]["discard"] = props
        # 明确 task_complete 须对照 [USER_TASK] 判断
        if "properties" in schema and "task_complete" in schema["properties"]:
            props = schema["properties"]["task_complete"]
            if isinstance(props, dict):
                props = dict(props)
                desc = props.get("description", "")
                props["description"] = (
                    (f"{desc} " if desc else "")
                    + "必填，布尔（boolean）。true=任务已完成、可结束；false=未完成、需继续。"
                    "判断时须对照 USER_TASK 是否全部满足。"
                )
                props["examples"] = [False, True]
                schema["properties"]["task_complete"] = props
        return schema

    @property
    def output_schema(self) -> dict[str, Any]:
        return infer_output_schema_from_execute(type(self).execute) or {}

    @property
    def risk_level(self) -> str:
        return "read_only"

    @property
    def tool_type(self) -> ToolType:
        return ToolType.ATOMIC

    @property
    def requires_approval(self) -> bool:
        return False

    @property
    def timeout_seconds(self) -> int:
        return 5

    @property
    def produces_assertions(self) -> list[dict[str, Any]]:
        return []

    @property
    def is_work_unit(self) -> bool:
        return False

    @property
    def capability_kind(self) -> CapabilityKind:
        return CapabilityKind.TOOL

    # noinspection PyMethodOverriding
    async def execute(
        self,
        run_context: RunContext[Any],
        reasoning: str = "",
        core: str | None = None,
        discard: list[str] | None = None,
        task_complete: bool = False,
    ) -> ToolResult[ManageContextOutput]:
        """更新 context：core 写入 CORE 消息，discard 删除对应 TEMPORARY 消息。

        Args:
            run_context: 运行时上下文（deps 为 Context）。
            reasoning: 必填，且排在首位。LLM 对本轮更新的解释，须包含：(1) 为何如此更新 core；
                (2) 对 discard/保留消息的解释；(3) **任务是否完成**：若 task_complete=true 说明为何已完成，
                若 false 说明还需做什么。此解释仅打印给用户，不放入下一轮 context。
            core: 要写入 CORE 的内容。须含任务、规划、执行摘要、下一步计划四段，否则校验失败。
            discard: 要删除的消息 id 列表（类型须为 array）。仅删除 mark=TEMPORARY 的消息。
                无消息需删除时必须传 []，勿传 "" 或 null。
            task_complete: 必填，布尔。true 表示任务已完成、agent 可结束；false 表示未完成、需继续。
                须对照 [USER_TASK] 消息中的需求判断是否已全部满足。

        Returns:
            执行结果：core_updated、discard_count、task_complete。不包含 reasoning，避免进入下一轮 context。
        """
        ctx = getattr(run_context, "deps", None)
        if ctx is None:
            return ToolResult(
                success=False,
                output={
                    "success": False,
                    "message": "无法获取 context。",
                },
            )

        # 参数校验：四个参数须按格式完整提供，否则视为调用失败（success=False）
        def _fail(msg: str) -> ToolResult[ManageContextOutput]:
            return ToolResult(success=False, output={"success": False, "message": msg}, error=msg)

        if not isinstance(reasoning, str):
            return _fail(
                "reasoning 必填且须为字符串。正确示例：reasoning: \"本轮的更新原因...\"。"
            )
        reasoning_text = reasoning.strip()
        if not reasoning_text:
            return _fail("reasoning 必填且非空。正确示例：reasoning: \"本轮的更新原因...\"。")

        # 容错：LLM 有时传 core 为 null、对象或字符串 "null"
        if core is None or (isinstance(core, str) and core.strip().lower() == "null"):
            return _fail(
                "core 必填，不得为 null。正确示例：core: \"任务：xxx\\n规划：xxx\\n执行摘要：xxx\\n下一步计划：xxx\"。"
            )
        if not isinstance(core, str):
            return _fail(
                "core 必填且须为字符串。正确示例：core: \"任务：xxx\\n规划：xxx\\n执行摘要：xxx\\n下一步计划：xxx\"。"
                "错误示例：core: null 或 core: {}（对象），须传字符串。"
            )
        core_text = core.strip()
        if not core_text:
            return _fail(
                "core 必填且非空，须写入任务摘要或进度。"
                "正确示例：core: \"任务：xxx\\n规划：xxx\\n执行摘要：xxx\\n下一步计划：xxx\"。"
            )

        # 校验 CORE 格式：须包含任务、规划、执行摘要、下一步计划四段
        missing = [s for s in _CORE_REQUIRED_SECTIONS if s not in core_text]
        if missing:
            return _fail(
                f"core 格式不完整，缺少：{', '.join(missing)}。"
                "须包含四段：任务、规划、执行摘要、下一步计划。"
                "正确示例：core: \"任务：xxx\\n\\n规划：xxx\\n\\n执行摘要：\\n- 摘要1\\n- 摘要2\\n\\n下一步计划：xxx\"。"
            )

        # 容错：LLM 常传 ""、null 或字符串 "[]"，视作空列表
        if discard is None or discard == "":
            discard = []
        elif isinstance(discard, str) and discard.strip() == "[]":
            discard = []
        elif not isinstance(discard, list):
            return _fail(
                "discard 必填且须为 array 类型。"
                "正确示例：discard: [] 或 discard: [\"7\", \"8\"]。"
                "错误示例：discard: \"[]\"（字符串），须传真正的数组。"
            )
        # 容错：LLM 常传数字 id（如 [7, 8]），统一转为字符串以匹配 STM 中的 id 类型
        discard = [str(x).strip() for x in discard if x is not None and str(x).strip()]

        # task_complete 须为布尔；兼容 LLM 传字符串 "true"/"false"
        if isinstance(task_complete, str):
            low = task_complete.strip().lower()
            if low in ("true", "1", "yes"):
                task_complete = True
            elif low in ("false", "0", "no"):
                task_complete = False
            else:
                return _fail(
                    "task_complete 须为 true 或 false。正确示例：task_complete: true 或 task_complete: false。"
                )
        if not isinstance(task_complete, bool):
            return _fail(
                "task_complete 必填且须为布尔。正确示例：task_complete: true 或 task_complete: false。"
                "错误示例：task_complete: \"true\"（字符串在部分环境下会自动转换，若仍报错请传布尔）。"
            )

        core_updated = False
        discard_count = 0

        if hasattr(ctx, "update_core"):
            ctx.update_core(core_text)
            core_updated = True

        # task_complete 单独写入一条持久化 msg，agent 可直接读取
        if hasattr(ctx, "update_task_complete"):
            ctx.update_task_complete(task_complete)

        # 暂时不从 STM 中实际删除临时消息，仅统计传入的 discard 数量
        if discard:
            ids = [str(x) for x in discard if x is not None]
            discard_count = len(ids)

        # 打印 LLM 的 reasoning 给用户看（不放入 tool 返回，避免进入下一轮 context）
        if reasoning_text:
            print(f"\n--- [manage_context 本轮更新解释] ---\n{reasoning_text}\n---\n", flush=True)

        return ToolResult(
            success=True,
            output={
                "success": True,
                "message": f"context 已更新：core_updated={core_updated}, discard_count={discard_count}, task_complete={task_complete}",
                "core_updated": core_updated,
                "discard_count": discard_count,
                "task_complete": task_complete,
            },
        )


__all__ = ["ManageContextTool", "MANAGE_CONTEXT_TOOL_NAME"]

