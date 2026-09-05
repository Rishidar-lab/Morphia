FROM python:3.11-slim

WORKDIR /app

# Install system deps (libpq for psycopg2, curl for healthchecks).
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

# Install the API + worker packages. The worker is a runtime peer — it
# shares the contracts package with the API.
COPY apps/api/pyproject.toml apps/api/
COPY apps/worker/pyproject.toml apps/worker/
COPY packages/ packages/
RUN pip install --no-cache-dir -e "apps/api[dev]" -e "apps/worker[dev]"

COPY apps/api/ apps/api/
COPY apps/worker/ apps/worker/

# Default: run the API. The worker and migrate services override CMD.
WORKDIR /app/apps/api
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
