"""In-memory short-term memory implementation."""

from __future__ import annotations

from typing import TYPE_CHECKING

from dare_framework.memory.kernel import IShortTermMemory

if TYPE_CHECKING:
    from dare_framework.context.types import Message, MessageMark
else:
    MessageMark = None

# 递增整数 ID，百万级容量
_MAX_MSG_ID = 1_000_000


class InMemorySmartSTM(IShortTermMemory):
    """In-memory short-term memory implementation.

    Simple list-based storage for current session messages.
    Implements IShortTermMemory (which inherits IRetrievalContext).
    Message id 使用递增整数（1..999999），便于观察与 discard 引用。
    """

    @property
    def name(self) -> str:
        return "in_memory_stm"

    def __init__(self) -> None:
        self._messages: list[Message] = []
        self._next_msg_id = 1

    def add(self, message: Message) -> None:
        """Add a message to memory. Assigns id and default mark if missing."""
        from dare_framework.context.types import MessageMark

        if message.id is None:
            nid = self._next_msg_id
            self._next_msg_id = (nid % _MAX_MSG_ID) + 1
            object.__setattr__(message, "id", str(nid))
        if getattr(message, "mark", None) is None:
            object.__setattr__(message, "mark", MessageMark.TEMPORARY)
        self._messages.append(message)

    def clear(self) -> None:
        """Clear all messages."""
        self._messages.clear()

    def get(self, query: str = "", **kwargs) -> list[Message]:
        """Retrieve all messages (implements IRetrievalContext.get).

        For short-term memory, query is ignored - returns all messages.
        """
        return list(self._messages)

    def remove_by_ids(self, ids: list[str]) -> int:
        """Remove messages with mark=TEMPORARY and id in ids. Returns count removed."""
        from dare_framework.context.types import MessageMark

        ids_set = set(ids)
        before = len(self._messages)
        self._messages = [
            m for m in self._messages
            if not (getattr(m, "mark", None) == MessageMark.TEMPORARY and m.id in ids_set)
        ]
        return before - len(self._messages)

    def compress(self, max_messages: int | None = None, **kwargs) -> int:
        """Compress short-term memory by keeping only the most recent messages.

        Preserves IMMUTABLE and PERSISTENT messages; only TEMPORARY messages are eligible for removal.
        """
        from dare_framework.context.types import MessageMark

        if max_messages is None or len(self._messages) <= max_messages:
            return 0

        protected = [
            m for m in self._messages
            if getattr(m, "mark", None) in (MessageMark.IMMUTABLE, MessageMark.PERSISTENT)
        ]
        temporary = [
            m for m in self._messages
            if getattr(m, "mark", None) not in (MessageMark.IMMUTABLE, MessageMark.PERSISTENT)
        ]
        if len(protected) + len(temporary) <= max_messages:
            return 0
        to_keep = max_messages - len(protected)
        if to_keep <= 0:
            self._messages = protected
            return len(temporary)
        kept_tmp = temporary[-to_keep:] if to_keep < len(temporary) else temporary
        before = len(self._messages)
        self._messages = protected + kept_tmp
        return before - len(self._messages)


__all__ = ["InMemorySmartSTM"]
