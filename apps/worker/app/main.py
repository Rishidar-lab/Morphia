"""MORPHIA Worker — Job processing with Redis queue.

The worker polls Redis for queued jobs, executes run steps within
scope and authorization boundaries, and reports results back to the API.

It NEVER trusts arbitrary commands from model output.
It NEVER performs actions outside validated engagement scope.
It has NO direct database access — every fact about a run, and every
scope decision, is mediated by the worker-authenticated API endpoints
in api_client.py (docs/security.md §5).
"""

import asyncio
import json
import os
import signal
import sys
import time

import redis.asyncio as aioredis
import structlog

from app import config
from app.api_client import ApiClientError, WorkerApiClient
from app.providers import ProviderError, ProviderMessage, get_provider

logger = structlog.get_logger()

SHUTDOWN = False

SYSTEM_PROMPT = (
    "You are a MORPHIA orchestration agent. You reason about an authorized "
    "security-research step within a validated engagement scope. You do not "
    "execute tools yourself and do not claim to have performed network "
    "actions; you analyze the given target/action and produce findings, "
    "next steps, or a plan for human/tool follow-up."
)


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
        await client.setex(
            f"worker:heartbeat:{worker_id}", config.HEARTBEAT_INTERVAL * 3, str(time.time())
        )
        await asyncio.sleep(config.HEARTBEAT_INTERVAL)


async def execute_run(run_id: str, worker_id: str) -> None:
    """Drive a run to completion: claim each step, invoke the provider, report back."""
    api = WorkerApiClient(worker_id)
    provider = get_provider()
    log = logger.bind(run_id=run_id, worker_id=worker_id, provider=provider.name)

    while True:
        try:
            claim = await api.claim_run(run_id)
        except ApiClientError as exc:
            log.warning(
                "worker.claim_denied_or_failed", error=str(exc), status_code=exc.status_code
            )
            return

        if claim.done:
            try:
                await api.transition_run(run_id, "COMPLETED")
                log.info("worker.run_completed")
            except ApiClientError as exc:
                log.error("worker.complete_transition_failed", error=str(exc))
            return

        log.info(
            "worker.step_claimed",
            step_number=claim.step_number,
            action=claim.action,
            target=claim.target,
        )

        messages = [
            ProviderMessage(role="system", content=SYSTEM_PROMPT),
            ProviderMessage(
                role="user",
                content=claim.prompt or f"Action: {claim.action}\nTarget: {claim.target}",
            ),
        ]

        try:
            result = await provider.invoke(messages)
        except ProviderError as exc:
            log.error("worker.provider_error", step_number=claim.step_number, error=str(exc))
            try:
                await api.submit_step(
                    run_id,
                    step_number=claim.step_number or 0,
                    action=claim.action or "",
                    status="failed",
                    input_data={"target": claim.target, "action": claim.action},
                    output_data=None,
                    error=str(exc),
                )
                await api.transition_run(
                    run_id, "FAILED", reason=f"Provider error at step {claim.step_number}: {exc}"
                )
            except ApiClientError as report_exc:
                log.error("worker.failure_report_failed", error=str(report_exc))
            return

        try:
            await api.submit_step(
                run_id,
                step_number=claim.step_number or 0,
                action=claim.action or "",
                status="completed",
                input_data={"target": claim.target, "action": claim.action, "prompt": claim.prompt},
                output_data={
                    "response": result.content,
                    "provider": result.provider,
                    "model": result.model,
                    "prompt_tokens": result.prompt_tokens,
                    "completion_tokens": result.completion_tokens,
                    "estimated_cost_usd": result.estimated_cost_usd,
                },
            )
        except ApiClientError as exc:
            log.error("worker.submit_step_failed", step_number=claim.step_number, error=str(exc))
            return

        log.info("worker.step_completed", step_number=claim.step_number)


async def process_jobs(client: aioredis.Redis, worker_id: str) -> None:
    """Main job processing loop."""
    logger.info("worker.started", worker_id=worker_id, provider=get_provider().name)

    while not SHUTDOWN:
        try:
            # Block-pop from the job queue with timeout
            result = await client.brpop("morphia:jobs", timeout=5)
            if result is None:
                continue

            _, job_data = result
            try:
                job = json.loads(job_data)
                run_id = job["run_id"]
            except (json.JSONDecodeError, KeyError, TypeError):
                logger.error("worker.malformed_job", job=job_data[:200])
                continue

            logger.info("worker.job_received", worker_id=worker_id, run_id=run_id)
            await execute_run(run_id, worker_id)

        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("worker.job_error", worker_id=worker_id)
            await asyncio.sleep(5)  # backoff on error

    logger.info("worker.stopped", worker_id=worker_id)


async def main() -> None:
    """Worker entry point."""
    worker_id = f"worker-{os.getpid()}"
    # socket_timeout must exceed the BRPOP blocking timeout (5s) below, or the
    # client-side socket read races the server-side block and raises spuriously.
    client = aioredis.from_url(config.REDIS_URL, decode_responses=True, socket_timeout=10)

    try:
        await client.ping()
        logger.info("worker.redis_connected", url=config.REDIS_URL.split("@")[-1])
    except Exception:
        logger.error("worker.redis_connection_failed")
        sys.exit(1)

    if not config.WORKER_AUTH_SECRET:
        logger.error("worker.missing_auth_secret", detail="WORKER_AUTH_SECRET is required.")
        sys.exit(1)

    # Run heartbeat and job processing concurrently
    await asyncio.gather(
        heartbeat(client, worker_id),
        process_jobs(client, worker_id),
    )

    await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
