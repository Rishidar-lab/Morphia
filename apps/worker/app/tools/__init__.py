"""Tool adapter factory — mirrors app.providers' factory shape."""

from app import config
from app.tools.base import ToolAdapter, ToolError, ToolResult
from app.tools.httpx_tool import HttpxTool

__all__ = ["ToolAdapter", "ToolError", "ToolResult", "get_tool"]


def get_tool(name: str) -> ToolAdapter:
    choice = (name or "").strip().lower()

    if choice == "httpx":
        return HttpxTool(
            binary_path=config.TOOL_HTTPX_PATH,
            timeout_seconds=config.TOOL_TIMEOUT_SECONDS,
            max_output_bytes=config.TOOL_MAX_OUTPUT_BYTES,
        )

    raise ToolError(f"Unknown tool '{choice}'. Expected: httpx.")
