"""Worker configuration, read directly from the environment.

The worker has no direct database access (docs/security.md §5) so it
carries none of the API's pydantic-settings machinery — just the env
vars it actually needs.
"""

import os

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
WORKER_AUTH_SECRET = os.environ.get("WORKER_AUTH_SECRET", "")
API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8000")
HEARTBEAT_INTERVAL = int(os.environ.get("WORKER_HEARTBEAT_INTERVAL", "30"))
MAX_RETRIES = int(os.environ.get("WORKER_MAX_RETRIES", "3"))

# ── AI provider selection ─────────────────────────────────
# Explicit override; otherwise the first provider with a configured key wins,
# falling back to the deterministic mock so the pipeline is always runnable.
PROVIDER = os.environ.get("MORPHIA_PROVIDER", "")

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini")

LOCAL_MODEL_URL = os.environ.get("LOCAL_MODEL_URL", "http://localhost:11434/v1")
LOCAL_MODEL_NAME = os.environ.get("LOCAL_MODEL_NAME", "llama3.1")

# ── Tool adapters ──────────────────────────────────────────
# Absolute path, not a bare name on $PATH — avoids PATH-hijacking and
# matches where infra/docker/worker.Dockerfile installs the binary.
TOOL_HTTPX_PATH = os.environ.get("TOOL_HTTPX_PATH", "/usr/local/bin/httpx")
TOOL_TIMEOUT_SECONDS = int(os.environ.get("TOOL_TIMEOUT_SECONDS", "15"))
TOOL_MAX_OUTPUT_BYTES = int(os.environ.get("TOOL_MAX_OUTPUT_BYTES", str(256 * 1024)))
