FROM python:3.11-slim

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY apps/api/pyproject.toml apps/api/
RUN pip install --no-cache-dir -e "apps/api[dev]"

# Copy source
COPY apps/api/ apps/api/
COPY packages/ packages/

WORKDIR /app/apps/api

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
