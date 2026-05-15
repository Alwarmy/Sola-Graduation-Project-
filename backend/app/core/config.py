from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE_PATH = PROJECT_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE_PATH),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    DATABASE_URL: str = ""
    REDIS_URL: str | None = None

    JWT_SECRET: str = ""
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    REFRESH_TOKEN_SECRET: str = ""
    RATE_LIMIT_BACKEND: str = "memory"
    TRUSTED_PROXY_DEPTH: int = 0
    AUTH_RATE_LIMIT_WINDOW_SECONDS: int = 300
    AUTH_LOGIN_ATTEMPTS_PER_IP: int = 10
    AUTH_LOGIN_ATTEMPTS_PER_IDENTIFIER: int = 5
    AUTH_REGISTER_ATTEMPTS_PER_IP: int = 5
    AUTH_REGISTER_ATTEMPTS_PER_IDENTIFIER: int = 3
    AUTH_REFRESH_ATTEMPTS_PER_IP: int = 20
    AUTH_REFRESH_ATTEMPTS_PER_IDENTIFIER: int = 10
    ADMIN_TOKEN: str | None = None

    OPENAI_API_KEY: str | None = None
    AI_MODEL_NAME: str = "gpt-4o-mini"
    YOUTUBE_API_KEY: str | None = None

    APP_TIMEZONE: str = "Asia/Riyadh"

    def database_url_required(self) -> str:
        value = self.DATABASE_URL.strip()
        if not value:
            raise RuntimeError("DATABASE_URL is not configured.")
        return value

    def jwt_secret_required(self) -> str:
        value = self.JWT_SECRET.strip()
        if not value:
            raise RuntimeError("JWT_SECRET is not configured.")
        return value

    def refresh_token_secret_required(self) -> str:
        value = self.REFRESH_TOKEN_SECRET.strip()
        if value:
            return value
        return self.jwt_secret_required()

    def validate_startup_settings(self) -> None:
        self.database_url_required()
        self.jwt_secret_required()

        if not self.JWT_ALGORITHM.strip():
            raise RuntimeError("JWT_ALGORITHM is not configured.")

        if self.ACCESS_TOKEN_EXPIRE_MINUTES <= 0:
            raise RuntimeError("ACCESS_TOKEN_EXPIRE_MINUTES must be greater than zero.")

        if self.REFRESH_TOKEN_EXPIRE_DAYS <= 0:
            raise RuntimeError("REFRESH_TOKEN_EXPIRE_DAYS must be greater than zero.")

        if self.RATE_LIMIT_BACKEND not in {"memory", "redis"}:
            raise RuntimeError("RATE_LIMIT_BACKEND must be either 'memory' or 'redis'.")

        if self.RATE_LIMIT_BACKEND == "redis" and not (self.REDIS_URL or "").strip():
            raise RuntimeError("REDIS_URL must be configured when RATE_LIMIT_BACKEND is 'redis'.")

        if self.TRUSTED_PROXY_DEPTH < 0:
            raise RuntimeError("TRUSTED_PROXY_DEPTH must be greater than or equal to zero.")

        if self.AUTH_RATE_LIMIT_WINDOW_SECONDS <= 0:
            raise RuntimeError("AUTH_RATE_LIMIT_WINDOW_SECONDS must be greater than zero.")

        if self.AUTH_LOGIN_ATTEMPTS_PER_IP <= 0:
            raise RuntimeError("AUTH_LOGIN_ATTEMPTS_PER_IP must be greater than zero.")

        if self.AUTH_LOGIN_ATTEMPTS_PER_IDENTIFIER <= 0:
            raise RuntimeError("AUTH_LOGIN_ATTEMPTS_PER_IDENTIFIER must be greater than zero.")

        if self.AUTH_REGISTER_ATTEMPTS_PER_IP <= 0:
            raise RuntimeError("AUTH_REGISTER_ATTEMPTS_PER_IP must be greater than zero.")

        if self.AUTH_REGISTER_ATTEMPTS_PER_IDENTIFIER <= 0:
            raise RuntimeError("AUTH_REGISTER_ATTEMPTS_PER_IDENTIFIER must be greater than zero.")

        if self.AUTH_REFRESH_ATTEMPTS_PER_IP <= 0:
            raise RuntimeError("AUTH_REFRESH_ATTEMPTS_PER_IP must be greater than zero.")

        if self.AUTH_REFRESH_ATTEMPTS_PER_IDENTIFIER <= 0:
            raise RuntimeError("AUTH_REFRESH_ATTEMPTS_PER_IDENTIFIER must be greater than zero.")

        if not self.APP_TIMEZONE.strip():
            raise RuntimeError("APP_TIMEZONE is not configured.")

    def validate_openai_settings(self) -> None:
        if not (self.OPENAI_API_KEY or "").strip():
            raise RuntimeError("OPENAI_API_KEY is missing.")

    def validate_youtube_settings(self) -> None:
        if not (self.YOUTUBE_API_KEY or "").strip():
            raise RuntimeError("YOUTUBE_API_KEY is missing.")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
