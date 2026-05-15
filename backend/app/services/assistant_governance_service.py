from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from app.services.assistant_concept_utils import extract_requested_concept

SENSITIVE_REQUEST_PHRASES = {
    "password",
    "passwords",
    "token",
    "tokens",
    "secret",
    "secrets",
    "api key",
    "apikey",
    "credentials",
    "credential",
    "database",
    "databases",
    "db",
    "sql",
    "table",
    "tables",
    "users table",
    "admin access",
    "environment variable",
    ".env",
    "private data",
    "sensitive data",
    "كلمة المرور",
    "كلمات المرور",
    "الرقم السري",
    "توكن",
    "التوكن",
    "سر",
    "السر",
    "مفتاح api",
    "مفتاح",
    "المفاتيح",
    "بيانات حساسة",
    "بيانات خاصة",
    "قاعدة البيانات",
    "قواعد البيانات",
    "الجداول",
    "الجدول",
    "وصول ادمن",
    "وصول مسؤول",
    "ملف env",
    ".env",
}


@dataclass(frozen=True)
class AssistantGovernanceDecision:
    status: str
    intent: str
    answer_strategy: str
    blocking_reason: str | None
    requires_clarification: bool
    can_extract_memory: bool
    can_suggest_actions: bool
    has_active_plan: bool
    has_recovery_preview: bool
    has_recommendations: bool
    has_next_actionable_item: bool
    concept_label: str | None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)



GENERIC_AMBIGUOUS_CONCEPTS = {
    "this",
    "that",
    "it",
    "this thing",
    "that thing",
    "this part",
    "that part",
    "هذا",
    "هذه",
    "ذا",
    "ذي",
    "هالشي",
    "هذا الشي",
    "هذا الجزء",
    "الجزء هذا",
}



LEARNING_SCOPE_KEYWORDS = {
    "learn",
    "learning",
    "study",
    "course",
    "courses",
    "lesson",
    "lessons",
    "concept",
    "concepts",
    "topic",
    "topics",
    "schedule",
    "plan",
    "plans",
    "recommend",
    "recommendation",
    "recommendations",
    "progress",
    "recovery",
    "queue",
    "compare",
    "comparison",
    "next",
    "focus",
    "goal",
    "goals",
    "track",
    "path",
    "skill",
    "skills",
    "شرح",
    "اشرح",
    "تعلم",
    "التعلم",
    "ادرس",
    "أدرس",
    "دورة",
    "دورات",
    "درس",
    "دروس",
    "مفهوم",
    "مفاهيم",
    "موضوع",
    "مواضيع",
    "جدول",
    "الجدول",
    "خطة",
    "الخطة",
    "توصية",
    "توصيات",
    "تقدم",
    "التقدم",
    "تعافي",
    "تعويض",
    "قارن",
    "مقارنة",
    "التالي",
    "القادم",
    "تركيز",
    "هدف",
    "مسار",
    "مهارة",
    "مهارات",
}


def _contains_learning_scope_request(message_content: str) -> bool:
    lowered = " ".join(message_content.lower().split())
    ascii_tokens = _tokenize_ascii_words(lowered)

    if ascii_tokens.intersection(LEARNING_SCOPE_KEYWORDS):
        return True

    for phrase in LEARNING_SCOPE_KEYWORDS:
        if " " in phrase or any("؀" <= char <= "ۿ" for char in phrase):
            if phrase in lowered:
                return True

    return False
def _tokenize_ascii_words(message_content: str) -> set[str]:
    normalized = "".join(char.lower() if char.isalnum() or char.isspace() else " " for char in message_content)
    return {token for token in normalized.split() if token}


def _contains_sensitive_request(message_content: str) -> bool:
    lowered = " ".join(message_content.lower().split())
    ascii_tokens = _tokenize_ascii_words(lowered)

    for phrase in SENSITIVE_REQUEST_PHRASES:
        candidate = phrase.lower().strip()
        if not candidate:
            continue
        if " " in candidate or any("؀" <= char <= "ۿ" for char in candidate) or candidate.startswith('.'):
            if candidate in lowered:
                return True
            continue
        if candidate in ascii_tokens:
            return True

    return False


