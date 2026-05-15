from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.course import Course
from app.services.course_card_service import (
    DIFFICULTY_LABELS,
    PRICING_LABELS,
    PROGRESSION_LABELS,
    build_course_cards,
)
from app.services.discovery_personalization_service import (
    DiscoveryContext,
    evaluate_course_discovery_fit,
    load_discovery_context,
)
from app.services.topic_intelligence import extract_canonical_topics_from_text, tokenize_text

SEARCH_SORT_OPTIONS = {
    "relevance",
    "personalized",
    "quality",
    "newest",
    "published",
    "duration_short",
    "duration_long",
}

DEFAULT_SEARCH_LIMIT = 20
DEFAULT_SEARCH_OFFSET = 0

CONTENT_TYPE_LABELS = {
    "playlist": "Playlist course",
    "video": "Video course",
}

QUERY_DIFFICULTY_HINT_PATTERNS = {
    "beginner": {"beginner", "beginners", "absolute beginner", "from scratch"},
    "intermediate": {"intermediate", "mid level", "mid-level"},
    "advanced": {"advanced", "expert", "specialist", "masterclass"},
}

QUERY_PROGRESSION_HINT_PATTERNS = {
    "foundation": {"beginner", "beginners", "from scratch", "fundamentals", "basics", "intro"},
    "next_step": {"next step", "intermediate", "level up"},
    "specialization": {"advanced", "specialization", "masterclass", "expert"},
}


def _humanize_slug(value: str | None) -> str | None:
    if not value:
        return None
    return value.replace("_", " ").strip().title()


@dataclass(slots=True)
class CourseSearchParams:
    q: str | None = None
    language: str | None = None
    content_type: str | None = None
    source: str | None = None
    difficulty_level: str | None = None
    pricing_model: str | None = None
    progression_hint: str | None = None
    topic_tag: str | None = None
    sort_by: str | None = None
    limit: int = DEFAULT_SEARCH_LIMIT
    offset: int = DEFAULT_SEARCH_OFFSET


@dataclass(slots=True)
class NormalizedCourseSearchParams:
    q: str | None
    query_tokens: list[str]
    query_topics: list[str]
    query_difficulty_hint: str | None
    query_progression_hint: str | None
    language: str | None
    content_type: str | None
    source: str | None
    difficulty_level: str | None
    pricing_model: str | None
    progression_hint: str | None
    topic_tag: str | None
    sort_by: str
    limit: int
    offset: int


@dataclass(slots=True)
class RankedCourse:
    course: Course
    ranking_score: float
    query_relevance_score: float
    personalization_score: float
    matched_query_tokens: list[str]
    matched_query_topics: list[str]
    ranking_reasons: list[str]
    personalization: dict[str, Any] | None


def _detect_query_hint(normalized_query: str | None, patterns: dict[str, set[str]]) -> str | None:
    if not normalized_query:
        return None

    lowered_query = normalized_query.lower()
    for canonical_value, value_patterns in patterns.items():
        if any(pattern in lowered_query for pattern in value_patterns):
            return canonical_value

    return None


def normalize_course_search_params(params: CourseSearchParams) -> NormalizedCourseSearchParams:
    normalized_query = params.q.strip() if params.q and params.q.strip() else None
    query_tokens = tokenize_text(normalized_query)
    query_topics = extract_canonical_topics_from_text(normalized_query)
    query_difficulty_hint = _detect_query_hint(normalized_query, QUERY_DIFFICULTY_HINT_PATTERNS)
    query_progression_hint = _detect_query_hint(normalized_query, QUERY_PROGRESSION_HINT_PATTERNS)

    requested_sort = params.sort_by or "relevance"
    if requested_sort not in SEARCH_SORT_OPTIONS:
        requested_sort = "relevance"

    if normalized_query is None and requested_sort == "relevance":
        requested_sort = "quality"

    return NormalizedCourseSearchParams(
        q=normalized_query,
        query_tokens=query_tokens,
        query_topics=query_topics,
        query_difficulty_hint=query_difficulty_hint,
        query_progression_hint=query_progression_hint,
        language=params.language,
        content_type=params.content_type,
        source=params.source,
        difficulty_level=params.difficulty_level,
        pricing_model=params.pricing_model,
        progression_hint=params.progression_hint,
        topic_tag=params.topic_tag,
        sort_by=requested_sort,
        limit=params.limit,
        offset=params.offset,
    )


