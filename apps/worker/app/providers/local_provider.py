from app.providers.openai_compatible import OpenAICompatibleProvider


class LocalProvider(OpenAICompatibleProvider):
    """Self-hosted / Ollama-compatible endpoint. No API key required."""

    def __init__(self, *, base_url: str, model: str) -> None:
        super().__init__(name="local", base_url=base_url, model=model, api_key="")
