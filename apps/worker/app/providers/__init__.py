"""Provider factory — selects an adapter from configuration.

Explicit `MORPHIA_PROVIDER` wins; otherwise the first provider with a
configured key wins; otherwise falls back to the deterministic mock so
the pipeline is always runnable without spend or network access.
"""

from app import config
from app.providers.base import ProviderAdapter, ProviderError, ProviderMessage, ProviderResponse
from app.providers.local_provider import LocalProvider
from app.providers.mock import MockProvider
from app.providers.openai_provider import OpenAIProvider
from app.providers.openrouter_provider import OpenRouterProvider

__all__ = [
    "ProviderAdapter",
    "ProviderError",
    "ProviderMessage",
    "ProviderResponse",
    "get_provider",
]


def get_provider(override: str | None = None) -> ProviderAdapter:
    choice = (override or config.PROVIDER).strip().lower()

    if not choice:
        if config.OPENAI_API_KEY:
            choice = "openai"
        elif config.OPENROUTER_API_KEY:
            choice = "openrouter"
        else:
            choice = "mock"

    if choice == "mock":
        return MockProvider()
    if choice == "openai":
        return OpenAIProvider(
            api_key=config.OPENAI_API_KEY,
            base_url=config.OPENAI_BASE_URL,
            model=config.OPENAI_MODEL,
        )
    if choice == "openrouter":
        return OpenRouterProvider(
            api_key=config.OPENROUTER_API_KEY,
            base_url=config.OPENROUTER_BASE_URL,
            model=config.OPENROUTER_MODEL,
        )
    if choice == "local":
        return LocalProvider(base_url=config.LOCAL_MODEL_URL, model=config.LOCAL_MODEL_NAME)

    raise ValueError(f"Unknown provider '{choice}'. Expected: mock, openai, openrouter, local.")