def _build_query_predicates(params: NormalizedCourseSearchParams) -> list[Any]:
    if not params.q:
        return []

    predicates: list[Any] = []
    seen_texts: set[str] = set()

    def add_text_predicates(text: str) -> None:
        lowered = text.strip().lower()
        if not lowered or lowered in seen_texts:
            return

        seen_texts.add(lowered)
        pattern = f"%{lowered}%"

        predicates.extend(
            [
                Course.title.ilike(pattern),
                Course.description.ilike(pattern),
                Course.channel_title.ilike(pattern),
                Course.instructor_name.ilike(pattern),
            ]
        )

    add_text_predicates(params.q)

    for token in params.query_tokens[:8]:
        if len(token) >= 2:
            add_text_predicates(token)

    for topic in params.query_topics[:6]:
        add_text_predicates(topic.replace("_", " "))

    return predicates


def _apply_database_filters(
    db: Session,
    params: NormalizedCourseSearchParams,
):
    query = db.query(Course)

    if params.q:
        query_predicates = _build_query_predicates(params)
        if query_predicates:
            query = query.filter(or_(*query_predicates))

    if params.language:
        query = query.filter(Course.language == params.language)

    if params.content_type:
        query = query.filter(Course.content_type == params.content_type)

    if params.source:
        query = query.filter(Course.source == params.source)

    if params.difficulty_level:
        query = query.filter(Course.difficulty_level == params.difficulty_level)

    if params.pricing_model:
        query = query.filter(Course.pricing_model == params.pricing_model)

    if params.progression_hint:
        query = query.filter(Course.progression_hint == params.progression_hint)

    if params.topic_tag:
        query = query.filter(Course.topic_tags.contains([params.topic_tag]))

    return query


def _compute_query_relevance(
    course: Course,
    params: NormalizedCourseSearchParams,
) -> tuple[float, list[str], list[str], list[str]]:
    if not params.q:
        return 0.0, [], [], []

    title = (course.title or "").lower()
    description = (course.description or "").lower()
    instructor = (course.instructor_name or course.channel_title or "").lower()
    topic_tags = set(course.topic_tags or [])
    title_tokens = set(tokenize_text(course.title))
    description_tokens = set(tokenize_text(course.description))

    score = 0.0
    reasons: list[str] = []

    if params.q.lower() in title:
        score += 36.0
        reasons.append("query_in_title")
    elif params.q.lower() in description:
        score += 12.0
        reasons.append("query_in_description")

    matched_query_tokens = sorted(title_tokens.intersection(params.query_tokens))
    matched_description_tokens = sorted(description_tokens.intersection(params.query_tokens))

    if matched_query_tokens:
        score += min(len(matched_query_tokens) * 9.0, 27.0)
        reasons.append("title_token_overlap")

    if matched_description_tokens:
        score += min(len(matched_description_tokens) * 3.0, 9.0)
        reasons.append("description_token_overlap")

    matched_query_topics = sorted(topic_tags.intersection(params.query_topics))
    if matched_query_topics:
        score += min(len(matched_query_topics) * 12.0, 24.0)
        reasons.append("topic_tag_overlap")

    if params.query_topics:
        inferred_topics = set(extract_canonical_topics_from_text(course.title))
        inferred_description_topics = set(extract_canonical_topics_from_text(course.description))
        inferred_overlap = sorted((inferred_topics | inferred_description_topics).intersection(params.query_topics))
        extra_inferred_overlap = [topic for topic in inferred_overlap if topic not in matched_query_topics]
        if extra_inferred_overlap:
            score += min(len(extra_inferred_overlap) * 5.0, 10.0)
            matched_query_topics = sorted(set(matched_query_topics + extra_inferred_overlap))
            reasons.append("inferred_topic_overlap")

    if params.q.lower() in instructor:
        score += 4.0
        reasons.append("instructor_overlap")

    if params.query_difficulty_hint and course.difficulty_level == params.query_difficulty_hint:
        score += 8.0
        reasons.append("query_difficulty_match")
    elif params.query_difficulty_hint and course.difficulty_level:
        score -= 2.0

    if params.query_progression_hint and course.progression_hint == params.query_progression_hint:
        score += 5.0
        reasons.append("query_progression_match")

    quality_score = float(course.quality_score or 0)
    score += min(quality_score / 10.0, 10.0)

    if course.published_at:
        published_at = course.published_at
        if published_at.tzinfo is None:
            published_at = published_at.replace(tzinfo=UTC)
        age_days = max((datetime.now(UTC) - published_at).days, 0)
        if age_days <= 30:
            score += 5.0
        elif age_days <= 180:
            score += 3.0
        elif age_days <= 365:
            score += 1.5

    return score, matched_query_tokens, matched_query_topics, reasons


