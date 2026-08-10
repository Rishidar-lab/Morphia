from app.providers.openai_compatible import OpenAICompatibleProvider


class OpenAIProvider(OpenAICompatibleProvider):
    def __init__(self, *, api_key: str, base_url: str, model: str) -> None:
        super().__init__(name="openai", base_url=base_url, model=model, api_key=api_key)
