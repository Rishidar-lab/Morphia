"""Provider adapter tests — mock provider behavior and factory selection."""

import pytest

from app import config
from app.providers import get_provider
from app.providers.base import ProviderMessage
from app.providers.local_provider import LocalProvider
from app.providers.mock import MockProvider
from app.providers.openai_provider import OpenAIProvider
from app.providers.openrouter_provider import OpenRouterProvider


@pytest.mark.asyncio
async def test_mock_provider_is_deterministic():
    provider = MockProvider()
    messages = [ProviderMessage(role="user", content="scan example.com")]

    first = await provider.invoke(messages)
    second = await provider.invoke(messages)

    assert first.content == second.content
    assert first.provider == "mock"
    assert first.estimated_cost_usd == 0.0


@pytest.mark.asyncio
async def test_mock_provider_reflects_message_count():
    provider = MockProvider()
    messages = [
        ProviderMessage(role="system", content="sys"),
        ProviderMessage(role="user", content="hello"),
    ]
    result = await provider.invoke(messages)
    assert "Received 2 message(s)" in result.content


def test_get_provider_defaults_to_mock(monkeypatch):
    monkeypatch.setattr(config, "PROVIDER", "")
    monkeypatch.setattr(config, "OPENAI_API_KEY", "")
    monkeypatch.setattr(config, "OPENROUTER_API_KEY", "")
    assert isinstance(get_provider(), MockProvider)


def test_get_provider_picks_openai_when_key_present(monkeypatch):
    monkeypatch.setattr(config, "PROVIDER", "")
    monkeypatch.setattr(config, "OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(config, "OPENROUTER_API_KEY", "")
    assert isinstance(get_provider(), OpenAIProvider)


def test_get_provider_explicit_override_wins(monkeypatch):
    monkeypatch.setattr(config, "OPENAI_API_KEY", "sk-test")
    assert isinstance(get_provider(override="mock"), MockProvider)


def test_get_provider_local(monkeypatch):
    assert isinstance(get_provider(override="local"), LocalProvider)


def test_get_provider_openrouter_explicit(monkeypatch):
    monkeypatch.setattr(config, "OPENROUTER_API_KEY", "or-test")
    assert isinstance(get_provider(override="openrouter"), OpenRouterProvider)


def test_get_provider_unknown_raises():
    with pytest.raises(ValueError):
        get_provider(override="not-a-real-provider")
