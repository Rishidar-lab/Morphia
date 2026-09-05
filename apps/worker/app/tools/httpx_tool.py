"""ProjectDiscovery httpx adapter — read-only HTTP probe.

NOTE ON NAMING: this wraps the httpx *CLI binary*
(https://github.com/projectdiscovery/httpx), a recon tool. It has nothing
to do with the `httpx` *Python library* already used elsewhere in this repo
(app.api_client, the API's HTTP client) — the name collision is upstream's,
not ours.

httpx sends a single GET to the scope-validated target and reports what it
observed (status code, title, response headers). It never follows
redirects and performs no active/destructive checks — the lowest
reasonable blast radius for a first real tool. The binary is invoked by
absolute path with a fixed argv list (no shell), so its output is what it
is: real evidence, not a description written by a model.
"""

import asyncio
import contextlib
import time

from app.tools.base import ToolAdapter, ToolError, ToolResult

DEFAULT_BINARY_PATH = "/usr/local/bin/httpx"
DEFAULT_TIMEOUT_SECONDS = 15
DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024
_READ_CHUNK_BYTES = 65536


class HttpxTool(ToolAdapter):
    name = "httpx"

    def __init__(
        self,
        binary_path: str = DEFAULT_BINARY_PATH,
        timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
        max_output_bytes: int = DEFAULT_MAX_OUTPUT_BYTES,
    ) -> None:
        self.binary_path = binary_path
        self.timeout_seconds = timeout_seconds
        self.max_output_bytes = max_output_bytes

    async def run(self, target: str) -> ToolResult:
        version = await self._version()
        argv = [
            self.binary_path,
            "-u",
            target,
            "-json",
            "-include-response-header",
            "-status-code",
            "-title",
            "-silent",
            "-no-color",
            "-timeout",
            str(self.timeout_seconds),
            "-retries",
            "0",
        ]
        return await self._exec(argv, target, version)

    async def _version(self) -> str:
        try:
            proc = await asyncio.create_subprocess_exec(  # noqa: S603
                self.binary_path,
                "-version",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=5)
        except (OSError, TimeoutError) as exc:
            raise ToolError(f"httpx binary not runnable at '{self.binary_path}': {exc}") from exc

        # httpx prints its version banner to stderr, not stdout — verified
        # against the real binary, not assumed from its --help text.
        for line in (stdout + stderr).decode(errors="replace").splitlines():
            if "Current Version" in line:
                return line.split(":")[-1].strip()
        return "unknown"

    async def _exec(self, argv: list[str], target: str, version: str) -> ToolResult:
        started = time.monotonic()
        try:
            proc = await asyncio.create_subprocess_exec(  # noqa: S603
                *argv,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except OSError as exc:
            raise ToolError(f"Failed to start '{self.binary_path}': {exc}") from exc

        # httpx's own -timeout only bounds a single connection attempt; the
        # process still needs headroom to start up and exit cleanly after
        # that. A hard timeout equal to -timeout can (verified against the
        # real binary) kill a probe that was about to finish successfully,
        # so the outer guard is deliberately looser than the inner one.
        timed_out = False
        try:
            (stdout_bytes, stdout_trunc), (stderr_bytes, stderr_trunc) = await asyncio.wait_for(
                self._read_capped(proc), timeout=self.timeout_seconds + 5
            )
            truncated = stdout_trunc or stderr_trunc
            exit_code = await asyncio.wait_for(proc.wait(), timeout=5)
        except TimeoutError:
            timed_out = True
            truncated = False
            with contextlib.suppress(ProcessLookupError):
                proc.kill()
            exit_code = await proc.wait()
            stdout_bytes = b""
            stderr_bytes = b"(httpx timed out and was killed)"

        stdout = stdout_bytes.decode(errors="replace")
        # Verified against the real binary: httpx exits 0 unconditionally,
        # even for an unreachable target or a connection failure — it just
        # emits no JSON line. Exit code alone is not a success signal for
        # this tool; a probe only "succeeded" if it actually observed
        # something, in -json/-silent mode that means a non-empty line.
        succeeded = (not timed_out) and exit_code == 0 and bool(stdout.strip())

        return ToolResult(
            tool=self.name,
            tool_version=version,
            succeeded=succeeded,
            argv=argv,
            target=target,
            exit_code=exit_code,
            stdout=stdout,
            stderr=stderr_bytes.decode(errors="replace"),
            duration_ms=int((time.monotonic() - started) * 1000),
            timed_out=timed_out,
            truncated=truncated,
        )

    async def _read_capped(
        self, proc: asyncio.subprocess.Process
    ) -> tuple[tuple[bytes, bool], tuple[bytes, bool]]:
        """Read stdout/stderr concurrently, capping each at `max_output_bytes`.

        Killing the process the moment either stream exceeds the cap avoids
        blocking forever on a full pipe buffer we've stopped draining.
        """

        async def read_stream(stream: asyncio.StreamReader) -> tuple[bytes, bool]:
            chunks: list[bytes] = []
            total = 0
            while True:
                chunk = await stream.read(_READ_CHUNK_BYTES)
                if not chunk:
                    return b"".join(chunks), False
                total += len(chunk)
                if total > self.max_output_bytes:
                    keep = self.max_output_bytes - (total - len(chunk))
                    if keep > 0:
                        chunks.append(chunk[:keep])
                    with contextlib.suppress(ProcessLookupError):
                        proc.kill()
                    return b"".join(chunks), True
                chunks.append(chunk)

        assert proc.stdout is not None
        assert proc.stderr is not None
        return await asyncio.gather(read_stream(proc.stdout), read_stream(proc.stderr))
