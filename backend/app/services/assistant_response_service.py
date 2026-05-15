from __future__ import annotations

from typing import Any

from app.schemas.assistant import AssistantGroundedEntity
from app.services.assistant_concept_utils import extract_requested_concept
from app.services.assistant_response_templates import (
    build_ambiguous_concept_help_text,
    build_course_comparison_text,
    build_default_text,
    build_insufficient_guidance_context_text,
    build_insufficient_progress_context_text,
    build_insufficient_recovery_context_text,
    build_insufficient_schedule_context_text,
    build_out_of_scope_request_text,
    build_next_course_guidance_text,
    build_no_active_plan_text,
    build_no_recovery_needed_text,
    build_progress_reflection_text,
    build_recommendation_explanation_text,
    build_recovery_guidance_text,
    build_schedule_support_with_plan_text,
    build_schedule_support_without_plan_text,
    build_study_concept_help_text,
    build_unsupported_request_text,
    is_arabic_message,
)


def _build_grounded_entity(entity_type: str, entity_id: int | None, label: str, metadata: dict[str, Any] | None = None) -> AssistantGroundedEntity:
    return AssistantGroundedEntity(entity_type=entity_type, entity_id=entity_id, label=label, metadata=metadata or {})


def build_grounded_response(
    *,
    message_content: str,
    intent: str,
    context: dict[str, Any],
    governance: dict[str, Any] | None = None,
) -> tuple[str, str, list[AssistantGroundedEntity], dict[str, Any], list[str]]:
    preferred_language = context.get("profile", {}).get("preferred_language")
    use_arabic = is_arabic_message(message_content, preferred_language)

    active_plan = context.get("active_plan") or {}
    active_plan_courses = list(context.get("active_plan_courses") or [])
    next_actionable_item = context.get("next_actionable_item") or {}
    recovery_preview = context.get("recovery_preview") or {}
    recommendations = list(context.get("recommendations") or [])
    learning_state = context.get("learning_state") or {}
    schedule_signals = context.get("schedule_guidance_signals") or {}

    grounded_entities: list[AssistantGroundedEntity] = []
    governance_summary = dict(governance or {})
    blocking_reason = governance_summary.get("blocking_reason")

    if active_plan.get("plan_id") is not None:
        grounded_entities.append(
            _build_grounded_entity(
                "learning_plan",
                active_plan.get("plan_id"),
                active_plan.get("title") or "Active learning plan",
                {"status": active_plan.get("status"), "timezone": active_plan.get("schedule_timezone_snapshot")},
            )
        )

    if next_actionable_item.get("plan_item_id") is not None:
        grounded_entities.append(
            _build_grounded_entity(
                "plan_item",
                next_actionable_item.get("plan_item_id"),
                next_actionable_item.get("title") or "Next actionable item",
                {
                    "course_id": next_actionable_item.get("course_id"),
                    "scheduled_date": next_actionable_item.get("scheduled_date"),
                    "time_window": next_actionable_item.get("time_window"),
                },
            )
        )

    if blocking_reason == "unsupported_sensitive_request":
        text, follow_up_questions = build_unsupported_request_text(use_arabic=use_arabic)
        return text, "assistant_boundaries", grounded_entities, {
            "current_focus": learning_state.get("current_focus"),
            "governance": governance_summary,
            "remembered_schedule_signals": schedule_signals,
        }, follow_up_questions

    if blocking_reason == "out_of_scope_request":
        text, follow_up_questions = build_out_of_scope_request_text(use_arabic=use_arabic)
        return text, "assistant_out_of_scope", grounded_entities, {
            "current_focus": learning_state.get("current_focus"),
            "governance": governance_summary,
            "remembered_schedule_signals": schedule_signals,
        }, follow_up_questions

    if blocking_reason == "no_active_plan":
        capability_label = "recovery guidance" if intent == "recovery_guidance" else "progress reflection"
        if use_arabic:
            capability_label = "مراجعة التعافي" if intent == "recovery_guidance" else "قراءة التقدم"
        text, follow_up_questions = build_no_active_plan_text(
            use_arabic=use_arabic,
            requested_capability=capability_label,
        )
        return text, "assistant_no_active_plan", grounded_entities, {
            "current_focus": learning_state.get("current_focus"),
            "governance": governance_summary,
            "remembered_schedule_signals": schedule_signals,
        }, follow_up_questions

    if blocking_reason == "insufficient_schedule_context":
        text, follow_up_questions = build_insufficient_schedule_context_text(use_arabic=use_arabic)
        return text, "assistant_insufficient_schedule_context", grounded_entities, {
            "current_focus": learning_state.get("current_focus"),
            "governance": governance_summary,
            "remembered_schedule_signals": schedule_signals,
        }, follow_up_questions

    if blocking_reason == "insufficient_recovery_context":
        text, follow_up_questions = build_insufficient_recovery_context_text(
            use_arabic=use_arabic,
            active_plan_title=active_plan.get("title") or ("خطتك الحالية" if use_arabic else "your active plan"),
        )
        return text, "assistant_insufficient_recovery_context", grounded_entities, {
            "active_plan_id": active_plan.get("plan_id"),
            "governance": governance_summary,
        }, follow_up_questions

    if blocking_reason == "insufficient_progress_context":
        text, follow_up_questions = build_insufficient_progress_context_text(
            use_arabic=use_arabic,
            active_plan_title=active_plan.get("title") or ("خطتك الحالية" if use_arabic else "your active plan"),
        )
        return text, "assistant_insufficient_progress_context", grounded_entities, {
            "active_plan_id": active_plan.get("plan_id"),
            "governance": governance_summary,
            "remembered_schedule_signals": schedule_signals,
        }, follow_up_questions

    if blocking_reason == "no_recovery_needed":
        text, follow_up_questions = build_no_recovery_needed_text(
            use_arabic=use_arabic,
            active_plan_title=active_plan.get("title") or ("خطتك الحالية" if use_arabic else "your active plan"),
        )
        return text, "assistant_no_recovery_needed", grounded_entities, {
            "active_plan_id": active_plan.get("plan_id"),
            "governance": governance_summary,
        }, follow_up_questions

    if blocking_reason in {"insufficient_recommendation_context", "insufficient_comparison_context"}:
        capability_label = "next-step guidance"
        if intent == "recommendation_explanation":
            capability_label = "recommendation explanation"
        elif intent == "course_comparison":
            capability_label = "course comparison"
        if use_arabic:
            capability_label = {
                "next_course_guidance": "تحديد الخطوة التالية",
                "recommendation_explanation": "شرح التوصية",
                "course_comparison": "مقارنة الدورات",
            }.get(intent, "التوجيه القادم")
        text, follow_up_questions = build_insufficient_guidance_context_text(
            use_arabic=use_arabic,
            requested_capability=capability_label,
        )
        return text, "assistant_insufficient_guidance_context", grounded_entities, {
            "current_focus": learning_state.get("current_focus"),
            "governance": governance_summary,
            "recommendation_count": len(recommendations),
        }, follow_up_questions

    if blocking_reason == "ambiguous_concept_request":
        text, follow_up_questions = build_ambiguous_concept_help_text(use_arabic=use_arabic)
        return text, "assistant_ambiguous_concept_help", grounded_entities, {
            "current_focus": learning_state.get("current_focus"),
            "governance": governance_summary,
            "next_actionable_item_id": next_actionable_item.get("plan_item_id"),
        }, follow_up_questions

    if intent == "schedule_support":
        summary = dict(active_plan.get("summary") or {})
        if active_plan:
            text, follow_up_questions = build_schedule_support_with_plan_text(
                use_arabic=use_arabic,
                active_plan_title=active_plan.get("title") or "Active learning plan",
                schedule_timezone_snapshot=active_plan.get("schedule_timezone_snapshot"),
                pending_items_count=summary.get("pending_items_count") or 0,
                overdue_items_count=summary.get("overdue_items_count") or 0,
                next_actionable_title=next_actionable_item.get("title") or "not clear yet",
                preferred_time_window=schedule_signals.get("preferred_time_window"),
                temporarily_unavailable_time_window=schedule_signals.get("temporary_unavailable_time_window"),
            )
            return text, "grounded_schedule_guidance", grounded_entities, {
                "current_focus": learning_state.get("current_focus"),
                "active_plan_id": active_plan.get("plan_id"),
                "next_actionable_item_id": next_actionable_item.get("plan_item_id"),
                "needs_recovery": recovery_preview.get("needs_recovery"),
                "remembered_schedule_signals": schedule_signals,
                "governance": governance_summary,
            }, follow_up_questions

        text, follow_up_questions = build_schedule_support_without_plan_text(
            use_arabic=use_arabic,
            preferred_time_window=schedule_signals.get("preferred_time_window"),
            temporarily_unavailable_time_window=schedule_signals.get("temporary_unavailable_time_window"),
        )
        return text, "grounded_schedule_guidance", grounded_entities, {
            "current_focus": learning_state.get("current_focus"),
            "active_plan_id": active_plan.get("plan_id"),
            "needs_recovery": recovery_preview.get("needs_recovery"),
            "remembered_schedule_signals": schedule_signals,
            "governance": governance_summary,
        }, follow_up_questions

    if intent == "recovery_guidance" and active_plan and recovery_preview:
        text, follow_up_questions = build_recovery_guidance_text(
            use_arabic=use_arabic,
            active_plan_title=active_plan.get("title") or "Active learning plan",
            drift_level=recovery_preview.get("drift_level"),
            overdue_items_count=recovery_preview.get("overdue_items_count") or 0,
            recommended_action=recovery_preview.get("recommended_action"),
            recommended_recovery_mode=recovery_preview.get("recommended_recovery_mode"),
        )
        return text, "grounded_recovery_guidance", grounded_entities, {
            "active_plan_id": active_plan.get("plan_id"),
            "drift_level": recovery_preview.get("drift_level"),
            "recommended_action": recovery_preview.get("recommended_action"),
            "recommended_recovery_mode": recovery_preview.get("recommended_recovery_mode"),
            "governance": governance_summary,
        }, follow_up_questions

    if intent == "next_course_guidance":
        if recommendations:
            top = recommendations[0]
            grounded_entities.append(_build_grounded_entity("course", top.get("course_id"), top.get("title") or "Recommended course", {"topic_tags": top.get("topic_tags") or []}))
            text, follow_up_questions = build_next_course_guidance_text(
                use_arabic=use_arabic,
                current_focus=learning_state.get("current_focus"),
                title=top.get("title") or "Recommended course",
                topic_tags=list(top.get("topic_tags") or []),
            )
            return text, "grounded_next_step_guidance", grounded_entities, {
                "current_focus": learning_state.get("current_focus"),
                "recommendation_count": len(recommendations),
                "remembered_schedule_signals": schedule_signals,
                "governance": governance_summary,
            }, follow_up_questions

        fallback_text = (
            "أحتاج أولًا بيانات تعلم أكثر أو بروفايل حتى أرشح الخطوة التالية بشكل موثوق."
            if use_arabic
            else "I need a bit more profile or learning data before I can recommend a trustworthy next step."
        )
        return fallback_text, "grounded_next_step_guidance", grounded_entities, {"current_focus": learning_state.get("current_focus")}, []

    if intent == "study_concept_help":
        concept_label = extract_requested_concept(message_content)
        if concept_label:
            if next_actionable_item.get("course_title"):
                grounded_entities.append(
                    _build_grounded_entity(
                        "course",
                        next_actionable_item.get("course_id"),
                        next_actionable_item.get("course_title") or "Current course",
                        {"unit_title": next_actionable_item.get("unit_title")},
                    )
                )
            text, follow_up_questions = build_study_concept_help_text(
                use_arabic=use_arabic,
                concept_label=concept_label,
                next_actionable_title=next_actionable_item.get("title") or "your current lesson",
            )
            return text, "grounded_concept_help", grounded_entities, {
                "current_focus": learning_state.get("current_focus"),
                "concept": concept_label,
                "next_actionable_item_id": next_actionable_item.get("plan_item_id"),
                "governance": governance_summary,
            }, follow_up_questions

        fallback_text = (
            "أقدر أساعدك في شرح الفكرة، لكن حدّد لي اسم المفهوم أو الجزء الذي لم يتضح لك بالضبط حتى يكون التوجيه أدق."
            if use_arabic
            else "I can help explain the idea, but tell me the exact concept or part that is unclear so I can make the guidance more precise."
        )
        return fallback_text, "grounded_concept_help", grounded_entities, {
            "current_focus": learning_state.get("current_focus"),
            "concept": None,
            "next_actionable_item_id": next_actionable_item.get("plan_item_id"),
            "governance": governance_summary,
        }, []

    if intent == "recommendation_explanation" and recommendations:
        top = recommendations[0]
        grounded_entities.append(_build_grounded_entity("course", top.get("course_id"), top.get("title") or "Recommended course", {"topic_tags": top.get("topic_tags") or []}))
        text, follow_up_questions = build_recommendation_explanation_text(
            use_arabic=use_arabic,
            title=top.get("title") or "Recommended course",
            current_focus=learning_state.get("current_focus"),
            topic_tags=list(top.get("topic_tags") or []),
        )
        return text, "grounded_recommendation_explanation", grounded_entities, {
            "current_focus": learning_state.get("current_focus"),
            "recommendation_count": len(recommendations),
        }, follow_up_questions

    if intent == "progress_reflection":
        summary = dict(active_plan.get("summary") or {})
        text, follow_up_questions = build_progress_reflection_text(
            use_arabic=use_arabic,
            current_focus=learning_state.get("current_focus"),
            engagement_score=learning_state.get("engagement_score") or 0,
            completed_items_count=summary.get("completed_items_count") or 0,
            skipped_items_count=summary.get("skipped_items_count") or 0,
            pending_items_count=summary.get("pending_items_count") or 0,
            overdue_items_count=summary.get("overdue_items_count") or 0,
        )
        return text, "grounded_progress_reflection", grounded_entities, {
            "current_focus": learning_state.get("current_focus"),
            "engagement_score": learning_state.get("engagement_score"),
            "active_plan_id": active_plan.get("plan_id"),
            "remembered_schedule_signals": schedule_signals,
        }, follow_up_questions

    if intent == "course_comparison" and len(recommendations) >= 2:
        top = recommendations[0]
        second = recommendations[1]
        grounded_entities.append(_build_grounded_entity("course", top.get("course_id"), top.get("title") or "Top recommended course", {"topic_tags": top.get("topic_tags") or []}))
        grounded_entities.append(_build_grounded_entity("course", second.get("course_id"), second.get("title") or "Second recommended course", {"topic_tags": second.get("topic_tags") or []}))
        text, follow_up_questions = build_course_comparison_text(
            use_arabic=use_arabic,
            top_title=top.get("title") or "Top recommended course",
            second_title=second.get("title") or "Second recommended course",
            top_topics=list(top.get("topic_tags") or []),
            second_topics=list(second.get("topic_tags") or []),
            current_focus=learning_state.get("current_focus"),
        )
        return text, "grounded_course_comparison", grounded_entities, {
            "current_focus": learning_state.get("current_focus"),
            "recommendation_count": len(recommendations),
            "remembered_schedule_signals": schedule_signals,
        }, follow_up_questions

    text, follow_up_questions = build_default_text(use_arabic=use_arabic, current_focus=learning_state.get("current_focus"))
    return text, "grounded_general_guidance", grounded_entities, {
        "current_focus": learning_state.get("current_focus"),
        "remembered_schedule_signals": schedule_signals,
        "recommendation_count": len(recommendations),
        "active_plan_course_count": len(active_plan_courses),
        "governance": governance_summary,
    }, follow_up_questions
