from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.core.config import settings


def get_app_timezone_name() -> str:
    candidate = (settings.APP_TIMEZONE or "Asia/Riyadh").strip()
    return candidate or "Asia/Riyadh"


def validate_timezone_name(timezone_name: str) -> str:
    normalized = (timezone_name or "").strip()
    if not normalized:
        raise ValueError("Timezone is required.")

    try:
        ZoneInfo(normalized)
    except ZoneInfoNotFoundError as exc:
        raise ValueError("Invalid timezone.") from exc

    return normalized


def resolve_effective_timezone(timezone_name: str | None) -> str:
    candidate = timezone_name if timezone_name is not None else get_app_timezone_name()
    return validate_timezone_name(candidate)


def get_local_date(timezone_name: str | None = None) -> date:
    resolved = resolve_effective_timezone(timezone_name)
    return datetime.now(ZoneInfo(resolved)).date()