def _combine_search_and_personalization_scores(
    *,
    query_relevance_score: float,
    personalization_score: float,
    params: NormalizedCourseSearchParams,
    personalization_enabled: bool,
) -> tuple[float, str]:
    if not personalization_enabled:
        if params.sort_by == "personalized":
            return query_relevance_score, "quality_fallback_no_personalization"
        if params.q:
            return query_relevance_score, "search_relevance"
        return personalization_score, "catalog_sort"

    if params.sort_by == "personalized":
        if params.q:
            final_score = (query_relevance_score * 0.55) + (personalization_score * 0.75)
            return final_score, "search_personalized"
        return personalization_score, "personalized_discovery"

    if params.sort_by == "relevance" and params.q:
        final_score = query_relevance_score + (personalization_score * 0.45)
        return final_score, "search_personalized_relevance"

    if params.sort_by == "relevance":
        return personalization_score, "personalized_discovery"

    return query_relevance_score, "catalog_sort"


def _build_ranked_course(
    *,
    course: Course,
    params: NormalizedCourseSearchParams,
    context: DiscoveryContext | None,
) -> RankedCourse:
    query_relevance_score, matched_query_tokens, matched_query_topics, ranking_reasons = _compute_query_relevance(
        course=course,
        params=params,
    )

    personalization = None
    personalization_score = 0.0

    if context is not None and context.personalization_enabled:
        evaluation = evaluate_course_discovery_fit(course=course, context=context)
        personalization = evaluation.personalization
        personalization_score = evaluation.final_score

        if personalization is not None and personalization.get("reason_codes"):
            ranking_reasons.extend(
                f"personalization:{code}"
                for code in personalization["reason_codes"][:8]
            )

    ranking_score, _ = _combine_search_and_personalization_scores(
        query_relevance_score=query_relevance_score,
        personalization_score=personalization_score,
        params=params,
        personalization_enabled=context.personalization_enabled if context is not None else False,
    )

    return RankedCourse(
        course=course,
        ranking_score=round(ranking_score, 2),
        query_relevance_score=round(query_relevance_score, 2),
        personalization_score=round(personalization_score, 2),
        matched_query_tokens=matched_query_tokens,
        matched_query_topics=matched_query_topics,
        ranking_reasons=ranking_reasons,
        personalization=personalization,
    )


