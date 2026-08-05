FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY apps/api/pyproject.toml apps/api/
RUN pip install --no-cache-dir -e "apps/api"

COPY apps/api/ apps/api/
COPY apps/worker/ apps/worker/
COPY packages/ packages/

WORKDIR /app/apps/worker

CMD ["python", "-m", "app.main"]
