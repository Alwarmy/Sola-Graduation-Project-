from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundException, ValidationException
from app.models.assistant_action_run import AssistantActionRun
from app.models.assistant_conversation import AssistantConversation
from app.models.assistant_message import AssistantMessage
from app.schemas.assistant import (
    ASSISTANT_CONTRACT_VERSION,
    AssistantActionRunResponse,
    AssistantConversationContractSummary,
    AssistantConversationDetailResponse,
    AssistantConversationLifecycleSummary,
    AssistantConversationResponse,
    AssistantGovernanceResponse,
    AssistantMemorySignalResponse,
    AssistantMessageArtifactSummary,
    AssistantMessageExchangeResponse,
    AssistantMessageResponse,
    AssistantSuggestedAction,
)
from app.services.assistant_action_policy_service import build_eligible_assistant_actions
from app.services.assistant_action_service import (
    create_action_run,
    get_action_display_metadata,
    list_action_runs,
)
from app.services.assistant_context_service import build_assistant_safe_context
from app.services.assistant_governance_service import build_assistant_governance_decision
from app.services.assistant_intent_service import detect_assistant_intent
from app.services.assistant_memory_service import (
    confirm_memory_signal,
    extract_memory_candidates_from_message,
    list_memory_signals,
)
from app.services.assistant_response_service import build_grounded_response
from app.services.user_event_service import create_system_user_event

DEFAULT_CONVERSATION_TITLE = "New SOLA assistant conversation"


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _make_json_safe(value: Any) -> Any:
    if value is None:
        return None

    if isinstance(value, (str, int, float, bool)):
        return value

    if isinstance(value, Decimal):
        return float(value)

    if isinstance(value, (datetime, date)):
        return value.isoformat()

    if isinstance(value, dict):
        return {str(key): _make_json_safe(item) for key, item in value.items()}

    if isinstance(value, (list, tuple, set)):
        return [_make_json_safe(item) for item in value]

    if hasattr(value, "model_dump"):
        return _make_json_safe(value.model_dump())

    return str(value)


def _generate_conversation_title(raw_title: str | None) -> str:
    cleaned = (raw_title or "").strip()
    if not cleaned:
        return DEFAULT_CONVERSATION_TITLE
    return cleaned[:120]


def _serialize_conversation(conversation: AssistantConversation) -> AssistantConversationResponse:
    return AssistantConversationResponse.model_validate(conversation)


def _build_governance_response(governance_payload: Any) -> AssistantGovernanceResponse | None:
    if not isinstance(governance_payload, dict) or not governance_payload:
        return None
    return AssistantGovernanceResponse(**_make_json_safe(governance_payload))


def _build_artifact_summary(message_metadata: dict[str, Any] | None) -> AssistantMessageArtifactSummary:
    metadata = dict(message_metadata or {})
    return AssistantMessageArtifactSummary(
        grounded_entity_count=int(metadata.get("grounded_entity_count") or 0),
        suggested_action_count=int(metadata.get("suggested_action_count") or 0),
        memory_candidate_count=int(metadata.get("memory_candidate_count") or 0),
        follow_up_question_count=int(metadata.get("follow_up_question_count") or 0),
    )



def _serialize_message(
    message: AssistantMessage,
    *,
    sequence_number: int | None = None,
    latest_message_id: int | None = None,
) -> AssistantMessageResponse:
    metadata = dict(message.message_metadata or {})
    artifact_summary = _build_artifact_summary(metadata)
    response_mode = metadata.get("response_mode")
    governance = _build_governance_response(metadata.get("governance"))
    has_structured_artifacts = bool(
        response_mode
        or governance
        or artifact_summary.grounded_entity_count
        or artifact_summary.suggested_action_count
        or artifact_summary.memory_candidate_count
        or artifact_summary.follow_up_question_count
    )

    return AssistantMessageResponse(
        id=message.id,
        conversation_id=message.conversation_id,
        user_id=message.user_id,
        role=message.role,
        content=message.content,
        message_intent=message.message_intent,
        message_metadata=_make_json_safe(metadata),
        context_snapshot=_make_json_safe(dict(message.context_snapshot or {})),
        created_at=message.created_at,
        response_mode=response_mode,
        governance=governance,
        artifact_summary=artifact_summary,
        sequence_number=sequence_number,
        is_latest_in_conversation=latest_message_id is not None and message.id == latest_message_id,
        has_structured_artifacts=has_structured_artifacts,
    )



