from app.core.timezone_utils import get_local_date, resolve_effective_timezone, validate_timezone_name


def test_validate_timezone_name_accepts_valid_timezone() -> None:
    assert validate_timezone_name("Asia/Riyadh") == "Asia/Riyadh"


def test_resolve_effective_timezone_prefers_explicit_value() -> None:
    assert resolve_effective_timezone("UTC") == "UTC"


def test_get_local_date_returns_date_object() -> None:
    value = get_local_date("Asia/Riyadh")
    assert hasattr(value, "year")
    assert hasattr(value, "month")
    assert hasattr(value, "day")
