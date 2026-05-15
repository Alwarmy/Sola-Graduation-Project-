from __future__ import annotations

from typing import Any

from app.models.course import Course


DIFFICULTY_LABELS = {
    "beginner": "Beginner",
    "intermediate": "Intermediate",
    "advanced": "Advanced",
}

PRICING_LABELS = {
    "free": "Free",
    "paid": "Paid",
    "subscription": "Subscription",
    "unknown": "Unknown",
}

PROGRESSION_LABELS = {
    "foundation": "Foundation",
    "next_step": "Next Step",
    "specialization": "Specialization",
}

FIT_LABELS = {
    "excellent_fit": "Excellent fit",
    "strong_fit": "Strong fit",
    "good_fit": "Good fit",
    "possible_fit": "Possible fit",
}

QUERY_MATCH_LABELS = {
    "strong": "Strong search match",
    "moderate": "Relevant search match",
    "light": "Broad search match",
    "none": "Catalog result",
}


def _humanize_slug(value: str | None) -> str | None:
    if not value:
        return None
    return value.replace("_", " ").strip().title()


def _build_short_description(description: str | None, limit: int = 180) -> str | None:
    if not description:
        return None

    cleaned = " ".join(description.split())
    if len(cleaned) <= limit:
        return cleaned

    return f"{cleaned[: limit - 1].rstrip()}…"


def _build_provider_display_name(course: Course) -> str:
    provider_metadata = course.provider_metadata or {}
    explicit_name = provider_metadata.get("provider_display_name")
    if explicit_name:
        return str(explicit_name)

    if course.provider == "youtube":
        return "YouTube"

    return str(course.provider).replace("_", " ").title()


def _build_instructor_display_name(course: Course) -> str | None:
    return course.instructor_name or course.channel_title or None


def _build_content_format_label(course: Course) -> str:
    if course.content_type == "playlist":
        return "Playlist course"
    if course.content_type == "video":
        return "Video course"
    return _humanize_slug(course.content_type) or "Course"


def _build_duration_label(course: Course) -> str | None:
    total_minutes = course.duration_minutes_total
    if total_minutes is None or total_minutes <= 0:
        return None

    hours, minutes = divmod(total_minutes, 60)
    if hours > 0 and minutes > 0:
        label = f"{hours}h {minutes}m"
    elif hours > 0:
        label = f"{hours}h"
    else:
        label = f"{minutes}m"

    if course.duration_is_estimated:
        return f"{label} estimated"

    return label


def _build_quality_tier(course: Course) -> str | None:
    score = course.quality_score
    if score is None:
        return None
    if score >= 85:
        return "high"
    if score >= 70:
        return "strong"
    if score >= 50:
        return "standard"
    return "developing"


def _build_badges(course: Course, personalization: dict[str, Any] | None) -> list[dict[str, str]]:
    badges: list[dict[str, str]] = []

    badges.append(
        {
            "key": "content_format",
            "label": _build_content_format_label(course),
            "tone": "info",
        }
    )

    if course.pricing_model == "free":
        badges.append({"key": "pricing", "label": "Free", "tone": "success"})
    else:
        badges.append(
            {
                "key": "pricing",
                "label": PRICING_LABELS.get(course.pricing_model, "Unknown"),
                "tone": "neutral",
            }
        )

    if course.difficulty_level:
        badges.append(
            {
                "key": "difficulty",
                "label": DIFFICULTY_LABELS.get(course.difficulty_level, _humanize_slug(course.difficulty_level) or "Level"),
                "tone": "warning" if course.difficulty_level == "advanced" else "info",
            }
        )

    if course.progression_hint:
        badges.append(
            {
                "key": "progression",
                "label": PROGRESSION_LABELS.get(course.progression_hint, _humanize_slug(course.progression_hint) or "Progression"),
                "tone": "neutral",
            }
        )

    quality_tier = _build_quality_tier(course)
    if quality_tier == "high":
        badges.append({"key": "quality", "label": "High quality", "tone": "success"})
    elif quality_tier == "strong":
        badges.append({"key": "quality", "label": "Strong quality", "tone": "info"})

    if course.duration_is_estimated and course.duration_minutes_total:
        badges.append(
            {
                "key": "duration_estimated",
                "label": "Estimated duration",
                "tone": "neutral",
            }
        )

    if personalization and personalization.get("fit_label"):
        badges.append(
            {
                "key": "fit",
                "label": FIT_LABELS.get(personalization["fit_label"], _humanize_slug(personalization["fit_label"]) or "Fit"),
                "tone": "success",
            }
        )

    return badges[:6]


def _build_card_summary(course: Course) -> str:
    parts: list[str] = [_build_content_format_label(course)]

    if course.difficulty_level:
        parts.append(DIFFICULTY_LABELS.get(course.difficulty_level, _humanize_slug(course.difficulty_level) or "Level"))

    duration_label = _build_duration_label(course)
    if duration_label:
        parts.append(duration_label)

    parts.append(PRICING_LABELS.get(course.pricing_model, "Unknown"))

    instructor_display_name = _build_instructor_display_name(course)
    if instructor_display_name:
        parts.append(f"By {instructor_display_name}")
    else:
        parts.append(_build_provider_display_name(course))

    return " • ".join(parts)


def _normalize_personalization(personalization: dict[str, Any] | None) -> dict[str, Any] | None:
    if personalization is None:
        return None

    return {
        "fit_label": personalization.get("fit_label"),
        "fit_score": round(float(personalization.get("fit_score", 0.0)), 2),
        "matched_focus": personalization.get("matched_focus"),
        "fit_reason": personalization.get("fit_reason"),
        "reason_codes": list(personalization.get("reason_codes") or []),
        "why_now": list(personalization.get("why_now") or []),
        "matched_topics": list(personalization.get("matched_topics") or []),
        "covered_topic_overlap": list(personalization.get("covered_topic_overlap") or []),
        "score_breakdown": dict(personalization.get("score_breakdown") or {}),
        "history_details": dict(personalization.get("history_details") or {}),
        "profile_alignment": dict(personalization.get("profile_alignment") or {}),
    }


