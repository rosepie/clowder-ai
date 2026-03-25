"""Search file paths tool implementation."""

from __future__ import annotations

import fnmatch
import os
from pathlib import Path
from typing import Any

from dare_framework.tool.kernel import ITool
from dare_framework.tool.errors import ToolError
from dare_framework.tool._internal.file_utils import (
    DEFAULT_IGNORE_DIRS,
    DEFAULT_MAX_RESULTS,
    coerce_int,
    coerce_list,
    get_tool_config,
    relative_to_root,
    resolve_path,
    resolve_workspace_roots,
)
from dare_framework.infra.ids import generate_id
from dare_framework.tool.types import (
    CapabilityKind,
    Evidence,
    RunContext,
    ToolResult,
    ToolType,
)


class SearchFileTool(ITool):
    """Search file paths by glob pattern within workspace roots."""

    @property
    def name(self) -> str:
        return "search_file"

    @property
    def description(self) -> str:
        return (
            "Search file paths by glob pattern (e.g. *.py, src/**/*.ts). "
            "Returns workspace-relative paths; matches in non-primary roots are prefixed as @root[n]/."
        )

    @property
    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "Glob pattern to match file paths"},
                "path": {"type": "string", "description": "Directory or file path"},
                "max_results": {"type": "integer", "minimum": 1},
            },
            "required": ["pattern"],
        }

    @property
    def output_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "paths": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Workspace-relative paths. Non-primary roots are encoded as @root[n]/<path>.",
                },
                "total_matches": {"type": "integer"},
                "truncated": {"type": "boolean"},
            },
        }

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
        return 10

    @property
    def produces_assertions(self) -> list[dict[str, Any]]:
        return [{"type": "file_search_results", "produces": {"pattern": "*"}}]

    @property
    def is_work_unit(self) -> bool:
        return False

    @property
    def capability_kind(self) -> CapabilityKind:
        return CapabilityKind.TOOL

    # noinspection PyMethodOverriding
    async def execute(
        self,
        *,
        run_context: RunContext[Any],
        pattern: str,
        path: str = ".",
        max_results: int | None = None,
    ) -> ToolResult:
        """Search file paths by glob pattern.

        Args:
            run_context: Runtime invocation context.
            pattern: Glob pattern to match file paths (e.g. *.py).
            path: Directory or file path to search under.
            max_results: Optional maximum number of matches to return.
        """
        try:
            input_payload: dict[str, Any] = {"pattern": pattern, "path": path}
            if max_results is not None:
                input_payload["max_results"] = max_results
            return _execute_search_file(input_payload, run_context)
        except ToolError as exc:
            return _error_result(exc)


def _execute_search_file(input: dict[str, Any], context: RunContext[Any]) -> ToolResult:
    pattern = input.get("pattern")
    if not isinstance(pattern, str) or not pattern.strip():
        raise ToolError(code="INVALID_PATTERN", message="pattern is required", retryable=False)

    tool_config = get_tool_config(context, "search_file")
    max_results_guardrail = coerce_int(tool_config.get("max_results"), DEFAULT_MAX_RESULTS)
    ignore_dirs = set(coerce_list(tool_config.get("ignore_dirs"), DEFAULT_IGNORE_DIRS))

    requested_max = coerce_int(input.get("max_results"), max_results_guardrail)
    max_results = min(requested_max, max_results_guardrail)

    roots = resolve_workspace_roots(context)
    search_path_value = input.get("path", ".")
    search_path, root = resolve_path(search_path_value, roots)

    if not search_path.exists():
        raise ToolError(code="SEARCH_PATH_NOT_FOUND", message="search path not found", retryable=False)
    if not search_path.is_dir() and not search_path.is_file():
        raise ToolError(code="INVALID_PATH", message="search path must be file or directory", retryable=False)

    matches: list[str] = []
    truncated = False

    if search_path.is_file():
        abs_path = search_path.resolve()
        relative_path = _relative_path_for_match(abs_path, root)
        if _match_pattern(pattern, relative_path):
            matches.append(_display_relative_path(relative_path, root, roots))
    else:
        for dirpath, dirs, files in os.walk(search_path, topdown=True, followlinks=False):
            dirs[:] = [d for d in sorted(dirs) if d not in ignore_dirs]
            for filename in sorted(files):
                abs_path = (Path(dirpath) / filename).resolve()
                relative_path = _relative_path_for_match(abs_path, root)
                if not _match_pattern(pattern, relative_path):
                    continue
                matches.append(_display_relative_path(relative_path, root, roots))
                if len(matches) >= max_results:
                    truncated = True
                    break
            if truncated:
                break

    return ToolResult(
        success=True,
        output={
            "paths": matches,
            "total_matches": len(matches),
            "truncated": truncated,
        },
        evidence=[
            Evidence(
                evidence_id=generate_id("evidence"),
                kind="file_search",
                payload={"pattern": pattern, "match_count": len(matches)},
            )
        ],
    )


def _relative_path_for_match(path: Path, root: Path) -> str:
    return relative_to_root(path, root).replace("\\", "/")


def _display_relative_path(relative_path: str, root: Path, roots: list[Path]) -> str:
    try:
        root_index = roots.index(root)
    except ValueError:
        root_index = 0

    if root_index <= 0:
        return relative_path
    return f"@root[{root_index}]/{relative_path}"


def _match_pattern(pattern: str, relative_path: str) -> bool:
    file_name = Path(relative_path).name
    if fnmatch.fnmatch(relative_path, pattern) or fnmatch.fnmatch(file_name, pattern):
        return True
    # pattern "**/*" 或 "**/*.py" 等不匹配根目录文件（rel_path 无 /），此处补上
    if "/" not in relative_path and ("**/" in pattern or pattern in ("**/*", "**")):
        suffix = pattern.split("/")[-1] if "/" in pattern else "*"
        return fnmatch.fnmatch(file_name, suffix)
    return False


def _error_result(error: ToolError) -> ToolResult:
    return ToolResult(
        success=False,
        output={"code": error.code},
        error=error.message,
        evidence=[],
    )
