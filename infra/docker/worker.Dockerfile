FROM python:3.11-slim

WORKDIR /app

COPY apps/worker/pyproject.toml apps/worker/
RUN pip install --no-cache-dir -e "apps/worker"

COPY apps/worker/ apps/worker/
COPY packages/ packages/

WORKDIR /app/apps/worker

CMD ["python", "-m", "app.main"]