def _build_conversation_contract_summary(conversation_metadata: dict[str, Any] | None) -> AssistantConversationContractSummary:
    metadata = dict(conversation_metadata or {})
    artifact_payload = metadata.get("latest_artifact_summary")
    if isinstance(artifact_payload, dict):
        latest_artifact_summary = AssistantMessageArtifactSummary(**_make_json_safe(artifact_payload))
    else:
        latest_artifact_summary = AssistantMessageArtifactSummary()

    return AssistantConversationContractSummary(
        contract_version=str(metadata.get("contract_version") or ASSISTANT_CONTRACT_VERSION),
        last_detected_intent=metadata.get("last_detected_intent"),
        latest_response_mode=metadata.get("latest_response_mode"),
        latest_governance=_build_governance_response(metadata.get("latest_governance")),
        latest_artifact_summary=latest_artifact_summary,
    )



def _build_conversation_lifecycle_summary(
    *,
    messages: list[AssistantMessage],
    recent_action_runs: list[AssistantActionRun],
    effective_memory_signals: list[Any],
) -> AssistantConversationLifecycleSummary:
    latest_message = messages[-1] if messages else None
    user_messages = [message for message in messages if message.role == "user"]
    assistant_messages = [message for message in messages if message.role == "assistant"]
    artifact_message_ids = [
        message.id
        for message in messages
        if _serialize_message(message).has_structured_artifacts
    ]

    latest_action_run_id = recent_action_runs[0].id if recent_action_runs else None
    latest_memory_signal_id = effective_memory_signals[0].id if effective_memory_signals else None

    return AssistantConversationLifecycleSummary(
        total_user_messages=len(user_messages),
        total_assistant_messages=len(assistant_messages),
        latest_message_id=latest_message.id if latest_message else None,
        latest_user_message_id=user_messages[-1].id if user_messages else None,
        latest_assistant_message_id=assistant_messages[-1].id if assistant_messages else None,
        latest_action_run_id=latest_action_run_id,
        latest_memory_signal_id=latest_memory_signal_id,
        artifact_message_ids=artifact_message_ids,
    )


def _list_conversation_action_runs(db: Session, *, user_id: int, conversation_id: int) -> list[AssistantActionRun]:
    return (
        db.query(AssistantActionRun)
        .filter(AssistantActionRun.user_id == user_id)
        .filter(AssistantActionRun.conversation_id == conversation_id)
        .order_by(AssistantActionRun.updated_at.desc(), AssistantActionRun.id.desc())
        .limit(10)
        .all()
    )



def _build_conversation_detail_response(
    *,
    conversation: AssistantConversation,
    message_count: int,
    active_memory_signal_count: int,
    pending_action_count: int,
    messages: list[AssistantMessage],
    recent_action_runs: list[AssistantActionRun],
    effective_memory_signals: list[Any],
) -> AssistantConversationDetailResponse:
    latest_message_id = messages[-1].id if messages else None
    serialized_messages = [
        _serialize_message(message, sequence_number=index, latest_message_id=latest_message_id)
        for index, message in enumerate(messages, start=1)
    ]

    return AssistantConversationDetailResponse(
        **_serialize_conversation(conversation).model_dump(),
        contract_version=ASSISTANT_CONTRACT_VERSION,
        message_count=message_count,
        active_memory_signal_count=active_memory_signal_count,
        pending_action_count=pending_action_count,
        messages=serialized_messages,
        recent_action_runs=[AssistantActionRunResponse.model_validate(action_run) for action_run in recent_action_runs],
        effective_memory_signals=[
            AssistantMemorySignalResponse.model_validate(signal) for signal in effective_memory_signals
        ],
        contract_summary=_build_conversation_contract_summary(dict(conversation.conversation_metadata or {})),
        lifecycle_summary=_build_conversation_lifecycle_summary(
            messages=messages,
            recent_action_runs=recent_action_runs,
            effective_memory_signals=effective_memory_signals,
        ),
    )



