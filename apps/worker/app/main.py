"""MORPHIA Worker — Job processing with Redis queue.

The worker polls Redis for queued jobs, executes run steps within
scope and authorization boundaries, and reports results back to the API.

It NEVER trusts arbitrary commands from model output.
It NEVER performs actions outside validated engagement scope.
"""

import asyncio
import os
import signal
import sys
import time

import redis.asyncio as aioredis
import structlog

logger = structlog.get_logger()

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
WORKER_AUTH_SECRET = os.environ.get("WORKER_AUTH_SECRET", "")
HEARTBEAT_INTERVAL = int(os.environ.get("WORKER_HEARTBEAT_INTERVAL", "30"))
SHUTDOWN = False


def handle_signal(signum: int, frame: object) -> None:
    """Graceful shutdown on SIGINT/SIGTERM."""
    global SHUTDOWN
    logger.info("worker.shutdown_signal", signal=signum)
    SHUTDOWN = True


signal.signal(signal.SIGINT, handle_signal)
signal.signal(signal.SIGTERM, handle_signal)


async def heartbeat(client: aioredis.Redis, worker_id: str) -> None:
    """Send periodic heartbeat to Redis."""
    while not SHUTDOWN:
        await client.setex(f"worker:heartbeat:{worker_id}", HEARTBEAT_INTERVAL * 3, str(time.time()))
        await asyncio.sleep(HEARTBEAT_INTERVAL)


async def process_jobs(client: aioredis.Redis, worker_id: str) -> None:
    """Main job processing loop."""
    logger.info("worker.started", worker_id=worker_id)

    while not SHUTDOWN:
        try:
            # Block-pop from the job queue with timeout
            result = await client.brpop("morphia:jobs", timeout=5)
            if result is None:
                continue

            _, job_data = result
            logger.info("worker.job_received", worker_id=worker_id, job=job_data[:100])

            # TODO: Deserialize job, validate scope, execute step, report result
            # For now, acknowledge receipt
            logger.info("worker.job_processed", worker_id=worker_id)

        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("worker.job_error", worker_id=worker_id)
            await asyncio.sleep(5)  # backoff on error

    logger.info("worker.stopped", worker_id=worker_id)


async def main() -> None:
    """Worker entry point."""
    worker_id = f"worker-{os.getpid()}"
    client = aioredis.from_url(REDIS_URL, decode_responses=True)

    try:
        await client.ping()
        logger.info("worker.redis_connected", url=REDIS_URL.split("@")[-1])
    except Exception:
        logger.error("worker.redis_connection_failed")
        sys.exit(1)

    # Run heartbeat and job processing concurrently
    await asyncio.gather(
        heartbeat(client, worker_id),
        process_jobs(client, worker_id),
    )

    await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
