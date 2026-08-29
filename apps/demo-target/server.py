"""MORPHIA synthetic demo target.

A deliberately boring, self-contained HTTP service used only as the
authorized target for MORPHIA's canonical local demonstration. It is NOT a
real application and exposes nothing exploitable: every response is a fixed,
clearly-labelled synthetic payload. The point of the demo is to prove
MORPHIA's orchestration (scope check -> approval -> worker execution ->
evidence -> finding -> report), not to exploit anything.

Stdlib only — no dependencies, no framework. Runs as compose service
`demo-target` on port 9000, reachable in-network as http://demo-target:9000.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BANNER = "morphia-demo-target"

# A single, deliberate synthetic weakness the demo "finds": a permissive
# CORS header. It affects nothing (there is no data here), but it gives the
# demo a concrete, defensible, obviously-synthetic finding to write up.
SYNTHETIC_HEADERS = {
    "Server": f"{BANNER}/1.0 (synthetic; authorized MORPHIA demo)",
    "X-Morphia-Demo": "true",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "*",  # <- the synthetic finding
}


class Handler(BaseHTTPRequestHandler):
    server_version = f"{BANNER}/1.0"

    def _send(self, status: int, body: bytes, content_type: str = "application/json") -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for key, value in SYNTHETIC_HEADERS.items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_HEAD(self) -> None:  # noqa: N802
        self.do_GET()

    def do_GET(self) -> None:  # noqa: N802
        now = datetime.now(UTC).isoformat()
        if self.path in ("/", "/index.html"):
            payload = {
                "service": BANNER,
                "synthetic": True,
                "authorized_for": "MORPHIA local demonstration only",
                "note": "This is not a real application. Nothing here is exploitable.",
                "endpoints": ["/", "/headers", "/health", "/.well-known/security.txt"],
                "time": now,
            }
            self._send(200, json.dumps(payload, indent=2).encode())
        elif self.path == "/health":
            self._send(200, json.dumps({"status": "ok", "time": now}).encode())
        elif self.path == "/headers":
            # Echo what a header-inspection step would observe.
            observed = dict(SYNTHETIC_HEADERS)
            self._send(200, json.dumps({"observed_response_headers": observed}, indent=2).encode())
        elif self.path == "/.well-known/security.txt":
            txt = (
                "# Synthetic security.txt for the MORPHIA demo target\n"
                "Contact: mailto:security@morphia.example.com\n"
                "Policy: https://morphia.example.com/disclosure\n"
                "Preferred-Languages: en\n"
                f"Expires: {now}\n"
            )
            self._send(200, txt.encode(), content_type="text/plain")
        else:
            self._send(404, json.dumps({"error": "not found", "synthetic": True}).encode())

    def log_message(self, fmt: str, *args: object) -> None:
        # Compact one-line access log.
        print(f"[demo-target] {self.address_string()} {fmt % args}")


def main() -> None:
    server = ThreadingHTTPServer(("0.0.0.0", 9000), Handler)  # noqa: S104
    print("[demo-target] listening on :9000 (synthetic; authorized MORPHIA demo only)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