def create_conversation(db: Session, user_id: int, title: str | None = None) -> AssistantConversation:
    conversation = AssistantConversation(
        user_id=user_id,
        title=_generate_conversation_title(title),
        status="active",
        conversation_metadata={"contract_version": ASSISTANT_CONTRACT_VERSION},
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation



def list_conversations(db: Session, user_id: int) -> list[AssistantConversation]:
    return (
        db.query(AssistantConversation)
        .filter(AssistantConversation.user_id == user_id)
        .order_by(AssistantConversation.updated_at.desc(), AssistantConversation.id.desc())
        .all()
    )



def get_conversation(db: Session, user_id: int, conversation_id: int) -> AssistantConversation:
    conversation = (
        db.query(AssistantConversation)
        .filter(AssistantConversation.user_id == user_id)
        .filter(AssistantConversation.id == conversation_id)
        .first()
    )
    if not conversation:
        raise NotFoundException("Assistant conversation not found.")
    return conversation



def get_conversation_detail(db: Session, user_id: int, conversation_id: int) -> AssistantConversationDetailResponse:
    conversation = get_conversation(db=db, user_id=user_id, conversation_id=conversation_id)
    messages = list_conversation_message_models(db=db, user_id=user_id, conversation_id=conversation_id)
    message_count = len(messages)
    effective_memory_signals = list_memory_signals(db=db, user_id=user_id, effective_only=True)[:10]
    active_memory_signal_count = len(effective_memory_signals)
    recent_action_runs = _list_conversation_action_runs(db=db, user_id=user_id, conversation_id=conversation.id)
    pending_action_count = len([action for action in recent_action_runs if action.status == "proposed"])

    return _build_conversation_detail_response(
        conversation=conversation,
        message_count=message_count,
        active_memory_signal_count=active_memory_signal_count,
        pending_action_count=pending_action_count,
        messages=messages,
        recent_action_runs=recent_action_runs,
        effective_memory_signals=effective_memory_signals,
    )



def list_conversation_message_models(db: Session, user_id: int, conversation_id: int) -> list[AssistantMessage]:
    conversation = get_conversation(db=db, user_id=user_id, conversation_id=conversation_id)
    return (
        db.query(AssistantMessage)
        .filter(AssistantMessage.conversation_id == conversation.id)
        .order_by(AssistantMessage.id.asc())
        .all()
    )



def list_conversation_messages(db: Session, user_id: int, conversation_id: int) -> list[AssistantMessageResponse]:
    messages = list_conversation_message_models(db=db, user_id=user_id, conversation_id=conversation_id)
    latest_message_id = messages[-1].id if messages else None
    return [
        _serialize_message(message, sequence_number=index, latest_message_id=latest_message_id)
        for index, message in enumerate(messages, start=1)
    ]



def _maybe_update_default_title(conversation: AssistantConversation, content: str) -> None:
    if conversation.title == DEFAULT_CONVERSATION_TITLE:
        conversation.title = content.strip()[:120] or DEFAULT_CONVERSATION_TITLE



def _update_conversation_lifecycle_metadata(
    conversation: AssistantConversation,
    *,
    latest_message_id: int | None = None,
    latest_user_message_id: int | None = None,
    latest_assistant_message_id: int | None = None,
    latest_action_run_id: int | None = None,
    latest_action_type: str | None = None,
    latest_action_status: str | None = None,
    latest_memory_signal_id: int | None = None,
    latest_memory_signal_key: str | None = None,
) -> None:
    metadata = dict(conversation.conversation_metadata or {})
    metadata["contract_version"] = ASSISTANT_CONTRACT_VERSION

    if latest_message_id is not None:
        metadata["latest_message_id"] = latest_message_id
    if latest_user_message_id is not None:
        metadata["latest_user_message_id"] = latest_user_message_id
    if latest_assistant_message_id is not None:
        metadata["latest_assistant_message_id"] = latest_assistant_message_id
    if latest_action_run_id is not None:
        metadata["latest_action_run_id"] = latest_action_run_id
    if latest_action_type is not None:
        metadata["latest_action_type"] = latest_action_type
    if latest_action_status is not None:
        metadata["latest_action_status"] = latest_action_status
    if latest_memory_signal_id is not None:
        metadata["latest_memory_signal_id"] = latest_memory_signal_id
    if latest_memory_signal_key is not None:
        metadata["latest_memory_signal_key"] = latest_memory_signal_key

    conversation.conversation_metadata = _make_json_safe(metadata)


def _build_suggested_actions_for_intent(
    db: Session,
    *,
    user_id: int,
    conversation_id: int,
    source_message_id: int,
    intent: str,
    context_dict: dict,
    governance_dict: dict,
) -> list[AssistantSuggestedAction]:
    suggested_actions: list[AssistantSuggestedAction] = []

    for candidate in build_eligible_assistant_actions(
        intent=intent,
        context=context_dict,
        governance=governance_dict,
    ):
        action_run = create_action_run(
            db=db,
            user_id=user_id,
            conversation_id=conversation_id,
            source_message_id=source_message_id,
            action_type=candidate.action_type,
            request_payload=_make_json_safe(candidate.request_payload),
            preview_payload=_make_json_safe(candidate.preview_payload),
        )
        display = get_action_display_metadata(candidate.action_type)
        suggested_actions.append(
            AssistantSuggestedAction(
                action_run_id=action_run.id,
                action_type=action_run.action_type,
                title=display["title"],
                summary=display["summary"],
                preview_payload=_make_json_safe(dict(action_run.preview_payload or {})),
            )
        )

    return suggested_actions



def send_message(
    db: Session,
    *,
    user_id: int,
    conversation_id: int,
    content: str,
) -> AssistantMessageExchangeResponse:
    conversation = get_conversation(db=db, user_id=user_id, conversation_id=conversation_id)

    clean_content = content.strip()
    if not clean_content:
        raise ValidationException("Assistant message content cannot be empty.")

    _maybe_update_default_title(conversation=conversation, content=clean_content)

    context = build_assistant_safe_context(db=db, user_id=user_id)
    context_dict = _make_json_safe(context.to_dict())
    intent = detect_assistant_intent(clean_content)
    governance_decision = build_assistant_governance_decision(
        message_content=clean_content,
        intent=intent,
        context=context_dict,
    )
    governance_dict = _make_json_safe(governance_decision.to_dict())

    user_message = AssistantMessage(
        conversation_id=conversation.id,
        user_id=user_id,
        role="user",
        content=clean_content,
        message_intent=intent,
        message_metadata=_make_json_safe({"detected_intent": intent, "governance": governance_dict}),
        context_snapshot=context_dict,
    )
    db.add(user_message)
    db.flush()

    conversation.last_user_message_at = _now_utc()
    _update_conversation_lifecycle_metadata(
        conversation,
        latest_user_message_id=user_message.id,
    )
    conversation.conversation_metadata = _make_json_safe(
        {
            **dict(conversation.conversation_metadata or {}),
            "contract_version": ASSISTANT_CONTRACT_VERSION,
            "last_detected_intent": intent,
        }
    )

    if governance_decision.can_extract_memory:
        memory_candidates = extract_memory_candidates_from_message(
            db=db,
            user_id=user_id,
            conversation_id=conversation.id,
            source_message_id=user_message.id,
            message_content=clean_content,
        )
    else:
        memory_candidates = []

    if governance_decision.can_suggest_actions:
        suggested_actions = _build_suggested_actions_for_intent(
            db=db,
            user_id=user_id,
            conversation_id=conversation.id,
            source_message_id=user_message.id,
            intent=intent,
            context_dict=context_dict,
            governance_dict=governance_dict,
        )
    else:
        suggested_actions = []

    response_text, response_mode, grounded_entities, used_context_summary, follow_up_questions = build_grounded_response(
        message_content=clean_content,
        intent=intent,
        context=context_dict,
        governance=governance_dict,
    )

    artifact_summary = AssistantMessageArtifactSummary(
        grounded_entity_count=len(grounded_entities),
        suggested_action_count=len(suggested_actions),
        memory_candidate_count=len(memory_candidates),
        follow_up_question_count=len(follow_up_questions),
    )

    assistant_message = AssistantMessage(
        conversation_id=conversation.id,
        user_id=user_id,
        role="assistant",
        content=response_text,
        message_intent=intent,
        message_metadata=_make_json_safe(
            {
                "response_mode": response_mode,
                "grounded_entity_count": artifact_summary.grounded_entity_count,
                "suggested_action_count": artifact_summary.suggested_action_count,
                "memory_candidate_count": artifact_summary.memory_candidate_count,
                "follow_up_question_count": artifact_summary.follow_up_question_count,
                "governance": governance_dict,
            }
        ),
        context_snapshot=context_dict,
    )
    db.add(assistant_message)
    db.flush()

    conversation.last_assistant_message_at = _now_utc()
    _update_conversation_lifecycle_metadata(
        conversation,
        latest_message_id=assistant_message.id,
        latest_assistant_message_id=assistant_message.id,
    )
    conversation.conversation_metadata = _make_json_safe(
        {
            **dict(conversation.conversation_metadata or {}),
            "contract_version": ASSISTANT_CONTRACT_VERSION,
            "latest_response_mode": response_mode,
            "latest_governance": governance_dict,
            "latest_artifact_summary": artifact_summary.model_dump(),
        }
    )

    create_system_user_event(
        db=db,
        user_id=user_id,
        event_type="chat_message_sent",
        event_payload={
            "conversation_id": conversation.id,
            "message_intent": intent,
        },
        commit=False,
        refresh_learning_state_after=False,
    )

    db.commit()
    db.refresh(conversation)
    db.refresh(user_message)
    db.refresh(assistant_message)

    refreshed_memory_candidates = [
        confirmable
        for confirmable in list_memory_signals(db=db, user_id=user_id)
        if confirmable.id in {signal.id for signal in memory_candidates}
    ]
    action_lookup = {action.action_run_id: action for action in suggested_actions}
    refreshed_actions = [
        AssistantSuggestedAction(
            action_run_id=action.id,
            action_type=action.action_type,
            title=action_lookup[action.id].title,
            summary=action_lookup[action.id].summary,
            preview_payload=_make_json_safe(dict(action.preview_payload or {})),
        )
        for action in list_action_runs(db=db, user_id=user_id)
        if action.id in action_lookup
    ]

    normalized_grounded_entities = [
        AssistantSuggestedAction.model_validate  # type: ignore[attr-defined]
        if False
        else entity
        for entity in grounded_entities
    ]

    conversation_messages = list_conversation_message_models(
        db=db,
        user_id=user_id,
        conversation_id=conversation.id,
    )
    latest_message_id = conversation_messages[-1].id if conversation_messages else None
    message_lookup = {
        message.id: _serialize_message(message, sequence_number=index, latest_message_id=latest_message_id)
        for index, message in enumerate(conversation_messages, start=1)
    }

    return AssistantMessageExchangeResponse(
        contract_version=ASSISTANT_CONTRACT_VERSION,
        conversation=_serialize_conversation(conversation),
        user_message=message_lookup[user_message.id],
        assistant_message=message_lookup[assistant_message.id],
        response_mode=response_mode,
        grounded_entities=normalized_grounded_entities,
        used_context_summary=_make_json_safe(used_context_summary),
        suggested_actions=refreshed_actions,
        memory_candidates=[signal for signal in refreshed_memory_candidates],
        follow_up_questions=_make_json_safe(follow_up_questions),
        governance=AssistantGovernanceResponse(**governance_dict),
    )



def confirm_assistant_memory_signal(db: Session, user_id: int, signal_id: int):
    signal = confirm_memory_signal(db=db, user_id=user_id, signal_id=signal_id)

    if signal.conversation_id is not None:
        conversation = get_conversation(db=db, user_id=user_id, conversation_id=signal.conversation_id)
        _update_conversation_lifecycle_metadata(
            conversation,
            latest_memory_signal_id=signal.id,
            latest_memory_signal_key=signal.signal_key,
        )
        db.commit()

    db.refresh(signal)
    return signal



def confirm_assistant_action_run(db: Session, user_id: int, action_run_id: int):
    from app.services.assistant_action_service import confirm_action_run

    action_run = confirm_action_run(db=db, user_id=user_id, action_run_id=action_run_id)

    conversation = get_conversation(db=db, user_id=user_id, conversation_id=action_run.conversation_id)
    _update_conversation_lifecycle_metadata(
        conversation,
        latest_action_run_id=action_run.id,
        latest_action_type=action_run.action_type,
        latest_action_status=action_run.status,
    )
    db.commit()
    db.refresh(action_run)
    return action_run