def _build_query_match_strength(discovery: dict[str, Any]) -> str:
    score = float(discovery.get("query_relevance_score", 0.0))
    if score >= 45.0:
        return "strong"
    if score >= 18.0:
        return "moderate"
    if score > 0.0:
        return "light"
    return "none"


def _build_discovery_explanation_label(discovery: dict[str, Any]) -> str:
    if discovery.get("personalization_applied"):
        return "Personalized discovery match"

    return QUERY_MATCH_LABELS.get(discovery.get("query_match_strength"), "Catalog result")


def _build_discovery_explanation_summary(discovery: dict[str, Any]) -> str | None:
    matched_query_topics = list(discovery.get("matched_query_topics") or [])
    matched_query_tokens = list(discovery.get("matched_query_tokens") or [])
    ranking_mode = discovery.get("ranking_mode") or "catalog_sort"
    personalization_applied = bool(discovery.get("personalization_applied"))

    if personalization_applied and discovery.get("personalization_fit_reason"):
        return str(discovery["personalization_fit_reason"])

    if matched_query_topics:
        return f"Matched query topics: {', '.join(matched_query_topics[:3])}."

    if matched_query_tokens:
        return f"Matched query terms: {', '.join(matched_query_tokens[:3])}."

    if ranking_mode == "catalog_sort":
        return "Ranked as a strong catalog result based on quality and metadata signals."

    return "Ranked through search relevance signals."


def _normalize_discovery(discovery: dict[str, Any] | None) -> dict[str, Any] | None:
    if discovery is None:
        return None

    normalized = {
        "ranking_mode": str(discovery.get("ranking_mode") or "catalog_sort"),
        "ranking_score": round(float(discovery.get("ranking_score", 0.0)), 2),
        "query_relevance_score": round(float(discovery.get("query_relevance_score", 0.0)), 2),
        "personalization_score": round(float(discovery.get("personalization_score", 0.0)), 2),
        "matched_query_tokens": list(discovery.get("matched_query_tokens") or []),
        "matched_query_topics": list(discovery.get("matched_query_topics") or []),
        "ranking_reasons": list(discovery.get("ranking_reasons") or []),
        "personalization_applied": bool(discovery.get("personalization_applied")),
        "personalization_fit_reason": discovery.get("personalization_fit_reason"),
    }

    normalized["query_match_strength"] = _build_query_match_strength(normalized)
    normalized["explanation_label"] = _build_discovery_explanation_label(normalized)
    normalized["explanation_summary"] = _build_discovery_explanation_summary(normalized)

    normalized.pop("personalization_fit_reason", None)
    return normalized


def build_course_card(
    course: Course,
    personalization: dict[str, Any] | None = None,
    discovery: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_personalization = _normalize_personalization(personalization)
    normalized_discovery = _normalize_discovery(discovery)
    topic_tags = list(course.topic_tags or [])

    return {
        "id": course.id,
        "source": course.source,
        "external_id": course.external_id,
        "content_type": course.content_type,
        "content_format_label": _build_content_format_label(course),
        "title": course.title,
        "description": course.description,
        "short_description": _build_short_description(course.description),
        "provider": course.provider,
        "provider_display_name": _build_provider_display_name(course),
        "channel_title": course.channel_title,
        "instructor_name": course.instructor_name,
        "instructor_display_name": _build_instructor_display_name(course),
        "language": course.language,
        "level": course.level,
        "difficulty_level": course.difficulty_level,
        "difficulty_label": DIFFICULTY_LABELS.get(course.difficulty_level, _humanize_slug(course.difficulty_level)),
        "duration_minutes_total": course.duration_minutes_total,
        "duration_is_estimated": course.duration_is_estimated,
        "duration_label": _build_duration_label(course),
        "pricing_model": course.pricing_model,
        "pricing_label": PRICING_LABELS.get(course.pricing_model, "Unknown"),
        "is_free": course.pricing_model == "free",
        "topic_tags": topic_tags,
        "topic_tag_labels": [_humanize_slug(tag) or tag for tag in topic_tags],
        "quality_score": course.quality_score,
        "quality_tier": _build_quality_tier(course),
        "quality_signals": dict(course.quality_signals or {}),
        "prerequisite_hint": course.prerequisite_hint,
        "progression_hint": course.progression_hint,
        "progression_label": PROGRESSION_LABELS.get(course.progression_hint, _humanize_slug(course.progression_hint)),
        "provider_metadata": dict(course.provider_metadata or {}),
        "url": course.url,
        "thumbnail_url": course.thumbnail_url,
        "published_at": course.published_at,
        "created_at": course.created_at,
        "updated_at": course.updated_at,
        "card_summary": _build_card_summary(course),
        "badges": _build_badges(course, normalized_personalization),
        "personalization": normalized_personalization,
        "discovery": normalized_discovery,
    }


def build_course_cards(
    courses: list[Course],
    personalization_by_course_id: dict[int, dict[str, Any]] | None = None,
    discovery_by_course_id: dict[int, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    personalization_by_course_id = personalization_by_course_id or {}
    discovery_by_course_id = discovery_by_course_id or {}

    return [
        build_course_card(
            course=course,
            personalization=personalization_by_course_id.get(course.id),
            discovery=discovery_by_course_id.get(course.id),
        )
        for course in courses
    ]