def _sort_ranked_courses(
    ranked_courses: list[RankedCourse],
    sort_by: str,
) -> list[RankedCourse]:
    if sort_by in {"relevance", "personalized"}:
        return sorted(
            ranked_courses,
            key=lambda item: (
                item.ranking_score,
                item.personalization_score,
                item.query_relevance_score,
                item.course.quality_score or 0,
                item.course.published_at or item.course.created_at,
                item.course.id,
            ),
            reverse=True,
        )

    if sort_by == "newest":
        return sorted(
            ranked_courses,
            key=lambda item: (item.course.created_at, item.course.id),
            reverse=True,
        )

    if sort_by == "published":
        return sorted(
            ranked_courses,
            key=lambda item: (
                item.course.published_at or item.course.created_at,
                item.course.quality_score or 0,
                item.course.id,
            ),
            reverse=True,
        )

    if sort_by == "duration_short":
        return sorted(
            ranked_courses,
            key=lambda item: (
                item.course.duration_minutes_total is None,
                item.course.duration_minutes_total or 0,
                -(item.course.quality_score or 0),
                item.course.id,
            ),
        )

    if sort_by == "duration_long":
        return sorted(
            ranked_courses,
            key=lambda item: (
                item.course.duration_minutes_total or 0,
                item.course.quality_score or 0,
                item.course.id,
            ),
            reverse=True,
        )

    return sorted(
        ranked_courses,
        key=lambda item: (
            item.course.quality_score or 0,
            item.personalization_score,
            item.course.published_at or item.course.created_at,
            item.course.id,
        ),
        reverse=True,
    )


def _build_facet_bucket(
    value: str,
    count: int,
    selected_value: str | None,
    label_override: str | None = None,
) -> dict[str, Any]:
    return {
        "value": value,
        "label": label_override or _humanize_slug(value) or value,
        "count": count,
        "is_selected": value == selected_value,
    }


def _build_facets(courses: list[Course], params: NormalizedCourseSearchParams) -> dict[str, Any]:
    language_counter: Counter[str] = Counter()
    content_type_counter: Counter[str] = Counter()
    difficulty_counter: Counter[str] = Counter()
    pricing_counter: Counter[str] = Counter()
    progression_counter: Counter[str] = Counter()
    topic_counter: Counter[str] = Counter()

    for course in courses:
        if course.language:
            language_counter[course.language] += 1
        if course.content_type:
            content_type_counter[course.content_type] += 1
        if course.difficulty_level:
            difficulty_counter[course.difficulty_level] += 1
        if course.pricing_model:
            pricing_counter[course.pricing_model] += 1
        if course.progression_hint:
            progression_counter[course.progression_hint] += 1
        for topic_tag in course.topic_tags or []:
            topic_counter[topic_tag] += 1

    return {
        "languages": [
            _build_facet_bucket(value, count, params.language)
            for value, count in sorted(language_counter.items(), key=lambda item: (-item[1], item[0]))
        ],
        "content_types": [
            _build_facet_bucket(value, count, params.content_type, CONTENT_TYPE_LABELS.get(value))
            for value, count in sorted(content_type_counter.items(), key=lambda item: (-item[1], item[0]))
        ],
        "difficulty_levels": [
            _build_facet_bucket(value, count, params.difficulty_level, DIFFICULTY_LABELS.get(value))
            for value, count in sorted(difficulty_counter.items(), key=lambda item: (-item[1], item[0]))
        ],
        "pricing_models": [
            _build_facet_bucket(value, count, params.pricing_model, PRICING_LABELS.get(value))
            for value, count in sorted(pricing_counter.items(), key=lambda item: (-item[1], item[0]))
        ],
        "progression_hints": [
            _build_facet_bucket(value, count, params.progression_hint, PROGRESSION_LABELS.get(value))
            for value, count in sorted(progression_counter.items(), key=lambda item: (-item[1], item[0]))
        ],
        "topic_tags": [
            _build_facet_bucket(value, count, params.topic_tag)
            for value, count in sorted(topic_counter.items(), key=lambda item: (-item[1], item[0]))
        ],
    }


