from datetime import datetime, timezone

from app.services.assistant_service import (
    _build_conversation_contract_summary,
    _build_conversation_detail_response,
    _build_conversation_lifecycle_summary,
    _serialize_message,
)


class DummyConversation:
    def __init__(self) -> None:
        now = datetime.now(timezone.utc)
        self.id = 7
        self.user_id = 99
        self.title = "Assistant contract test"
        self.status = "active"
        self.conversation_metadata = {
            "contract_version": "assistant_v1",
            "last_detected_intent": "schedule_support",
            "latest_response_mode": "grounded_schedule_guidance",
            "latest_governance": {
                "status": "ready",
                "intent": "schedule_support",
                "answer_strategy": "answer",
                "blocking_reason": None,
                "requires_clarification": False,
                "can_extract_memory": True,
                "can_suggest_actions": True,
                "has_active_plan": True,
                "has_recovery_preview": False,
                "has_recommendations": True,
                "has_next_actionable_item": True,
                "concept_label": None,
            },
            "latest_artifact_summary": {
                "grounded_entity_count": 2,
                "suggested_action_count": 1,
                "memory_candidate_count": 0,
                "follow_up_question_count": 2,
            },
            "latest_message_id": 14,
            "latest_user_message_id": 12,
            "latest_assistant_message_id": 14,
            "latest_action_run_id": 3,
            "latest_memory_signal_id": 4,
        }
        self.last_user_message_at = now
        self.last_assistant_message_at = now
        self.created_at = now
        self.updated_at = now


class DummyMessage:
    def __init__(self, *, message_id: int = 13, role: str = "assistant", structured: bool = True) -> None:
        self.id = message_id
        self.conversation_id = 7
        self.user_id = 99
        self.role = role
        self.content = "Here is a grounded schedule answer." if structured else "Plain acknowledgement."
        self.message_intent = "schedule_support" if structured else "general_guidance"
        self.message_metadata = (
            {
                "response_mode": "grounded_schedule_guidance",
                "grounded_entity_count": 2,
                "suggested_action_count": 1,
                "memory_candidate_count": 0,
                "follow_up_question_count": 2,
                "governance": {
                    "status": "ready",
                    "intent": "schedule_support",
                    "answer_strategy": "answer",
                    "blocking_reason": None,
                    "requires_clarification": False,
                    "can_extract_memory": True,
                    "can_suggest_actions": True,
                    "has_active_plan": True,
                    "has_recovery_preview": False,
                    "has_recommendations": True,
                    "has_next_actionable_item": True,
                    "concept_label": None,
                },
            }
            if structured
            else {"detected_intent": "general_guidance"}
        )
        self.context_snapshot = {"active_plan": {"plan_id": 18}}
        self.created_at = datetime.now(timezone.utc)


class DummyActionRun:
    def __init__(self) -> None:
        now = datetime.now(timezone.utc)
        self.id = 3
        self.user_id = 99
        self.conversation_id = 7
        self.source_message_id = 13
        self.action_type = "pause_active_plan"
        self.status = "proposed"
        self.request_payload = {"plan_id": 18}
        self.preview_payload = {"plan_id": 18, "status_before": "active"}
        self.result_payload = {}
        self.failure_reason = None
        self.created_at = now
        self.updated_at = now


class DummyMemorySignal:
    def __init__(self) -> None:
        now = datetime.now(timezone.utc)
        self.id = 4
        self.user_id = 99
        self.conversation_id = 7
        self.source_message_id = 11
        self.signal_type = "schedule_preference"
        self.signal_key = "preferred_time_window"
        self.signal_summary = "Prefers evening study sessions."
        self.signal_value = {"time_window": "evening"}
        self.signal_metadata = {}
        self.scope = "durable_preference"
        self.confidence_score = 0.92
        self.status = "active"
        self.effective_from = now
        self.expires_at = None
        self.created_at = now
        self.updated_at = now



def test_serialize_message_projects_contract_fields_from_metadata() -> None:
    response = _serialize_message(DummyMessage(), sequence_number=2, latest_message_id=13)

    assert response.response_mode == "grounded_schedule_guidance"
    assert response.governance is not None
    assert response.governance.intent == "schedule_support"
    assert response.artifact_summary.grounded_entity_count == 2
    assert response.artifact_summary.suggested_action_count == 1
    assert response.artifact_summary.follow_up_question_count == 2
    assert response.sequence_number == 2
    assert response.is_latest_in_conversation is True
    assert response.has_structured_artifacts is True



def test_serialize_message_marks_plain_messages_without_structured_artifacts() -> None:
    response = _serialize_message(DummyMessage(message_id=12, role="user", structured=False), sequence_number=1, latest_message_id=13)

    assert response.sequence_number == 1
    assert response.is_latest_in_conversation is False
    assert response.has_structured_artifacts is False
    assert response.response_mode is None
    assert response.governance is None



def test_build_conversation_contract_summary_reads_latest_exchange_metadata() -> None:
    summary = _build_conversation_contract_summary(DummyConversation().conversation_metadata)

    assert summary.contract_version == "assistant_v1"
    assert summary.last_detected_intent == "schedule_support"
    assert summary.latest_response_mode == "grounded_schedule_guidance"
    assert summary.latest_governance is not None
    assert summary.latest_governance.status == "ready"
    assert summary.latest_artifact_summary.suggested_action_count == 1



def test_build_conversation_lifecycle_summary_counts_messages_and_artifacts() -> None:
    summary = _build_conversation_lifecycle_summary(
        messages=[
            DummyMessage(message_id=11, role="user", structured=False),
            DummyMessage(message_id=12, role="assistant", structured=True),
            DummyMessage(message_id=13, role="user", structured=False),
            DummyMessage(message_id=14, role="assistant", structured=True),
        ],
        recent_action_runs=[DummyActionRun()],
        effective_memory_signals=[DummyMemorySignal()],
    )

    assert summary.total_user_messages == 2
    assert summary.total_assistant_messages == 2
    assert summary.latest_message_id == 14
    assert summary.latest_user_message_id == 13
    assert summary.latest_assistant_message_id == 14
    assert summary.latest_action_run_id == 3
    assert summary.latest_memory_signal_id == 4
    assert summary.artifact_message_ids == [12, 14]



def test_build_conversation_detail_response_includes_messages_actions_effective_signals_and_lifecycle() -> None:
    detail = _build_conversation_detail_response(
        conversation=DummyConversation(),
        message_count=2,
        active_memory_signal_count=1,
        pending_action_count=1,
        messages=[DummyMessage(message_id=12, role="user", structured=False), DummyMessage(message_id=13)],
        recent_action_runs=[DummyActionRun()],
        effective_memory_signals=[DummyMemorySignal()],
    )

    assert detail.contract_version == "assistant_v1"
    assert detail.messages[0].sequence_number == 1
    assert detail.messages[1].sequence_number == 2
    assert detail.messages[1].is_latest_in_conversation is True
    assert detail.messages[1].response_mode == "grounded_schedule_guidance"
    assert detail.recent_action_runs[0].action_type == "pause_active_plan"
    assert detail.effective_memory_signals[0].signal_key == "preferred_time_window"
    assert detail.contract_summary.latest_response_mode == "grounded_schedule_guidance"
    assert detail.lifecycle_summary.latest_message_id == 13
    assert detail.lifecycle_summary.artifact_message_ids == [13]
