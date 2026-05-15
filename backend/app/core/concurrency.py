from __future__ import annotations

from app.core.exceptions import PreconditionFailedException

EXPECTED_VERSION_HEADER = "X-Expected-Version"


def assert_expected_version(
    *,
    resource_name: str,
    expected_version: int,
    current_version: int,
) -> None:
    if expected_version != current_version:
        raise PreconditionFailedException(
            f"{resource_name} version is stale.",
            error_code="precondition_failed",
            details={
                "resource": resource_name,
                "reason": "stale_version",
                "expected_version": expected_version,
                "current_version": current_version,
            },
        )


def assert_expected_schedule_revision(
    *,
    expected_schedule_revision: int,
    current_schedule_revision: int,
) -> None:
    if expected_schedule_revision != current_schedule_revision:
        raise PreconditionFailedException(
            "Learning plan schedule revision is stale.",
            error_code="precondition_failed",
            details={
                "reason": "stale_schedule_revision",
                "expected_schedule_revision": expected_schedule_revision,
                "current_schedule_revision": current_schedule_revision,
            },
        )
