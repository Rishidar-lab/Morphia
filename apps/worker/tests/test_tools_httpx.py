"""HttpxTool tests.

Two layers:

1. Subprocess-plumbing tests (hard timeout, output cap, missing binary) use
   tiny real fake scripts instead of the real httpx binary — deterministic,
   no network, no dependency on this machine having httpx installed.
2. Integration tests run the REAL httpx binary against the REAL
   apps/demo-target server (imported directly, not reimplemented) — skipped
   with a clear reason if httpx isn't installed on this machine.
"""

import importlib.util
import os
import stat
import sys
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

from app import config
from app.tools.base import ToolError
from app.tools.httpx_tool import HttpxTool


def _make_script(tmp_path: Path, body: str) -> str:
    path = tmp_path / "fake-tool"
    path.write_text(f"#!{sys.executable}\n{body}")
    path.chmod(path.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
    return str(path)


# ── Subprocess plumbing (fake binaries, deterministic) ──────────────────
@pytest.mark.asyncio
async def test_missing_binary_raises_tool_error(tmp_path: Path):
    tool = HttpxTool(binary_path=str(tmp_path / "does-not-exist"))
    with pytest.raises(ToolError):
        await tool.run("http://example.invalid/")


@pytest.mark.asyncio
async def test_hard_timeout_kills_a_hung_process(tmp_path: Path):
    fake = _make_script(
        tmp_path,
        "import sys, time\n"
        "if '-version' in sys.argv:\n"
        "    print('Current Version: v0.0.0-fake'); sys.exit(0)\n"
        "time.sleep(60)\n",
    )
    tool = HttpxTool(binary_path=fake, timeout_seconds=1)

    result = await tool.run("http://example.invalid/")

    assert result.timed_out is True
    assert result.succeeded is False
    assert result.exit_code is not None and result.exit_code != 0


@pytest.mark.asyncio
async def test_output_cap_truncates_and_kills_a_runaway_process(tmp_path: Path):
    fake = _make_script(
        tmp_path,
        "import sys, time\n"
        "if '-version' in sys.argv:\n"
        "    print('Current Version: v0.0.0-fake'); sys.exit(0)\n"
        "sys.stdout.write('A' * 5_000_000)\n"
        "sys.stdout.flush()\n"
        "time.sleep(60)\n",
    )
    tool = HttpxTool(binary_path=fake, timeout_seconds=10, max_output_bytes=1024)

    result = await tool.run("http://example.invalid/")

    assert result.truncated is True
    assert len(result.stdout) <= 1024
    assert result.succeeded is False


@pytest.mark.asyncio
async def test_non_zero_exit_is_captured_verbatim(tmp_path: Path):
    fake = _make_script(
        tmp_path,
        "import sys\n"
        "if '-version' in sys.argv:\n"
        "    print('Current Version: v0.0.0-fake'); sys.exit(0)\n"
        "sys.stderr.write('boom\\n')\n"
        "sys.exit(7)\n",
    )
    tool = HttpxTool(binary_path=fake)

    result = await tool.run("http://example.invalid/")

    assert result.exit_code == 7
    assert result.succeeded is False
    assert "boom" in result.stderr


@pytest.mark.asyncio
async def test_result_records_argv_and_tool_version(tmp_path: Path):
    fake = _make_script(
        tmp_path,
        "import sys\n"
        "if '-version' in sys.argv:\n"
        "    print('Current Version: v0.0.0-fake'); sys.exit(0)\n"
        "print('{}')\n",
    )
    tool = HttpxTool(binary_path=fake)

    result = await tool.run("http://example.invalid/")

    assert result.tool_version == "v0.0.0-fake"
    assert result.argv[0] == fake
    assert "-u" in result.argv
    assert "http://example.invalid/" in result.argv


# ── Real binary, real demo-target ────────────────────────────────────────
def _load_demo_target_handler():
    server_path = Path(__file__).resolve().parents[2] / "demo-target" / "server.py"
    spec = importlib.util.spec_from_file_location("morphia_demo_target_server", server_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.Handler


def _find_httpx_binary() -> str | None:
    # Deliberately NOT falling back to `shutil.which("httpx")`: the Python
    # `httpx` library (already a dependency here) installs its own unrelated
    # CLI shim under that exact name — verified it shadows the real
    # ProjectDiscovery binary on $PATH in this very venv. Only ever trust
    # the same absolute path production uses (config.TOOL_HTTPX_PATH).
    if os.path.isfile(config.TOOL_HTTPX_PATH) and os.access(config.TOOL_HTTPX_PATH, os.X_OK):
        return config.TOOL_HTTPX_PATH
    return None


HTTPX_BINARY = _find_httpx_binary()
requires_httpx = pytest.mark.skipif(
    HTTPX_BINARY is None, reason="httpx binary not installed on this machine"
)


@pytest.fixture
def demo_target_url():
    handler = _load_demo_target_handler()
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        httpd.shutdown()
        thread.join(timeout=5)


@requires_httpx
@pytest.mark.asyncio
async def test_real_httpx_against_the_real_demo_target_captures_the_synthetic_finding(
    demo_target_url: str,
):
    """This is the honesty-contract proof: real binary, real target, real
    evidence — the permissive CORS header apps/demo-target deliberately
    ships is observed in httpx's own JSON output, not described by a model."""
    tool = HttpxTool(binary_path=HTTPX_BINARY, timeout_seconds=10)

    result = await tool.run(f"{demo_target_url}/headers")

    assert result.tool == "httpx"
    assert result.tool_version.startswith("v")
    assert result.exit_code == 0
    assert result.succeeded is True
    assert result.timed_out is False
    assert "access_control_allow_origin" in result.stdout.lower()


@requires_httpx
@pytest.mark.asyncio
async def test_real_httpx_marks_an_unreachable_target_as_not_succeeded():
    """httpx exits 0 unconditionally (verified against the real binary) —
    `succeeded` must be based on actual observation, not exit code alone."""
    tool = HttpxTool(binary_path=HTTPX_BINARY, timeout_seconds=5)

    result = await tool.run("http://127.0.0.1:1/nope")

    assert result.exit_code == 0
    assert result.succeeded is False
    assert result.stdout.strip() == ""
