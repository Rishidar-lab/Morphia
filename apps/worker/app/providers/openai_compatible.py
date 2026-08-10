"""Shared implementation for any OpenAI Chat Completions-compatible endpoint.

OpenAI, OpenRouter, and local/Ollama-compatible servers all speak this same
wire format, so each concrete adapter is just this class with a base URL,
model name, and (optional) API key plugged in.
"""

import httpx

from app.providers.base import ProviderAdapter, ProviderError, ProviderMessage, ProviderResponse

# Rough public per-1K-token pricing for cost estimation only — not billing-accurate.
# Unknown models estimate at $0.
_COST_PER_1K_TOKENS_USD: dict[str, tuple[float, float]] = {
    "gpt-4o-mini": (0.00015, 0.0006),
    "openai/gpt-4o-mini": (0.00015, 0.0006),
}


class OpenAICompatibleProvider(ProviderAdapter):
    def __init__(
        self,
        *,
        name: str,
        base_url: str,
        model: str,
        api_key: str = "",
        timeout_seconds: float = 60.0,
    ) -> None:
        self.name = name
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._api_key = api_key
        self._timeout = timeout_seconds

    async def invoke(self, messages: list[ProviderMessage]) -> ProviderResponse:
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        payload = {
            "model": self._model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
        }

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    f"{self._base_url}/chat/completions", json=payload, headers=headers
                )
        except httpx.TimeoutException as exc:
            raise ProviderError(f"{self.name} request timed out: {exc}", retryable=True) from exc
        except httpx.HTTPError as exc:
            raise ProviderError(f"{self.name} request failed: {exc}", retryable=True) from exc

        if response.status_code == 429 or response.status_code >= 500:
            raise ProviderError(
                f"{self.name} returned {response.status_code}: {response.text[:300]}",
                retryable=True,
            )
        if response.status_code >= 400:
            raise ProviderError(
                f"{self.name} returned {response.status_code}: {response.text[:300]}",
                retryable=False,
            )

        try:
            data = response.json()
            content = data["choices"][0]["message"]["content"] or ""
            usage = data.get("usage", {})
            prompt_tokens = int(usage.get("prompt_tokens", 0))
            completion_tokens = int(usage.get("completion_tokens", 0))
        except (KeyError, IndexError, ValueError, TypeError) as exc:
            raise ProviderError(
                f"{self.name} returned an unexpected response shape: {exc}", retryable=False
            ) from exc

        in_rate, out_rate = _COST_PER_1K_TOKENS_USD.get(self._model, (0.0, 0.0))
        cost = (prompt_tokens / 1000) * in_rate + (completion_tokens / 1000) * out_rate

        return ProviderResponse(
            content=content,
            provider=self.name,
            model=self._model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            estimated_cost_usd=round(cost, 6),
        )
