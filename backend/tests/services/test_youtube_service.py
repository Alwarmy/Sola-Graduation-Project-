import pytest
import requests

from app.core.exceptions import ConfigurationException, ExternalServiceException
from app.services.youtube_service import search_youtube_content


def test_search_youtube_content_requires_provider_configuration(monkeypatch) -> None:
    monkeypatch.setattr("app.services.youtube_service.settings.YOUTUBE_API_KEY", "")

    with pytest.raises(ConfigurationException) as exc_info:
        search_youtube_content("python backend")

    assert exc_info.value.error_code == "youtube_provider_not_configured"


def test_search_youtube_content_normalizes_provider_request_failures(monkeypatch) -> None:
    monkeypatch.setattr("app.services.youtube_service.settings.YOUTUBE_API_KEY", "test-key")

    def _raise_request_exception(*args, **kwargs):
        raise requests.RequestException("provider unavailable")

    monkeypatch.setattr("app.services.youtube_service.requests.get", _raise_request_exception)

    with pytest.raises(ExternalServiceException) as exc_info:
        search_youtube_content("python backend")

    assert exc_info.value.error_code == "youtube_provider_request_failed"
    assert exc_info.value.details == {
        "provider": "youtube",
        "operation": "search",
    }
