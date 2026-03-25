"""memory domain facade."""

from dare_framework.memory.kernel import ILongTermMemory, IShortTermMemory
from dare_framework.memory.types import LongTermMemoryConfig
from dare_framework.memory.factory import create_long_term_memory
from dare_framework.memory.in_memory_stm import InMemorySTM
from dare_framework.memory.in_memory_smart_stm import InMemorySmartSTM

__all__ = [
    "IShortTermMemory",
    "ILongTermMemory",
    "InMemorySTM",
    "InMemorySmartSTM",
    "LongTermMemoryConfig",
    "create_long_term_memory",
]
