FROM python:3.11-slim

WORKDIR /app

# Install the API + worker packages together so the worker can import
# the shared `morphia_api` and `morphia_worker` runtime peers.
COPY apps/api/pyproject.toml apps/api/
COPY apps/worker/pyproject.toml apps/worker/
COPY packages/ packages/
RUN pip install --no-cache-dir -e "apps/api[dev]" -e "apps/worker[dev]"

# httpx (ProjectDiscovery, https://github.com/projectdiscovery/httpx) — the
# worker's first real ToolAdapter binary. Not the Python `httpx` library
# above (unrelated project, same name). Pinned version + checksum verified
# against the release's published checksums.txt.
ENV HTTPX_TOOL_VERSION=1.6.10
RUN apt-get update && apt-get install -y --no-install-recommends curl unzip \
    && curl -sSfL -o /tmp/httpx.zip \
        "https://github.com/projectdiscovery/httpx/releases/download/v${HTTPX_TOOL_VERSION}/httpx_${HTTPX_TOOL_VERSION}_linux_amd64.zip" \
    && echo "e7eb8473530c2d0eb4eb132c7253c0138745d622970f36413c1f349ddd60edb7  /tmp/httpx.zip" | sha256sum -c - \
    && unzip -o /tmp/httpx.zip -d /usr/local/bin httpx \
    && chmod +x /usr/local/bin/httpx \
    && rm /tmp/httpx.zip \
    && apt-get purge -y --auto-remove curl unzip \
    && rm -rf /var/lib/apt/lists/*

COPY apps/api/ apps/api/
COPY apps/worker/ apps/worker/

# Default to the worker entrypoint. The compose file overrides this for
# the api/migrate/web services.
WORKDIR /app/apps/worker
CMD ["python", "-m", "app.main"]
