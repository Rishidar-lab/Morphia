FROM python:3.11-slim

WORKDIR /app

# Install the API + worker packages together so the worker can import
# the shared `morphia_api` and `morphia_worker` runtime peers.
COPY apps/api/pyproject.toml apps/api/
COPY apps/worker/pyproject.toml apps/worker/
COPY packages/ packages/
RUN pip install --no-cache-dir -e "apps/api" -e "apps/worker"

COPY apps/api/ apps/api/
COPY apps/worker/ apps/worker/

# Default to the worker entrypoint. The compose file overrides this for
# the api/migrate/web services.
WORKDIR /app/apps/worker
CMD ["python", "-m", "app.main"]
