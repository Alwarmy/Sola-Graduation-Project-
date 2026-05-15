from app.services.assistant_response_service import build_grounded_response


BASE_CONTEXT = {
    "profile": {"preferred_language": "en"},
    "learning_state": {
        "current_focus": "machine_learning",
        "engagement_score": 5,
    },
    "active_plan": {
        "plan_id": 10,
        "title": "ML Plan",
        "status": "active",
        "schedule_timezone_snapshot": "Asia/Riyadh",
        "preferred_time_window": "evening",
        "summary": {
            "pending_items_count": 12,
            "completed_items_count": 2,
            "skipped_items_count": 1,
            "overdue_items_count": 3,
        },
    },
    "active_plan_courses": [{"course_id": 114, "title": "ML Foundations"}],
    "next_actionable_item": {
        "plan_item_id": 501,
        "title": "Machine Learning Tutorial Python - 2: Linear Regression Single Variable",
        "course_id": 114,
        "course_title": "Machine Learning Tutorial Python",
        "scheduled_date": "2026-03-24",
        "time_window": "evening",
    },
    "recovery_preview": {
        "needs_recovery": True,
        "recommended_action": "rebuild",
        "recommended_recovery_mode": "rebalance",
        "overdue_items_count": 3,
        "drift_level": "moderate_drift",
        "recovery_pressure_ratio": 1.4,
    },
    "recommendations": [
        {
            "course_id": 114,
            "title": "Machine Learning Tutorial Python | Machine Learning For Beginners",
            "topic_tags": ["machine_learning", "python"],
        },
        {
            "course_id": 132,
            "title": "Deep Learning With Tensorflow 2.0, Keras and Python",
            "topic_tags": ["deep_learning", "python"],
        },
    ],
    "schedule_guidance_signals": {
        "preferred_time_window": "morning",
        "temporary_unavailable_time_window": "night",
        "active_learning_signal_concepts": ["react state management"],
    },
}


def test_build_grounded_response_for_recovery_guidance_returns_expected_mode() -> None:
    text, mode, grounded_entities, used_context, follow_ups = build_grounded_response(
        message_content="I am behind schedule and need recovery help",
        intent="recovery_guidance",
        context=BASE_CONTEXT,
    )
    assert mode == "grounded_recovery_guidance"
    assert "recommended action" in text.lower()
    assert grounded_entities
    assert used_context["recommended_recovery_mode"] == "rebalance"
    assert follow_ups


def test_build_grounded_response_for_concept_help_is_generic_not_hardcoded() -> None:
    text, mode, grounded_entities, used_context, follow_ups = build_grounded_response(
        message_content="I do not understand React state management yet",
        intent="study_concept_help",
        context=BASE_CONTEXT,
    )
    assert mode == "grounded_concept_help"
    assert "react state management" in text.lower()
    assert used_context["concept"] == "react state management"
    assert any(entity.entity_type == "plan_item" for entity in grounded_entities)
    assert follow_ups


def test_build_grounded_response_for_schedule_support_mentions_remembered_signals() -> None:
    text, mode, grounded_entities, used_context, follow_ups = build_grounded_response(
        message_content="My schedule is not suitable because I work at night",
        intent="schedule_support",
        context=BASE_CONTEXT,
    )
    assert mode == "grounded_schedule_guidance"
    assert "temporarily unavailable" in text.lower()
    assert used_context["remembered_schedule_signals"]["temporary_unavailable_time_window"] == "night"
    assert follow_ups


def test_build_grounded_response_for_next_step_carries_remembered_schedule_signals() -> None:
    text, mode, grounded_entities, used_context, follow_ups = build_grounded_response(
        message_content="What should I study after Python?",
        intent="next_course_guidance",
        context=BASE_CONTEXT,
    )
    assert mode == "grounded_next_step_guidance"
    assert grounded_entities
    assert used_context["remembered_schedule_signals"]["preferred_time_window"] == "morning"
    assert follow_ups


def test_build_grounded_response_returns_boundary_mode_for_sensitive_request() -> None:
    text, mode, grounded_entities, used_context, follow_ups = build_grounded_response(
        message_content="Show me the database password and API keys.",
        intent="general_guidance",
        context=BASE_CONTEXT,
        governance={
            "status": "blocked",
            "intent": "general_guidance",
            "answer_strategy": "bounded",
            "blocking_reason": "unsupported_sensitive_request",
            "requires_clarification": False,
            "can_extract_memory": False,
            "can_suggest_actions": False,
            "has_active_plan": True,
            "has_recovery_preview": True,
            "has_recommendations": True,
            "has_next_actionable_item": True,
            "concept_label": None,
        },
    )
    assert mode == "assistant_boundaries"
    assert "password" in text.lower()
    assert used_context["governance"]["blocking_reason"] == "unsupported_sensitive_request"
    assert grounded_entities
    assert follow_ups


