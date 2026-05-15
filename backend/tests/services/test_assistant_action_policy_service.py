from app.services.assistant_action_policy_service import (
    build_eligible_assistant_actions,
    evaluate_action_eligibility,
)


BASE_CONTEXT = {
    "active_plan": {
        "plan_id": 55,
        "title": "ML Plan",
        "status": "active",
        "version": 7,
        "schedule_revision": 3,
        "preferred_time_window": "evening",
        "temporary_note": "Keep sessions short.",
        "summary": {
            "pending_items_count": 10,
            "overdue_items_count": 2,
        },
    },
    "recovery_preview": {
        "plan_version": 7,
        "schedule_revision": 3,
        "needs_recovery": True,
        "recommended_action": "rebuild",
        "recommended_recovery_mode": "rebalance",
        "overdue_items_count": 2,
        "drift_level": "moderate_drift",
        "recovery_pressure_ratio": 1.2,
    },
    "active_plan_courses": [
        {"course_id": 114, "title": "Machine Learning Foundations"},
    ],
    "schedule_queue_courses": [
        {"queue_item_id": 91, "course_id": 205, "title": "Queued Course", "status": "queued"},
    ],
    "recommendations": [
        {"course_id": 114, "title": "Machine Learning Foundations", "topic_tags": ["machine_learning"]},
        {"course_id": 205, "title": "Queued Course", "topic_tags": ["python"]},
        {"course_id": 132, "title": "Deep Learning With Tensorflow", "topic_tags": ["deep_learning", "python"]},
    ],
}

BASE_GOVERNANCE = {
    "can_suggest_actions": True,
}


def test_build_eligible_actions_for_recovery_guidance_returns_only_valid_actions() -> None:
    actions = build_eligible_assistant_actions(
        intent="recovery_guidance",
        context=BASE_CONTEXT,
        governance=BASE_GOVERNANCE,
    )

    action_types = [action.action_type for action in actions]
    assert action_types == [
        "review_plan_recovery_options",
        "apply_recommended_recovery",
        "pause_active_plan",
    ]
    assert actions[1].request_payload["expected_version"] == 7
    assert actions[1].request_payload["expected_schedule_revision"] == 3
    assert actions[2].request_payload["expected_version"] == 7


def test_build_eligible_actions_for_schedule_support_on_paused_plan_returns_resume_not_pause() -> None:
    context = {
        **BASE_CONTEXT,
        "active_plan": {
            **BASE_CONTEXT["active_plan"],
            "status": "paused",
        },
    }

    actions = build_eligible_assistant_actions(
        intent="schedule_support",
        context=context,
        governance=BASE_GOVERNANCE,
    )

    action_types = [action.action_type for action in actions]
    assert "resume_active_plan" in action_types
    assert "pause_active_plan" not in action_types
    assert action_types.count("review_plan_recovery_options") == 1


def test_build_eligible_actions_for_course_guidance_skips_courses_already_in_plan_or_queue() -> None:
    actions = build_eligible_assistant_actions(
        intent="next_course_guidance",
        context=BASE_CONTEXT,
        governance=BASE_GOVERNANCE,
    )

    assert len(actions) == 1
    assert actions[0].action_type == "queue_top_recommendation"
    assert actions[0].request_payload["course_id"] == 132


def test_build_eligible_actions_returns_empty_when_governance_disables_actions() -> None:
    actions = build_eligible_assistant_actions(
        intent="recovery_guidance",
        context=BASE_CONTEXT,
        governance={"can_suggest_actions": False},
    )
    assert actions == []


def test_evaluate_action_eligibility_blocks_stale_recovery_mode() -> None:
    eligibility = evaluate_action_eligibility(
        action_type="apply_recommended_recovery",
        request_payload={
            "plan_id": 55,
            "mode": "rebuild",
            "expected_version": 7,
            "expected_schedule_revision": 3,
        },
        context=BASE_CONTEXT,
    )
    assert eligibility.is_allowed is False
    assert eligibility.failure_reason == "recovery_mode_stale"


def test_evaluate_action_eligibility_blocks_resume_when_plan_is_not_paused() -> None:
    eligibility = evaluate_action_eligibility(
        action_type="resume_active_plan",
        request_payload={"plan_id": 55, "expected_version": 7},
        context=BASE_CONTEXT,
    )
    assert eligibility.is_allowed is False
    assert eligibility.failure_reason == "plan_not_paused"


def test_evaluate_action_eligibility_blocks_stale_plan_version_for_mutating_actions() -> None:
    eligibility = evaluate_action_eligibility(
        action_type="pause_active_plan",
        request_payload={"plan_id": 55, "expected_version": 6},
        context=BASE_CONTEXT,
    )

    assert eligibility.is_allowed is False
    assert eligibility.failure_reason == "stale_plan_version"


def test_evaluate_action_eligibility_blocks_stale_schedule_revision_for_recovery_actions() -> None:
    eligibility = evaluate_action_eligibility(
        action_type="apply_recommended_recovery",
        request_payload={
            "plan_id": 55,
            "mode": "rebalance",
            "expected_version": 7,
            "expected_schedule_revision": 2,
        },
        context=BASE_CONTEXT,
    )

    assert eligibility.is_allowed is False
    assert eligibility.failure_reason == "stale_schedule_revision"