def _is_ambiguous_concept(concept_label: str | None) -> bool:
    if not concept_label:
        return True
    normalized = concept_label.strip().lower()
    if normalized in GENERIC_AMBIGUOUS_CONCEPTS:
        return True
    first_token = normalized.split()[0] if normalized.split() else ""
    return first_token in GENERIC_AMBIGUOUS_CONCEPTS


def build_assistant_governance_decision(*, message_content: str, intent: str, context: dict[str, Any]) -> AssistantGovernanceDecision:
    active_plan = context.get("active_plan") or {}
    recovery_preview = context.get("recovery_preview") or {}
    recommendations = list(context.get("recommendations") or [])
    next_actionable_item = context.get("next_actionable_item") or {}

    has_active_plan = active_plan.get("plan_id") is not None
    has_recovery_preview = bool(recovery_preview)
    has_recommendations = len(recommendations) > 0
    has_next_actionable_item = next_actionable_item.get("plan_item_id") is not None
    concept_label = extract_requested_concept(message_content)

    if _contains_sensitive_request(message_content):
        return AssistantGovernanceDecision(
            status="blocked",
            intent=intent,
            answer_strategy="bounded",
            blocking_reason="unsupported_sensitive_request",
            requires_clarification=False,
            can_extract_memory=False,
            can_suggest_actions=False,
            has_active_plan=has_active_plan,
            has_recovery_preview=has_recovery_preview,
            has_recommendations=has_recommendations,
            has_next_actionable_item=has_next_actionable_item,
            concept_label=concept_label,
        )

    if intent in {"recovery_guidance", "progress_reflection"} and not has_active_plan:
        return AssistantGovernanceDecision(
            status="bounded",
            intent=intent,
            answer_strategy="clarify",
            blocking_reason="no_active_plan",
            requires_clarification=True,
            can_extract_memory=True,
            can_suggest_actions=False,
            has_active_plan=has_active_plan,
            has_recovery_preview=has_recovery_preview,
            has_recommendations=has_recommendations,
            has_next_actionable_item=has_next_actionable_item,
            concept_label=concept_label,
        )

    if intent == "recovery_guidance" and has_active_plan and has_recovery_preview and not recovery_preview.get("needs_recovery"):
        return AssistantGovernanceDecision(
            status="bounded",
            intent=intent,
            answer_strategy="bounded",
            blocking_reason="no_recovery_needed",
            requires_clarification=False,
            can_extract_memory=True,
            can_suggest_actions=False,
            has_active_plan=has_active_plan,
            has_recovery_preview=has_recovery_preview,
            has_recommendations=has_recommendations,
            has_next_actionable_item=has_next_actionable_item,
            concept_label=concept_label,
        )

    if intent in {"next_course_guidance", "recommendation_explanation"} and not has_recommendations:
        return AssistantGovernanceDecision(
            status="bounded",
            intent=intent,
            answer_strategy="clarify",
            blocking_reason="insufficient_recommendation_context",
            requires_clarification=True,
            can_extract_memory=True,
            can_suggest_actions=False,
            has_active_plan=has_active_plan,
            has_recovery_preview=has_recovery_preview,
            has_recommendations=has_recommendations,
            has_next_actionable_item=has_next_actionable_item,
            concept_label=concept_label,
        )

    if intent == "course_comparison" and len(recommendations) < 2:
        return AssistantGovernanceDecision(
            status="bounded",
            intent=intent,
            answer_strategy="clarify",
            blocking_reason="insufficient_comparison_context",
            requires_clarification=True,
            can_extract_memory=True,
            can_suggest_actions=False,
            has_active_plan=has_active_plan,
            has_recovery_preview=has_recovery_preview,
            has_recommendations=has_recommendations,
            has_next_actionable_item=has_next_actionable_item,
            concept_label=concept_label,
        )

    if intent == "study_concept_help" and _is_ambiguous_concept(concept_label):
        return AssistantGovernanceDecision(
            status="bounded",
            intent=intent,
            answer_strategy="clarify",
            blocking_reason="ambiguous_concept_request",
            requires_clarification=True,
            can_extract_memory=True,
            can_suggest_actions=False,
            has_active_plan=has_active_plan,
            has_recovery_preview=has_recovery_preview,
            has_recommendations=has_recommendations,
            has_next_actionable_item=has_next_actionable_item,
            concept_label=concept_label,
        )

    schedule_signals = context.get("schedule_guidance_signals") or {}

    if intent == "general_guidance" and not _contains_learning_scope_request(message_content):
        return AssistantGovernanceDecision(
            status="bounded",
            intent=intent,
            answer_strategy="clarify",
            blocking_reason="out_of_scope_request",
            requires_clarification=True,
            can_extract_memory=False,
            can_suggest_actions=False,
            has_active_plan=has_active_plan,
            has_recovery_preview=has_recovery_preview,
            has_recommendations=has_recommendations,
            has_next_actionable_item=has_next_actionable_item,
            concept_label=concept_label,
        )

    if intent == "schedule_support" and not has_active_plan and not any(
        [
            schedule_signals.get("preferred_time_window"),
            schedule_signals.get("temporary_unavailable_time_window"),
            schedule_signals.get("active_learning_signal_concepts"),
        ]
    ):
        return AssistantGovernanceDecision(
            status="bounded",
            intent=intent,
            answer_strategy="clarify",
            blocking_reason="insufficient_schedule_context",
            requires_clarification=True,
            can_extract_memory=True,
            can_suggest_actions=False,
            has_active_plan=has_active_plan,
            has_recovery_preview=has_recovery_preview,
            has_recommendations=has_recommendations,
            has_next_actionable_item=has_next_actionable_item,
            concept_label=concept_label,
        )

    if intent == "recovery_guidance" and has_active_plan and not has_recovery_preview:
        return AssistantGovernanceDecision(
            status="bounded",
            intent=intent,
            answer_strategy="clarify",
            blocking_reason="insufficient_recovery_context",
            requires_clarification=True,
            can_extract_memory=True,
            can_suggest_actions=False,
            has_active_plan=has_active_plan,
            has_recovery_preview=has_recovery_preview,
            has_recommendations=has_recommendations,
            has_next_actionable_item=has_next_actionable_item,
            concept_label=concept_label,
        )

    if intent == "progress_reflection" and has_active_plan and not (active_plan.get("summary") or has_next_actionable_item):
        return AssistantGovernanceDecision(
            status="bounded",
            intent=intent,
            answer_strategy="clarify",
            blocking_reason="insufficient_progress_context",
            requires_clarification=True,
            can_extract_memory=True,
            can_suggest_actions=False,
            has_active_plan=has_active_plan,
            has_recovery_preview=has_recovery_preview,
            has_recommendations=has_recommendations,
            has_next_actionable_item=has_next_actionable_item,
            concept_label=concept_label,
        )

    can_suggest_actions = False
    if intent == "schedule_support" and has_active_plan:
        can_suggest_actions = True
    elif intent == "recovery_guidance" and has_active_plan and recovery_preview.get("needs_recovery"):
        can_suggest_actions = True
    elif intent == "progress_reflection" and has_active_plan:
        can_suggest_actions = True
    elif intent in {"next_course_guidance", "recommendation_explanation", "course_comparison"} and has_recommendations:
        can_suggest_actions = True

    return AssistantGovernanceDecision(
        status="ready",
        intent=intent,
        answer_strategy="grounded",
        blocking_reason=None,
        requires_clarification=False,
        can_extract_memory=True,
        can_suggest_actions=can_suggest_actions,
        has_active_plan=has_active_plan,
        has_recovery_preview=has_recovery_preview,
        has_recommendations=has_recommendations,
        has_next_actionable_item=has_next_actionable_item,
        concept_label=concept_label,
    )