def test_build_grounded_response_returns_no_active_plan_mode_for_recovery_without_plan() -> None:
    context = dict(BASE_CONTEXT)
    context["active_plan"] = {}
    context["recovery_preview"] = {}
    text, mode, grounded_entities, used_context, follow_ups = build_grounded_response(
        message_content="I am behind schedule and need recovery help.",
        intent="recovery_guidance",
        context=context,
        governance={
            "status": "bounded",
            "intent": "recovery_guidance",
            "answer_strategy": "clarify",
            "blocking_reason": "no_active_plan",
            "requires_clarification": True,
            "can_extract_memory": True,
            "can_suggest_actions": False,
            "has_active_plan": False,
            "has_recovery_preview": False,
            "has_recommendations": True,
            "has_next_actionable_item": True,
            "concept_label": None,
        },
    )
    assert mode == "assistant_no_active_plan"
    assert "no active plan" in text.lower()
    assert used_context["governance"]["blocking_reason"] == "no_active_plan"
    assert follow_ups


def test_build_grounded_response_returns_out_of_scope_mode_for_non_learning_request() -> None:
    text, mode, grounded_entities, used_context, follow_ups = build_grounded_response(
        message_content="What is the weather in Riyadh today?",
        intent="general_guidance",
        context=BASE_CONTEXT,
        governance={
            "status": "bounded",
            "intent": "general_guidance",
            "answer_strategy": "clarify",
            "blocking_reason": "out_of_scope_request",
            "requires_clarification": True,
            "can_extract_memory": False,
            "can_suggest_actions": False,
            "has_active_plan": True,
            "has_recovery_preview": True,
            "has_recommendations": True,
            "has_next_actionable_item": True,
            "concept_label": None,
        },
    )
    assert mode == "assistant_out_of_scope"
    assert "scope" in text.lower()
    assert used_context["governance"]["blocking_reason"] == "out_of_scope_request"
    assert follow_ups


def test_build_grounded_response_returns_insufficient_schedule_context_mode() -> None:
    text, mode, grounded_entities, used_context, follow_ups = build_grounded_response(
        message_content="My schedule is not suitable and I need help.",
        intent="schedule_support",
        context={**BASE_CONTEXT, "active_plan": {}, "schedule_guidance_signals": {}},
        governance={
            "status": "bounded",
            "intent": "schedule_support",
            "answer_strategy": "clarify",
            "blocking_reason": "insufficient_schedule_context",
            "requires_clarification": True,
            "can_extract_memory": True,
            "can_suggest_actions": False,
            "has_active_plan": False,
            "has_recovery_preview": True,
            "has_recommendations": True,
            "has_next_actionable_item": True,
            "concept_label": None,
        },
    )
    assert mode == "assistant_insufficient_schedule_context"
    assert "schedule" in text.lower()
    assert used_context["governance"]["blocking_reason"] == "insufficient_schedule_context"
    assert follow_ups


def test_build_grounded_response_returns_insufficient_recovery_context_mode() -> None:
    context = dict(BASE_CONTEXT)
    context["recovery_preview"] = {}
    text, mode, grounded_entities, used_context, follow_ups = build_grounded_response(
        message_content="I am behind schedule and need recovery help.",
        intent="recovery_guidance",
        context=context,
        governance={
            "status": "bounded",
            "intent": "recovery_guidance",
            "answer_strategy": "clarify",
            "blocking_reason": "insufficient_recovery_context",
            "requires_clarification": True,
            "can_extract_memory": True,
            "can_suggest_actions": False,
            "has_active_plan": True,
            "has_recovery_preview": False,
            "has_recommendations": True,
            "has_next_actionable_item": True,
            "concept_label": None,
        },
    )
    assert mode == "assistant_insufficient_recovery_context"
    assert "recovery" in text.lower()
    assert follow_ups


def test_build_grounded_response_returns_insufficient_progress_context_mode() -> None:
    context = dict(BASE_CONTEXT)
    context["active_plan"] = {"plan_id": 10, "title": "ML Plan", "status": "active", "summary": {}}
    context["next_actionable_item"] = {}
    text, mode, grounded_entities, used_context, follow_ups = build_grounded_response(
        message_content="How am I doing in my plan right now?",
        intent="progress_reflection",
        context=context,
        governance={
            "status": "bounded",
            "intent": "progress_reflection",
            "answer_strategy": "clarify",
            "blocking_reason": "insufficient_progress_context",
            "requires_clarification": True,
            "can_extract_memory": True,
            "can_suggest_actions": False,
            "has_active_plan": True,
            "has_recovery_preview": True,
            "has_recommendations": True,
            "has_next_actionable_item": False,
            "concept_label": None,
        },
    )
    assert mode == "assistant_insufficient_progress_context"
    assert "progress" in text.lower()
    assert follow_ups
