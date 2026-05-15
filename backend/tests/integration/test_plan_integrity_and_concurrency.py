from datetime import timedelta

import pytest
from sqlalchemy.exc import IntegrityError

from app.core.exceptions import PreconditionFailedException
from app.core.timezone_utils import get_local_date, resolve_effective_timezone
from app.models.learning_plan import LearningPlan
from app.models.learning_plan_item import LearningPlanItem
from app.services.plan_execution_service import (
    complete_learning_plan_item,
    skip_learning_plan_item,
    start_learning_plan_item,
)
from app.services.plan_recovery_service import apply_plan_recovery, get_plan_recovery_preview
from app.services.plan_schedule_service import generate_initial_plan_schedule


pytestmark = pytest.mark.integration


def test_open_plan_unique_index_blocks_multiple_open_plans(
    db_session,
    create_user_bundle,
    create_learning_plan_bundle,
) -> None:
    user = create_user_bundle()
    create_learning_plan_bundle(user=user)

    second_plan = LearningPlan(
        user_id=user.id,
        title="Conflicting Plan",
        goal="Duplicate open plan",
        status="paused",
        current_focus_snapshot="python",
        weekly_hours_snapshot=10,
        schedule_timezone_snapshot="Asia/Riyadh",
        schedule_revision=1,
        version=1,
        source_learning_state_snapshot={},
        plan_summary={},
    )
    db_session.add(second_plan)

    with pytest.raises(IntegrityError):
        db_session.commit()

    db_session.rollback()


def test_database_constraints_reject_invalid_lifecycle_values(
    db_session,
    create_user_bundle,
    create_learning_plan_bundle,
    generate_plan_schedule_bundle,
) -> None:
    user = create_user_bundle(email="constraints@example.com")
    plan = create_learning_plan_bundle(user=user)
    generated_plan = generate_plan_schedule_bundle(user=user, plan=plan)

    invalid_plan = LearningPlan(
        user_id=user.id,
        title="Invalid Status Plan",
        goal="Invalid lifecycle value",
        status="draft",
        current_focus_snapshot="python",
        weekly_hours_snapshot=10,
        schedule_timezone_snapshot="Asia/Riyadh",
        schedule_revision=1,
        version=1,
        source_learning_state_snapshot={},
        plan_summary={},
    )
    db_session.add(invalid_plan)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

    valid_item = (
        db_session.query(LearningPlanItem)
        .filter(LearningPlanItem.plan_id == generated_plan.id)
        .order_by(LearningPlanItem.schedule_order_index.asc())
        .first()
    )
    assert valid_item is not None

    invalid_item = LearningPlanItem(
        plan_id=generated_plan.id,
        plan_course_id=valid_item.plan_course_id,
        course_id=valid_item.course_id,
        course_unit_id=valid_item.course_unit_id,
        title="Invalid Item",
        item_type="study_session",
        status="done",
        version=1,
        schedule_order_index=999,
        source_order_index=999,
        scheduled_date=valid_item.scheduled_date,
        time_window="evening",
        planned_minutes=30,
        actual_started_at=None,
        actual_completed_at=None,
        actual_minutes=None,
        skipped_at=None,
        skip_reason=None,
        segment_index=99,
        segment_start_second=0,
        segment_end_second=1800,
        practical_signal="mixed",
        load_signal="medium",
        item_metadata={},
    )
    db_session.add(invalid_item)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_schedule_generation_item_execution_and_recovery_reject_stale_versions(
    db_session,
    create_user_bundle,
    create_learning_plan_bundle,
    generate_plan_schedule_bundle,
    mark_plan_as_drifted,
) -> None:
    user = create_user_bundle(email="concurrency@example.com")
    plan = create_learning_plan_bundle(user=user, course_count=2)
    generated_plan = generate_plan_schedule_bundle(user=user, plan=plan)

    with pytest.raises(PreconditionFailedException):
        generate_initial_plan_schedule(
            db=db_session,
            user_id=user.id,
            plan_id=generated_plan.id,
            force_rebuild=True,
            expected_version=generated_plan.version - 1,
            expected_schedule_revision=generated_plan.schedule_revision,
        )

    first_item = (
        db_session.query(LearningPlanItem)
        .filter(LearningPlanItem.plan_id == generated_plan.id)
        .order_by(LearningPlanItem.schedule_order_index.asc())
        .first()
    )
    assert first_item is not None
    original_item_version = first_item.version

    start_result = start_learning_plan_item(
        db=db_session,
        user_id=user.id,
        plan_id=generated_plan.id,
        item_id=first_item.id,
        expected_version=original_item_version,
    )
    assert start_result["item"]["status"] == "in_progress"

    with pytest.raises(PreconditionFailedException):
        complete_learning_plan_item(
            db=db_session,
            user_id=user.id,
            plan_id=generated_plan.id,
            item_id=first_item.id,
            actual_minutes=25,
            expected_version=original_item_version,
        )

    second_item = (
        db_session.query(LearningPlanItem)
        .filter(LearningPlanItem.plan_id == generated_plan.id)
        .order_by(LearningPlanItem.schedule_order_index.asc())
        .offset(1)
        .first()
    )
    third_item = (
        db_session.query(LearningPlanItem)
        .filter(LearningPlanItem.plan_id == generated_plan.id)
        .order_by(LearningPlanItem.schedule_order_index.asc())
        .offset(2)
        .first()
    )
    assert second_item is not None
    assert third_item is not None

    complete_result = complete_learning_plan_item(
        db=db_session,
        user_id=user.id,
        plan_id=generated_plan.id,
        item_id=second_item.id,
        actual_minutes=30,
        expected_version=second_item.version,
    )
    assert complete_result["item"]["status"] == "completed"

    skip_result = skip_learning_plan_item(
        db=db_session,
        user_id=user.id,
        plan_id=generated_plan.id,
        item_id=third_item.id,
        skip_reason="Need to revisit prerequisites first.",
        expected_version=third_item.version,
    )
    assert skip_result["item"]["status"] == "skipped"

    drifted_plan = mark_plan_as_drifted(plan=generated_plan)
    preview = get_plan_recovery_preview(db=db_session, user_id=user.id, plan_id=drifted_plan.id)

    current_plan = db_session.query(LearningPlan).filter(LearningPlan.id == drifted_plan.id).first()
    current_plan.version += 1
    db_session.commit()

    with pytest.raises(PreconditionFailedException):
        apply_plan_recovery(
            db=db_session,
            user_id=user.id,
            plan_id=current_plan.id,
            mode=preview["recommended_recovery_mode"],
            expected_version=preview["plan_version"],
            expected_schedule_revision=preview["schedule_revision"],
            preferred_time_window=None,
            pace_mode=None,
            preferred_study_days=[],
            max_daily_minutes=None,
            session_cap_minutes=None,
            temporary_note=None,
            recovery_note="stale request",
        )


