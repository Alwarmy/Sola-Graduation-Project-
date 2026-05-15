import pytest

from app.core.exceptions import ConflictException, NotFoundException
from app.models.learning_plan import LearningPlan
from app.services.assistant_action_service import confirm_action_run
from app.services.plan_recovery_service import get_plan_recovery_preview


pytestmark = pytest.mark.integration


def test_assistant_recovery_action_executes_once_and_rejects_duplicate_confirm(
    db_session,
    create_user_bundle,
    create_learning_plan_bundle,
    generate_plan_schedule_bundle,
    mark_plan_as_drifted,
    create_conversation,
    create_action_run,
) -> None:
    user = create_user_bundle(email="assistant@example.com")
    plan = create_learning_plan_bundle(user=user, course_count=2)
    generated_plan = generate_plan_schedule_bundle(user=user, plan=plan)
    drifted_plan = mark_plan_as_drifted(plan=generated_plan)
    preview = get_plan_recovery_preview(db=db_session, user_id=user.id, plan_id=drifted_plan.id)

    conversation = create_conversation(user=user)
    action_run = create_action_run(
        user=user,
        conversation=conversation,
        action_type="apply_recommended_recovery",
        request_payload={
            "plan_id": drifted_plan.id,
            "mode": preview["recommended_recovery_mode"],
            "expected_version": preview["plan_version"],
            "expected_schedule_revision": preview["schedule_revision"],
            "temporary_note": None,
        },
        preview_payload=dict(preview),
    )

    confirmed_action = confirm_action_run(
        db=db_session,
        user_id=user.id,
        action_run_id=action_run.id,
    )

    assert confirmed_action.status == "executed"
    assert confirmed_action.failure_reason is None

    updated_plan = db_session.query(LearningPlan).filter(LearningPlan.id == drifted_plan.id).first()
    assert updated_plan.schedule_revision == preview["schedule_revision"] + 1

    with pytest.raises(ConflictException):
        confirm_action_run(
            db=db_session,
            user_id=user.id,
            action_run_id=action_run.id,
        )

    db_session.refresh(updated_plan)
    assert updated_plan.schedule_revision == preview["schedule_revision"] + 1


def test_assistant_recovery_action_rejects_stale_confirmation_and_marks_failed(
    db_session,
    create_user_bundle,
    create_learning_plan_bundle,
    generate_plan_schedule_bundle,
    mark_plan_as_drifted,
    create_conversation,
    create_action_run,
) -> None:
    user = create_user_bundle(email="assistant-stale@example.com")
    plan = create_learning_plan_bundle(user=user, course_count=2)
    generated_plan = generate_plan_schedule_bundle(user=user, plan=plan)
    drifted_plan = mark_plan_as_drifted(plan=generated_plan)
    preview = get_plan_recovery_preview(db=db_session, user_id=user.id, plan_id=drifted_plan.id)

    conversation = create_conversation(user=user)
    action_run = create_action_run(
        user=user,
        conversation=conversation,
        action_type="apply_recommended_recovery",
        request_payload={
            "plan_id": drifted_plan.id,
            "mode": preview["recommended_recovery_mode"],
            "expected_version": preview["plan_version"],
            "expected_schedule_revision": preview["schedule_revision"],
            "temporary_note": None,
        },
        preview_payload=dict(preview),
    )

    current_plan = db_session.query(LearningPlan).filter(LearningPlan.id == drifted_plan.id).first()
    current_plan.version += 1
    db_session.commit()

    with pytest.raises(ConflictException):
        confirm_action_run(
            db=db_session,
            user_id=user.id,
            action_run_id=action_run.id,
        )

    db_session.refresh(action_run)
    assert action_run.status == "failed"
    assert action_run.failure_reason == "stale_plan_version"


def test_assistant_action_confirmation_enforces_cross_user_isolation(
    db_session,
    create_user_bundle,
    create_conversation,
    create_action_run,
) -> None:
    owner = create_user_bundle(email="owner@example.com")
    other_user = create_user_bundle(email="other@example.com")
    conversation = create_conversation(user=owner)
    action_run = create_action_run(
        user=owner,
        conversation=conversation,
        action_type="queue_top_recommendation",
        request_payload={"course_id": 123, "note": "Queue it"},
        preview_payload={"course_id": 123},
    )

    with pytest.raises(NotFoundException):
        confirm_action_run(
            db=db_session,
            user_id=other_user.id,
            action_run_id=action_run.id,
        )
