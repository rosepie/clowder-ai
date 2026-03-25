"""A2A Protocol types aligned with https://a2acn.com/ and core specification.

All types are JSON-serializable and match the protocol wire format.
References: AgentCard, Task, Artifact, Message, Part (a2acn.com/docs/concepts).
"""

from __future__ import annotations

from typing import Any, Literal, TypedDict


# ----- AgentCard & AgentSkill -----

class AgentSkillDict(TypedDict, total=False):
    """A2A AgentSkill: capability descriptor for discovery (a2acn.com/docs/concepts/agentcard)."""
    id: str
    name: str
    description: str
    inputModes: list[str]
    outputModes: list[str]
    examples: list[str]
    tags: list[str]


class AgentCardDict(TypedDict, total=False):
    """A2A AgentCard: identity and capability card (a2acn.com/docs/concepts/agentcard)."""
    name: str
    description: str
    provider: str
    url: str  # or under api.url depending on spec variant
    version: str
    capabilities: list[str]  # e.g. ["streaming", "pushNotifications"]
    auth: dict[str, Any]  # schemes, instructions
    skills: list[AgentSkillDict]
    defaultInputModes: list[str]
    defaultOutputModes: list[str]


# ----- Message & Part -----

PartRole = Literal["user", "agent"]


class TextPartDict(TypedDict):
    """Text content in a message or artifact."""
    type: Literal["text"]
    text: str


class FilePartInlineDict(TypedDict):
    """File part with inline base64 data (server carries bytes)."""
    type: Literal["file"]
    mimeType: str
    filename: str
    inlineData: dict[str, str]  # {"data": "<base64>"}


class FilePartUriDict(TypedDict):
    """File part with URI reference (client fetches)."""
    type: Literal["file"]
    mimeType: str
    filename: str
    uri: str


class DataPartDict(TypedDict):
    """Structured data part (e.g. form)."""
    type: Literal["data"]
    data: dict[str, Any]


# Union of part shapes for type hints; at runtime we use dict with "type" key
PartDict = dict[str, Any]


class MessageDict(TypedDict, total=False):
    """A2A Message: basic communication unit (a2acn.com/docs/concepts/message)."""
    role: PartRole
    parts: list[PartDict]
    metadata: dict[str, Any]


# ----- Task state & Artifact -----

TaskStateName = Literal["pending", "running", "completed", "failed", "cancelled"]


class TaskStatusDict(TypedDict, total=False):
    """Task status in A2A response."""
    state: TaskStateName
    progress: float
    message: str


class ArtifactDict(TypedDict, total=False):
    """A2A Artifact: task output (a2acn.com/docs/concepts/artifact)."""
    artifactId: str
    name: str
    parts: list[PartDict]
    append: bool
    lastChunk: bool


class TaskStateDict(TypedDict, total=False):
    """A2A Task state returned by tasks/send, tasks/get (a2acn.com/docs/concepts/task)."""
    id: str
    sessionId: str
    status: TaskStatusDict
    artifacts: list[ArtifactDict]
    metadata: dict[str, Any]


# ----- JSON-RPC -----

class JsonRpcRequest(TypedDict, total=False):
    """JSON-RPC 2.0 request."""
    jsonrpc: Literal["2.0"]
    id: int | str | None
    method: str
    params: dict[str, Any]


class JsonRpcError(TypedDict):
    """JSON-RPC 2.0 error object."""
    code: int
    message: str
    data: Any


class JsonRpcResponse(TypedDict, total=False):
    """JSON-RPC 2.0 response."""
    jsonrpc: Literal["2.0"]
    id: int | str | None
    result: Any
    error: JsonRpcError


# ----- tasks/send, tasks/get params -----

class TasksSendParams(TypedDict, total=False):
    """Params for tasks/send (a2acn.com/docs/concepts/task)."""
    id: str
    message: MessageDict
    sessionId: str
    metadata: dict[str, Any]


class TasksGetParams(TypedDict, total=False):
    """Params for tasks/get."""
    id: str
    sessionId: str


class TasksCancelParams(TypedDict, total=False):
    """Params for tasks/cancel."""
    id: str
    sessionId: str


# ----- Helpers -----

def text_part(text: str) -> dict[str, Any]:
    """Build a TextPart dict."""
    return {"type": "text", "text": text}


def file_part_inline(mime_type: str, filename: str, base64_data: str) -> dict[str, Any]:
    """Build a FilePart dict with inline base64 data."""
    return {
        "type": "file",
        "mimeType": mime_type,
        "filename": filename,
        "inlineData": {"data": base64_data},
    }


def file_part_uri(mime_type: str, filename: str, uri: str) -> dict[str, Any]:
    """Build a FilePart dict with URI reference."""
    return {
        "type": "file",
        "mimeType": mime_type,
        "filename": filename,
        "uri": uri,
    }


def task_state(
    task_id: str,
    session_id: str,
    state: TaskStateName,
    *,
    artifacts: list[dict[str, Any]] | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build TaskState dict for A2A response."""
    out: dict[str, Any] = {
        "id": task_id,
        "sessionId": session_id,
        "status": {"state": state},
    }
    if artifacts is not None:
        out["artifacts"] = artifacts
    if metadata is not None:
        out["metadata"] = metadata
    return out


def jsonrpc_result(result: Any, request_id: int | str | None) -> dict[str, Any]:
    """Build JSON-RPC 2.0 success response."""
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def jsonrpc_error(code: int, message: str, request_id: int | str | None, data: Any = None) -> dict[str, Any]:
    """Build JSON-RPC 2.0 error response."""
    err: dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    return {"jsonrpc": "2.0", "id": request_id, "error": err}


# Standard JSON-RPC error codes
PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
INTERNAL_ERROR = -32603

__all__ = [
    "AgentCardDict",
    "AgentSkillDict",
    "ArtifactDict",
    "DataPartDict",
    "FilePartInlineDict",
    "FilePartUriDict",
    "JsonRpcError",
    "JsonRpcRequest",
    "JsonRpcResponse",
    "MessageDict",
    "PartDict",
    "PartRole",
    "TaskStateDict",
    "TaskStatusDict",
    "TaskStateName",
    "TasksCancelParams",
    "TasksGetParams",
    "TasksSendParams",
    "TextPartDict",
    "file_part_inline",
    "file_part_uri",
    "jsonrpc_error",
    "jsonrpc_result",
    "task_state",
    "text_part",
    "INVALID_PARAMS",
    "INVALID_REQUEST",
    "INTERNAL_ERROR",
    "METHOD_NOT_FOUND",
    "PARSE_ERROR",
]
