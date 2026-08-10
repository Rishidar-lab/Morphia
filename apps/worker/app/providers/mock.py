"""Deterministic offline provider — the default when no provider key is configured.

Exercises the full run pipeline (planning -> approval -> execution -> evidence)
in dev/CI without network access or spend, per docs/architecture.md §11.
"""

import hashlib

from app.providers.base import ProviderAdapter, ProviderMessage, ProviderResponse


class MockProvider(ProviderAdapter):
    name = "mock"

    async def invoke(self, messages: list[ProviderMessage]) -> ProviderResponse:
        last_user = next((m.content for m in reversed(messages) if m.role == "user"), "")
        digest = hashlib.sha256(last_user.encode("utf-8")).hexdigest()[:12]
        content = (
            "[mock-provider deterministic response]\n"
            f"Received {len(messages)} message(s). Last user content digest: {digest}.\n"
            "No real model was called; this is a placeholder result for pipeline testing."
        )
        return ProviderResponse(
            content=content,
            provider=self.name,
            model="mock-1",
            prompt_tokens=sum(len(m.content.split()) for m in messages),
            completion_tokens=len(content.split()),
            estimated_cost_usd=0.0,
        )