def test_recovery_preserves_execution_history_and_rebuilds_only_pending_items(
    db_session,
    create_user_bundle,
    create_learning_plan_bundle,
    generate_plan_schedule_bundle,
) -> None:
    user = create_user_bundle(email="recovery@example.com")
    plan = create_learning_plan_bundle(user=user, course_count=2)
    generated_plan = generate_plan_schedule_bundle(user=user, plan=plan)

    plan_items = (
        db_session.query(LearningPlanItem)
        .filter(LearningPlanItem.plan_id == generated_plan.id)
        .order_by(LearningPlanItem.schedule_order_index.asc())
        .all()
    )
    assert len(plan_items) >= 4

    start_learning_plan_item(
        db=db_session,
        user_id=user.id,
        plan_id=generated_plan.id,
        item_id=plan_items[0].id,
        expected_version=plan_items[0].version,
    )
    complete_learning_plan_item(
        db=db_session,
        user_id=user.id,
        plan_id=generated_plan.id,
        item_id=plan_items[1].id,
        actual_minutes=30,
        expected_version=plan_items[1].version,
    )
    skip_learning_plan_item(
        db=db_session,
        user_id=user.id,
        plan_id=generated_plan.id,
        item_id=plan_items[2].id,
        skip_reason="Already covered elsewhere.",
        expected_version=plan_items[2].version,
    )

    refreshed_plan = db_session.query(LearningPlan).filter(LearningPlan.id == generated_plan.id).first()
    remaining_pending_items = (
        db_session.query(LearningPlanItem)
        .filter(LearningPlanItem.plan_id == refreshed_plan.id)
        .filter(LearningPlanItem.status == "pending")
        .order_by(LearningPlanItem.schedule_order_index.asc())
        .all()
    )
    local_today = get_local_date(resolve_effective_timezone(refreshed_plan.schedule_timezone_snapshot))
    overdue_date = local_today - timedelta(days=2)
    for item in remaining_pending_items:
        item.scheduled_date = overdue_date

    db_session.flush()
    preview = get_plan_recovery_preview(db=db_session, user_id=user.id, plan_id=refreshed_plan.id)
    recovery_result = apply_plan_recovery(
        db=db_session,
        user_id=user.id,
        plan_id=refreshed_plan.id,
        mode=preview["recommended_recovery_mode"],
        expected_version=preview["plan_version"],
        expected_schedule_revision=preview["schedule_revision"],
        preferred_time_window=None,
        pace_mode=None,
        preferred_study_days=[],
        max_daily_minutes=None,
        session_cap_minutes=None,
        temporary_note=None,
        recovery_note="Integration recovery test",
    )

    assert recovery_result["preserved_in_progress_items_count"] == 1
    assert recovery_result["preserved_completed_items_count"] == 1
    assert recovery_result["preserved_skipped_items_count"] == 1
    assert recovery_result["rebuilt_pending_items_count"] >= 1
    assert recovery_result["schedule_revision"] == preview["schedule_revision"] + 1
    assert recovery_result["plan_version"] == preview["plan_version"] + 1
