"""Thin async client for the API's worker-callback routes (app.routers.worker).

This is the worker's only channel to state — no direct database access
(docs/security.md §5). Every call carries the shared WORKER_AUTH_SECRET.
"""

from dataclasses import dataclass

import httpx

from app import config


class ApiClientError(Exception):
    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass
class ClaimResult:
    run_id: str
    done: bool
    engagement_id: str | None = None
    step_number: int | None = None
    action: str | None = None
    target: str | None = None
    prompt: str | None = None
    agent_profile: str | None = None
    tool: str | None = None


class WorkerApiClient:
    def __init__(
        self, worker_id: str, base_url: str | None = None, timeout_seconds: float = 30.0
    ) -> None:
        self.worker_id = worker_id
        self._base_url = (base_url or config.API_BASE_URL).rstrip("/")
        self._timeout = timeout_seconds

    def _headers(self) -> dict:
        return {"X-Worker-Auth": config.WORKER_AUTH_SECRET}

    async def claim_run(self, run_id: str) -> ClaimResult:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{self._base_url}/api/worker/runs/{run_id}/claim",
                json={"worker_id": self.worker_id},
                headers=self._headers(),
            )
        if resp.status_code == 403:
            raise ApiClientError(f"Scope denied: {resp.json().get('detail')}", status_code=403)
        if resp.status_code >= 400:
            raise ApiClientError(
                f"claim_run failed ({resp.status_code}): {resp.text[:300]}",
                status_code=resp.status_code,
            )
        data = resp.json()
        return ClaimResult(**data)

    async def submit_step(
        self,
        run_id: str,
        *,
        step_number: int,
        action: str,
        status: str,
        input_data: dict | None,
        output_data: dict | None,
        error: str = "",
    ) -> dict:
        idempotency_key = f"{run_id}:{step_number}"
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{self._base_url}/api/worker/runs/{run_id}/steps",
                json={
                    "worker_id": self.worker_id,
                    "step_number": step_number,
                    "action": action,
                    "status": status,
                    "input_data": input_data,
                    "output_data": output_data,
                    "error": error,
                    "idempotency_key": idempotency_key,
                },
                headers=self._headers(),
            )
        if resp.status_code >= 400:
            raise ApiClientError(
                f"submit_step failed ({resp.status_code}): {resp.text[:300]}",
                status_code=resp.status_code,
            )
        return resp.json()

    async def transition_run(self, run_id: str, target_state: str, reason: str = "") -> dict:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{self._base_url}/api/worker/runs/{run_id}/transition",
                json={"worker_id": self.worker_id, "target_state": target_state, "reason": reason},
                headers=self._headers(),
            )
        if resp.status_code >= 400:
            raise ApiClientError(
                f"transition_run failed ({resp.status_code}): {resp.text[:300]}",
                status_code=resp.status_code,
            )
        return resp.json()
