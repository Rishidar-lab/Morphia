"""Provider adapter interface — docs/architecture.md §11.

Every adapter normalizes chat/completion calls behind the same shape so
the worker's execution loop never branches on which vendor is configured.
Provider API keys are read from the environment only (app.config) and
must never be logged, persisted, or returned in a response.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class ProviderMessage:
    role: str  # "system" | "user" | "assistant"
    content: str


@dataclass
class ProviderResponse:
    content: str
    provider: str
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    estimated_cost_usd: float = 0.0


class ProviderError(Exception):
    """Raised for any provider failure. `retryable` distinguishes transient
    failures (timeouts, 429/5xx) from permanent ones (bad key, bad request)."""

    def __init__(self, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.retryable = retryable


class ProviderAdapter(ABC):
    """Common interface implemented by every provider (mock/OpenAI/OpenRouter/local)."""

    name: str

    @abstractmethod
    async def invoke(self, messages: list[ProviderMessage]) -> ProviderResponse:
        """Send a chat/completion request and return a normalized response.

        Raises ProviderError on failure — never returns a partial/None response.
        """
        raise NotImplementedError
