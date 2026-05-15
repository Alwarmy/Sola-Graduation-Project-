import pytest

from app.core.concurrency import assert_expected_schedule_revision, assert_expected_version
from app.core.exceptions import PreconditionFailedException


def test_assert_expected_version_accepts_matching_version() -> None:
    assert_expected_version(
        resource_name="learning_plan",
        expected_version=3,
        current_version=3,
    )


def test_assert_expected_version_rejects_stale_version() -> None:
    with pytest.raises(PreconditionFailedException) as error:
        assert_expected_version(
            resource_name="learning_plan",
            expected_version=2,
            current_version=3,
        )

    assert error.value.error_code == "precondition_failed"
    assert error.value.details == {
        "resource": "learning_plan",
        "reason": "stale_version",
        "expected_version": 2,
        "current_version": 3,
    }


def test_assert_expected_schedule_revision_rejects_stale_revision() -> None:
    with pytest.raises(PreconditionFailedException) as error:
        assert_expected_schedule_revision(
            expected_schedule_revision=4,
            current_schedule_revision=5,
        )

    assert error.value.error_code == "precondition_failed"
    assert error.value.details == {
        "reason": "stale_schedule_revision",
        "expected_schedule_revision": 4,
        "current_schedule_revision": 5,
    }