def _build_discovery_payload(
    ranked_course: RankedCourse,
    *,
    ranking_mode: str,
    personalization_enabled: bool,
) -> dict[str, Any]:
    return {
        "ranking_mode": ranking_mode,
        "ranking_score": ranked_course.ranking_score,
        "query_relevance_score": ranked_course.query_relevance_score,
        "personalization_score": ranked_course.personalization_score,
        "matched_query_tokens": ranked_course.matched_query_tokens,
        "matched_query_topics": ranked_course.matched_query_topics,
        "ranking_reasons": ranked_course.ranking_reasons,
        "personalization_applied": personalization_enabled and ranked_course.personalization is not None,
        "personalization_fit_reason": (
            ranked_course.personalization.get("fit_reason")
            if ranked_course.personalization is not None
            else None
        ),
    }


def search_courses(
    db: Session,
    params: CourseSearchParams,
    *,
    current_user_id: int | None = None,
) -> dict[str, Any]:
    normalized_params = normalize_course_search_params(params)
    context = load_discovery_context(db=db, user_id=current_user_id) if current_user_id is not None else None

    filtered_courses = _apply_database_filters(db=db, params=normalized_params).all()

    ranked_courses = [
        _build_ranked_course(
            course=course,
            params=normalized_params,
            context=context,
        )
        for course in filtered_courses
    ]
    ranked_courses = _sort_ranked_courses(ranked_courses, sort_by=normalized_params.sort_by)

    personalization_enabled = context.personalization_enabled if context is not None else False

    ranking_mode = _combine_search_and_personalization_scores(
        query_relevance_score=1.0 if normalized_params.q else 0.0,
        personalization_score=1.0 if personalization_enabled else 0.0,
        params=normalized_params,
        personalization_enabled=personalization_enabled,
    )[1]

    paged_ranked_courses = ranked_courses[
        normalized_params.offset : normalized_params.offset + normalized_params.limit
    ]

    personalization_by_course_id = {
        ranked.course.id: ranked.personalization
        for ranked in paged_ranked_courses
        if ranked.personalization is not None
    }

    discovery_by_course_id = {
        ranked.course.id: _build_discovery_payload(
            ranked,
            ranking_mode=ranking_mode,
            personalization_enabled=personalization_enabled,
        )
        for ranked in paged_ranked_courses
    }

    personalized_result_count = len(personalization_by_course_id)
    explanation_result_count = len(discovery_by_course_id)

    return {
        "items": build_course_cards(
            [ranked.course for ranked in paged_ranked_courses],
            personalization_by_course_id=personalization_by_course_id,
            discovery_by_course_id=discovery_by_course_id,
        ),
        "metadata": {
            "total": len(ranked_courses),
            "returned_count": len(paged_ranked_courses),
            "limit": normalized_params.limit,
            "offset": normalized_params.offset,
            "has_more": len(ranked_courses) > normalized_params.offset + len(paged_ranked_courses),
            "sort_by": normalized_params.sort_by,
            "ranking_mode": ranking_mode,
            "query_text": normalized_params.q,
            "query_tokens": normalized_params.query_tokens,
            "query_topics": normalized_params.query_topics,
            "query_difficulty_hint": normalized_params.query_difficulty_hint,
            "query_progression_hint": normalized_params.query_progression_hint,
            "personalization_enabled": personalization_enabled,
            "personalized_result_count": personalized_result_count,
            "explanation_result_count": explanation_result_count,
            "active_focus": context.learning_state.current_focus if context and context.learning_state else None,
            "primary_track": context.profile.primary_track if context and context.profile else None,
            "experience_level": context.profile.experience_level if context and context.profile else None,
        },
        "facets": _build_facets(filtered_courses, normalized_params),
        "applied_filters": {
            "q": normalized_params.q,
            "language": normalized_params.language,
            "content_type": normalized_params.content_type,
            "source": normalized_params.source,
            "difficulty_level": normalized_params.difficulty_level,
            "pricing_model": normalized_params.pricing_model,
            "progression_hint": normalized_params.progression_hint,
            "topic_tag": normalized_params.topic_tag,
            "sort_by": normalized_params.sort_by,
            "limit": normalized_params.limit,
            "offset": normalized_params.offset,
        },
    }