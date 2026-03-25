"""Utility helpers for parsing command-style ``key=value`` arguments."""

from __future__ import annotations


def parse_key_value_args(tokens: list[str]) -> tuple[list[str], dict[str, str]]:
    """Split tokens into positional values and ``key=value`` options."""
    positional: list[str] = []
    options: dict[str, str] = {}
    for token in tokens:
        if "=" not in token:
            positional.append(token)
            continue
        key, value = token.split("=", 1)
        key = key.strip()
        if not key:
            positional.append(token)
            continue
        options[key] = value.strip()
    return positional, options
