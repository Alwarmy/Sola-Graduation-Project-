from openai import OpenAI

from app.core.exceptions import ConfigurationException
from app.core.config import settings


def get_openai_client() -> OpenAI:
    if not settings.OPENAI_API_KEY:
        raise ConfigurationException(
            "OpenAI provider is not configured.",
            error_code="openai_provider_not_configured",
        )

    return OpenAI(api_key=settings.OPENAI_API_KEY)
