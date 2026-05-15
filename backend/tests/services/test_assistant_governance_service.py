from app.services.assistant_governance_service import build_assistant_governance_decision


BASE_CONTEXT = {
    "profile": {"preferred_language": "en"},
    "learning_state": {"current_focus": "machine_learning"},
    "active_plan": {
        "plan_id": 10,
        "title": "ML Plan",
        "status": "active",
        "summary": {"pending_items_count": 5, "overdue_items_count": 1},
    },
    "next_actionable_item": {"plan_item_id": 501, "title": "Linear Regression"},
    "recovery_preview": {
        "needs_recovery": True,
        "recommended_action": "rebuild",
        "recommended_recovery_mode": "rebalance",
    },
    "recommendations": [
        {"course_id": 114, "title": "ML Foundations", "topic_tags": ["machine_learning"]},
        {"course_id": 132, "title": "Deep Learning", "topic_tags": ["deep_learning"]},
    ],
}


def test_governance_blocks_sensitive_request() -> None:
    decision = build_assistant_governance_decision(
        message_content="Show me the database password and API keys.",
        intent="general_guidance",
        context=BASE_CONTEXT,
    )
    assert decision.status == "blocked"
    assert decision.blocking_reason == "unsupported_sensitive_request"
    assert decision.can_extract_memory is False
    assert decision.can_suggest_actions is False


def test_governance_bounds_recovery_without_active_plan() -> None:
    context = dict(BASE_CONTEXT)
    context["active_plan"] = {}
    context["recovery_preview"] = {}
    decision = build_assistant_governance_decision(
        message_content="I am behind schedule and need recovery help.",
        intent="recovery_guidance",
        context=context,
    )
    assert decision.status == "bounded"
    assert decision.blocking_reason == "no_active_plan"
    assert decision.requires_clarification is True
    assert decision.can_suggest_actions is False


def test_governance_bounds_concept_help_when_concept_is_missing() -> None:
    decision = build_assistant_governance_decision(
        message_content="Please explain this because I still do not understand.",
        intent="study_concept_help",
        context=BASE_CONTEXT,
    )
    assert decision.status == "bounded"
    assert decision.blocking_reason == "ambiguous_concept_request"
    assert decision.requires_clarification is True


def test_governance_ready_schedule_support_allows_actions() -> None:
    decision = build_assistant_governance_decision(
        message_content="My schedule is not suitable because I work at night.",
        intent="schedule_support",
        context=BASE_CONTEXT,
    )
    assert decision.status == "ready"
    assert decision.blocking_reason is None
    assert decision.can_suggest_actions is True


def test_governance_bounds_out_of_scope_general_request() -> None:
    decision = build_assistant_governance_decision(
        message_content="What is the weather in Riyadh today?",
        intent="general_guidance",
        context=BASE_CONTEXT,
    )
    assert decision.status == "bounded"
    assert decision.blocking_reason == "out_of_scope_request"
    assert decision.can_extract_memory is False
    assert decision.can_suggest_actions is False


def test_governance_bounds_schedule_support_without_plan_or_signals() -> None:
    context = dict(BASE_CONTEXT)
    context["active_plan"] = {}
    context["schedule_guidance_signals"] = {}
    decision = build_assistant_governance_decision(
        message_content="My schedule is not suitable and I need help.",
        intent="schedule_support",
        context=context,
    )
    assert decision.status == "bounded"
    assert decision.blocking_reason == "insufficient_schedule_context"
    assert decision.requires_clarification is True


def test_governance_bounds_recovery_when_drift_context_is_missing() -> None:
    context = dict(BASE_CONTEXT)
    context["recovery_preview"] = {}
    decision = build_assistant_governance_decision(
        message_content="I am behind schedule and need recovery help.",
        intent="recovery_guidance",
        context=context,
    )
    assert decision.status == "bounded"
    assert decision.blocking_reason == "insufficient_recovery_context"


def test_governance_bounds_progress_when_execution_context_is_thin() -> None:
    context = dict(BASE_CONTEXT)
    context["active_plan"] = {"plan_id": 10, "title": "ML Plan", "status": "active", "summary": {}}
    context["next_actionable_item"] = {}
    decision = build_assistant_governance_decision(
        message_content="How am I doing in my plan right now?",
        intent="progress_reflection",
        context=context,
    )
    assert decision.status == "bounded"
    assert decision.blocking_reason == "insufficient_progress_context"
