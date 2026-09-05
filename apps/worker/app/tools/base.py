"""Tool adapter interface — real subprocess execution, alongside the provider adapter.

A provider adapter answers "what does the model say about this target"; a
tool adapter answers "what did a real, versioned binary actually do against
it" — its stdout/stderr/exit code ARE the evidence, not a model's
description of one. Every tool adapter normalizes execution behind the same
shape so the worker's step loop never branches on which tool is configured.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class ToolResult:
    """The complete, honest record of one real tool invocation.

    `succeeded` is NOT derived automatically from `exit_code` — some real
    tools (httpx included, verified against the actual binary) exit 0
    unconditionally, even when they observed nothing. Each adapter decides
    what "succeeded" means for itself; `exit_code`/`stdout`/`stderr` stay
    the tool's raw, untouched output either way.
    """

    tool: str
    tool_version: str
    succeeded: bool
    argv: list[str] = field(default_factory=list)
    target: str = ""
    exit_code: int | None = None
    stdout: str = ""
    stderr: str = ""
    duration_ms: int = 0
    timed_out: bool = False
    truncated: bool = False


class ToolError(Exception):
    """Raised when a tool could not be invoked at all (missing binary, bad
    executable). NOT raised for a non-zero exit or a timeout — those are
    legitimate, evidentiary outcomes recorded on ToolResult instead."""


class ToolAdapter(ABC):
    """Common interface implemented by every real tool (httpx, ...)."""

    name: str

    @abstractmethod
    async def run(self, target: str) -> ToolResult:
        """Execute the tool against `target` and return the real captured result.

        `target` has already passed the 8-point scope validator — this
        method must not do anything the validator did not already approve
        (no following redirects off-target, no recursive expansion).
        """
        raise NotImplementedError
