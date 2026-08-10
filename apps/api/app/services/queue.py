"""Redis job queue — the API's write side of the API↔worker handoff.

Redis is not a system of record (see docs/architecture.md §"Queue/cache"):
the job payload only carries a run id, everything the worker needs to act
is re-read from PostgreSQL via the worker-authenticated callback endpoints
in app.routers.worker. If Redis is flushed, at most an already-approved run
stalls in QUEUED until it is re-enqueued — nothing is lost.
"""

import json

import redis.asyncio as aioredis
import structlog

from app.core.config import get_settings

logger = structlog.get_logger()

JOB_QUEUE_KEY = "morphia:jobs"

_settings = get_settings()
_redis_client: aioredis.Redis | None = None


def _get_client() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(_settings.redis_url, decode_responses=True)
    return _redis_client


async def enqueue_run_job(run_id: str) -> None:
    """Push a run onto the worker job queue. Called when a run enters QUEUED."""
    client = _get_client()
    await client.lpush(JOB_QUEUE_KEY, json.dumps({"run_id": run_id}))
    logger.info("queue.run_enqueued", run_id=run_id)
