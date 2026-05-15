from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.core.domain_values import (
    ASSISTANT_ACTION_STATUS_VALUES,
    ASSISTANT_ACTION_TYPE_VALUES,
    ASSISTANT_CONVERSATION_STATUS_VALUES,
    ASSISTANT_MEMORY_SCOPE_VALUES,
    ASSISTANT_MEMORY_STATUS_VALUES,
)
ASSISTANT_CONVERSATION_STATUS_OPTIONS = set(ASSISTANT_CONVERSATION_STATUS_VALUES)
ASSISTANT_MESSAGE_ROLE_OPTIONS = {"user", "assistant", "system"}
ASSISTANT_MEMORY_SCOPE_OPTIONS = set(ASSISTANT_MEMORY_SCOPE_VALUES)
ASSISTANT_MEMORY_STATUS_OPTIONS = set(ASSISTANT_MEMORY_STATUS_VALUES)
ASSISTANT_ACTION_STATUS_OPTIONS = set(ASSISTANT_ACTION_STATUS_VALUES)
ASSISTANT_ACTION_TYPE_OPTIONS = set(ASSISTANT_ACTION_TYPE_VALUES)
ASSISTANT_GOVERNANCE_STATUS_OPTIONS = {"ready", "bounded", "blocked"}
ASSISTANT_CONTRACT_VERSION = "assistant_v1"


class AssistantConversationCreateRequest(BaseModel):
    title: str | None = None


class AssistantMessageCreateRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)


class AssistantGroundedEntity(BaseModel):
    entity_type: str
    entity_id: int | None = None
    label: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class AssistantConversationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    title: str
    status: str
    conversation_metadata: dict[str, Any]
    last_user_message_at: datetime | None
    last_assistant_message_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AssistantMessageArtifactSummary(BaseModel):
    grounded_entity_count: int = 0
    suggested_action_count: int = 0
    memory_candidate_count: int = 0
    follow_up_question_count: int = 0


class AssistantGovernanceResponse(BaseModel):
    status: str
    intent: str
    answer_strategy: str
    blocking_reason: str | None = None
    requires_clarification: bool = False
    can_extract_memory: bool = True
    can_suggest_actions: bool = False
    has_active_plan: bool = False
    has_recovery_preview: bool = False
    has_recommendations: bool = False
    has_next_actionable_item: bool = False
    concept_label: str | None = None


class AssistantMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    conversation_id: int
    user_id: int
    role: str
    content: str
    message_intent: str | None
    message_metadata: dict[str, Any]
    context_snapshot: dict[str, Any]
    created_at: datetime
    response_mode: str | None = None
    governance: AssistantGovernanceResponse | None = None
    artifact_summary: AssistantMessageArtifactSummary = Field(default_factory=AssistantMessageArtifactSummary)
    sequence_number: int | None = None
    is_latest_in_conversation: bool = False
    has_structured_artifacts: bool = False


class AssistantMemorySignalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    conversation_id: int | None
    source_message_id: int | None
    signal_type: str
    signal_key: str
    signal_summary: str
    signal_value: dict[str, Any]
    signal_metadata: dict[str, Any]
    scope: str
    confidence_score: float
    status: str
    effective_from: datetime | None
    expires_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AssistantActionRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    conversation_id: int
    source_message_id: int | None
    action_type: str
    status: str
    request_payload: dict[str, Any]
    preview_payload: dict[str, Any]
    result_payload: dict[str, Any]
    failure_reason: str | None
    created_at: datetime
    updated_at: datetime


class AssistantConversationContractSummary(BaseModel):
    contract_version: str = ASSISTANT_CONTRACT_VERSION
    last_detected_intent: str | None = None
    latest_response_mode: str | None = None
    latest_governance: AssistantGovernanceResponse | None = None
    latest_artifact_summary: AssistantMessageArtifactSummary = Field(default_factory=AssistantMessageArtifactSummary)


class AssistantConversationLifecycleSummary(BaseModel):
    total_user_messages: int = 0
    total_assistant_messages: int = 0
    latest_message_id: int | None = None
    latest_user_message_id: int | None = None
    latest_assistant_message_id: int | None = None
    latest_action_run_id: int | None = None
    latest_memory_signal_id: int | None = None
    artifact_message_ids: list[int] = Field(default_factory=list)


class AssistantConversationDetailResponse(AssistantConversationResponse):
    contract_version: str = ASSISTANT_CONTRACT_VERSION
    message_count: int
    active_memory_signal_count: int
    pending_action_count: int
    messages: list[AssistantMessageResponse] = Field(default_factory=list)
    recent_action_runs: list[AssistantActionRunResponse] = Field(default_factory=list)
    effective_memory_signals: list[AssistantMemorySignalResponse] = Field(default_factory=list)
    contract_summary: AssistantConversationContractSummary = Field(default_factory=AssistantConversationContractSummary)
    lifecycle_summary: AssistantConversationLifecycleSummary = Field(default_factory=AssistantConversationLifecycleSummary)


class AssistantSuggestedAction(BaseModel):
    action_run_id: int
    action_type: str
    title: str
    summary: str
    requires_confirmation: bool = True
    preview_payload: dict[str, Any] = Field(default_factory=dict)


class AssistantMessageExchangeResponse(BaseModel):
    contract_version: str = ASSISTANT_CONTRACT_VERSION
    conversation: AssistantConversationResponse
    user_message: AssistantMessageResponse
    assistant_message: AssistantMessageResponse
    response_mode: str
    grounded_entities: list[AssistantGroundedEntity] = Field(default_factory=list)
    used_context_summary: dict[str, Any] = Field(default_factory=dict)
    suggested_actions: list[AssistantSuggestedAction] = Field(default_factory=list)
    memory_candidates: list[AssistantMemorySignalResponse] = Field(default_factory=list)
    follow_up_questions: list[str] = Field(default_factory=list)
    governance: AssistantGovernanceResponse
