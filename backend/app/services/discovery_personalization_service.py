from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.models.course import Course
from app.models.user_event import UserEvent
from app.models.user_learning_state import UserLearningState
from app.models.user_profile import UserProfile
from app.services.topic_intelligence import (
    build_background_seed_topics,
    extract_canonical_topics_from_text,
    tokenize_text,
)


HISTORY_EVENT_TYPES = {
    "course_opened",
    "course_saved",
    "course_selected",
}

MIN_RECOMMENDATION_SCORE = 20.0

FOCUS_CONFLICT_MAP = {
    "python": {"java", "spring"},
    "java": {"python", "django", "flask"},
    "react": {"java", "spring"},
    "machine_learning": {"java"},
    "deep_learning": {"java"},
    "generative_ai": {"java"},
    "ai": {"java"},
}


@dataclass(slots=True)
class DiscoveryContext:
    profile: UserProfile | None
    learning_state: UserLearningState | None
    history: dict[str, Any]

    @property
    def personalization_enabled(self) -> bool:
        return self.profile is not None or self.learning_state is not None


@dataclass(slots=True)
class CourseDiscoveryEvaluation:
    final_score: float
    personalization: dict[str, Any] | None
    history_details: dict[str, Any]
    matched_topics: list[str]
    matched_focus: str | None


EMPTY_HISTORY = {
    "selected_course_ids": set(),
    "opened_course_ids": set(),
    "history_title_topics": Counter(),
}


def build_course_text_topics(course: Course) -> set[str]:
    topics = set(course.topic_tags or [])
    topics.update(extract_canonical_topics_from_text(course.title))
    topics.update(extract_canonical_topics_from_text(course.description))
    topics.update(extract_canonical_topics_from_text(course.channel_title))
    topics.update(extract_canonical_topics_from_text(course.instructor_name))
    return topics


def build_course_title_topics(course: Course) -> set[str]:
    topics = set(course.topic_tags or [])
    topics.update(extract_canonical_topics_from_text(course.title))
    return topics


def get_user_course_history(db: Session, user_id: int) -> dict[str, Any]:
    events = (
        db.query(UserEvent)
        .filter(UserEvent.user_id == user_id)
        .filter(UserEvent.event_type.in_(HISTORY_EVENT_TYPES))
        .order_by(UserEvent.id.asc())
        .all()
    )

    selected_course_ids: set[int] = set()
    opened_course_ids: set[int] = set()
    history_title_topics: Counter[str] = Counter()

    for event in events:
        payload = event.event_payload or {}
        course_id = payload.get("course_id")
        course_title = payload.get("course_title", "")

        if event.event_type == "course_selected" and course_id is not None:
            selected_course_ids.add(int(course_id))

        if event.event_type == "course_opened" and course_id is not None:
            opened_course_ids.add(int(course_id))

        history_title_topics.update(extract_canonical_topics_from_text(course_title))

    return {
        "selected_course_ids": selected_course_ids,
        "opened_course_ids": opened_course_ids,
        "history_title_topics": history_title_topics,
    }


def load_discovery_context(db: Session, user_id: int | None) -> DiscoveryContext:
    if user_id is None:
        return DiscoveryContext(
            profile=None,
            learning_state=None,
            history=EMPTY_HISTORY.copy(),
        )

    profile = (
        db.query(UserProfile)
        .filter(UserProfile.user_id == user_id)
        .first()
    )
    learning_state = (
        db.query(UserLearningState)
        .filter(UserLearningState.user_id == user_id)
        .first()
    )

    return DiscoveryContext(
        profile=profile,
        learning_state=learning_state,
        history=get_user_course_history(db=db, user_id=user_id),
    )


def calculate_topic_match_score(course: Course, learning_state: UserLearningState | None) -> tuple[float, list[str]]:
    if not learning_state:
        return 0.0, []

    all_topics = build_course_text_topics(course)
    title_topics = build_course_title_topics(course)

    dominant_topics = set(learning_state.dominant_interests or [])
    emerging_topics = set(learning_state.emerging_interests or [])

    matched_dominant_title = sorted(title_topics.intersection(dominant_topics))
    matched_emerging_title = sorted(title_topics.intersection(emerging_topics))
    matched_dominant_all = sorted(all_topics.intersection(dominant_topics))
    matched_emerging_all = sorted(all_topics.intersection(emerging_topics))

    score = 0.0
    score += min(len(matched_emerging_title) * 22.0, 44.0)
    score += min(len(matched_dominant_title) * 16.0, 32.0)
    score += min(max(len(matched_emerging_all) - len(matched_emerging_title), 0) * 6.0, 12.0)
    score += min(max(len(matched_dominant_all) - len(matched_dominant_title), 0) * 4.0, 8.0)

    matched_topics = sorted(set(matched_dominant_all + matched_emerging_all))
    return score, matched_topics


def calculate_track_alignment_score(course: Course, profile: UserProfile | None) -> tuple[float, dict[str, list[str]]]:
    if not profile:
        return 0.0, {"primary_track_matches": [], "secondary_track_matches": []}

    primary_track = profile.primary_track or profile.background_track
    secondary_tracks = list(profile.secondary_tracks or [])

    course_topics = build_course_text_topics(course)
    primary_track_topics = set(build_background_seed_topics(primary_track))
    secondary_track_topics: set[str] = set()
    for track in secondary_tracks:
        secondary_track_topics.update(build_background_seed_topics(track))

    primary_track_matches = sorted(course_topics.intersection(primary_track_topics))
    secondary_track_matches = sorted(course_topics.intersection(secondary_track_topics))

    score = 0.0
    score += min(len(primary_track_matches) * 12.0, 24.0)
    score += min(len(secondary_track_matches) * 5.0, 10.0)

    return score, {
        "primary_track_matches": primary_track_matches,
        "secondary_track_matches": secondary_track_matches,
    }


def calculate_experience_alignment_score(course: Course, profile: UserProfile | None) -> tuple[float, str | None]:
    if not profile or not profile.experience_level or not course.difficulty_level:
        return 0.0, None

    experience_level = profile.experience_level
    difficulty_level = course.difficulty_level

    if experience_level == "beginner":
        if difficulty_level == "beginner":
            return 10.0, "beginner_aligned"
        if difficulty_level == "intermediate":
            return 4.0, "stretch_but_viable"
        return -8.0, "too_advanced"

    if experience_level == "intermediate":
        if difficulty_level == "intermediate":
            return 10.0, "intermediate_aligned"
        if difficulty_level == "advanced":
            return 4.0, "growth_oriented"
        return 3.0, "foundation_refresh"

    if experience_level == "advanced":
        if difficulty_level == "advanced":
            return 10.0, "advanced_aligned"
        if difficulty_level == "intermediate":
            return 5.0, "solid_reinforcement"
        return -6.0, "too_basic"

    return 0.0, None


def calculate_language_score(course: Course, profile: UserProfile | None, learning_state: UserLearningState | None) -> float:
    preferred_language = None

    if learning_state and learning_state.effective_preferred_language:
        preferred_language = learning_state.effective_preferred_language
    elif profile:
        preferred_language = profile.preferred_language

    if not preferred_language or preferred_language == "any":
        return 10.0

    if course.language == preferred_language:
        return 18.0

    return 0.0


def calculate_content_type_score(course: Course, learning_state: UserLearningState | None) -> float:
    if not learning_state or not learning_state.preferred_content_type:
        return 0.0

    if course.content_type == learning_state.preferred_content_type:
        return 12.0

    return 0.0


def calculate_length_score(course: Course, learning_state: UserLearningState | None) -> float:
    if not learning_state or not learning_state.preferred_course_length:
        return 0.0

    title_tokens = set(tokenize_text(course.title))
    preference = learning_state.preferred_course_length

    if preference == "short":
        if "crash" in title_tokens or "quick" in title_tokens:
            return 10.0
        if course.duration_minutes_total and course.duration_minutes_total <= 90:
            return 8.0
        return 3.0

    if preference == "medium":
        if course.duration_minutes_total and 90 < course.duration_minutes_total <= 360:
            return 10.0
        return 8.0

    if preference == "long":
        if course.content_type == "playlist" or "bootcamp" in title_tokens or "masterclass" in title_tokens:
            return 12.0
        if course.duration_minutes_total and course.duration_minutes_total >= 360:
            return 10.0
        return 5.0

    return 0.0


def calculate_quality_score(course: Course) -> float:
    if course.quality_score is not None:
        return min(course.quality_score / 5.0, 20.0)

    score = 0.0
    score += 10.0 if course.content_type == "playlist" else 7.0

    if course.language in {"ar", "en"}:
        score += 5.0

    if course.provider == "youtube":
        score += 3.0

    return score


def calculate_history_penalty(course: Course, history: dict[str, Any]) -> tuple[float, dict[str, Any]]:
    selected_course_ids = history["selected_course_ids"]
    opened_course_ids = history["opened_course_ids"]
    history_title_topics: Counter[str] = history["history_title_topics"]

    already_selected = course.id in selected_course_ids

    course_topics = build_course_text_topics(course)
    overlap_topics = sorted(
        topic for topic in course_topics
        if history_title_topics.get(topic, 0) > 0
    )

    penalty = 0.0

    if already_selected:
        penalty -= 1000.0

    if course.id in opened_course_ids:
        penalty -= 8.0

    penalty -= min(len(overlap_topics) * 2.5, 15.0)

    return penalty, {
        "already_selected": already_selected,
        "already_opened": course.id in opened_course_ids,
        "title_overlap_topics": overlap_topics[:8],
    }


def calculate_wrong_topic_penalty(course: Course, learning_state: UserLearningState | None) -> tuple[float, str | None]:
    if not learning_state or not learning_state.current_focus:
        return 0.0, None

    focus = learning_state.current_focus
    title_topics = build_course_title_topics(course)

    conflicting_topics = FOCUS_CONFLICT_MAP.get(focus, set())
    matched_conflicts = sorted(title_topics.intersection(conflicting_topics))

    if matched_conflicts:
        return -30.0, matched_conflicts[0]

    return 0.0, None


def calculate_covered_topic_penalty(course: Course, learning_state: UserLearningState | None) -> tuple[float, list[str]]:
    if not learning_state:
        return 0.0, []

    course_title_topics = build_course_title_topics(course)
    covered_topics = set(learning_state.covered_topics or [])

    overlap = sorted(course_title_topics.intersection(covered_topics))
    if not overlap:
        return 0.0, []

    penalty = min(len(overlap) * 6.0, 18.0)
    return -penalty, overlap


def determine_fit_label(final_score: float) -> str:
    if final_score >= 80:
        return "excellent_fit"
    if final_score >= 60:
        return "strong_fit"
    if final_score >= 40:
        return "good_fit"
    return "possible_fit"


def determine_matched_focus(course: Course, learning_state: UserLearningState | None) -> str | None:
    if not learning_state:
        return None

    title_topics = build_course_title_topics(course)
    ordered_targets: list[str] = []

    if learning_state.current_focus:
        ordered_targets.append(learning_state.current_focus)

    ordered_targets.extend(learning_state.emerging_interests or [])
    ordered_targets.extend(learning_state.dominant_interests or [])

    seen: set[str] = set()
    deduped_targets: list[str] = []
    for topic in ordered_targets:
        if topic and topic not in seen:
            seen.add(topic)
            deduped_targets.append(topic)

    for topic in deduped_targets:
        if topic in title_topics:
            return topic

    return None


def build_recommendation_personalization(
    *,
    topic_matches: list[str],
    track_alignment_details: dict[str, list[str]],
    language_score: float,
    content_type_score: float,
    length_score: float,
    quality_score: float,
    history_penalty: float,
    history_details: dict[str, Any],
    wrong_topic_penalty: float,
    wrong_topic_token: str | None,
    covered_topic_penalty: float,
    covered_topic_overlap: list[str],
    experience_alignment_score: float,
    experience_alignment_label: str | None,
    track_alignment_score: float,
    final_score: float,
    matched_focus: str | None,
    profile: UserProfile | None,
    learning_state: UserLearningState | None,
) -> dict[str, Any]:
    reason_codes: list[str] = []

    if topic_matches:
        reason_codes.append("topic_match")
    if matched_focus:
        reason_codes.append("focus_match")
    if track_alignment_score > 0:
        reason_codes.append("track_alignment")
    if experience_alignment_score > 0:
        reason_codes.append("experience_alignment")
    if language_score > 0:
        reason_codes.append("language_fit")
    if content_type_score > 0:
        reason_codes.append("content_type_fit")
    if length_score > 0:
        reason_codes.append("length_fit")
    if quality_score > 0:
        reason_codes.append("quality_fit")
    if history_penalty < 0:
        reason_codes.append("history_penalty")
    if wrong_topic_penalty < 0:
        reason_codes.append("wrong_topic_penalty")
    if covered_topic_penalty < 0:
        reason_codes.append("covered_topic_penalty")
    if experience_alignment_score < 0:
        reason_codes.append("experience_mismatch")

    why_now: list[str] = []
    if matched_focus:
        why_now.append(f"Matches active focus: {matched_focus}.")
    elif topic_matches:
        why_now.append(f"Matches important topics: {', '.join(topic_matches[:3])}.")

    primary_track_matches = track_alignment_details.get("primary_track_matches") or []
    secondary_track_matches = track_alignment_details.get("secondary_track_matches") or []
    if primary_track_matches:
        why_now.append(f"Aligned with your primary track through: {', '.join(primary_track_matches[:3])}.")
    elif secondary_track_matches:
        why_now.append(f"Supports one of your secondary tracks: {', '.join(secondary_track_matches[:3])}.")

    if experience_alignment_label == "beginner_aligned":
        why_now.append("Difficulty is well aligned with your current experience level.")
    elif experience_alignment_label == "intermediate_aligned":
        why_now.append("Difficulty matches your intermediate learning stage.")
    elif experience_alignment_label == "advanced_aligned":
        why_now.append("Difficulty is suitable for advanced progression.")
    elif experience_alignment_label == "stretch_but_viable":
        why_now.append("This is slightly above your current level but still a viable stretch.")
    elif experience_alignment_label == "growth_oriented":
        why_now.append("This can help you move toward a stronger next level.")

    if learning_state and learning_state.emerging_interests:
        why_now.append(
            f"Aligned with recent interest trend: {', '.join((learning_state.emerging_interests or [])[:2])}."
        )

    if profile and profile.goal:
        why_now.append(f"Aligned with goal: {profile.goal}.")

    fit_reason = why_now[0] if why_now else None

    return {
        "fit_label": determine_fit_label(final_score),
        "fit_score": round(final_score, 2),
        "matched_focus": matched_focus,
        "fit_reason": fit_reason,
        "reason_codes": reason_codes,
        "why_now": why_now,
        "matched_topics": topic_matches,
        "covered_topic_overlap": covered_topic_overlap,
        "score_breakdown": {
            "language_score": round(language_score, 2),
            "content_type_score": round(content_type_score, 2),
            "length_score": round(length_score, 2),
            "quality_score": round(quality_score, 2),
            "track_alignment_score": round(track_alignment_score, 2),
            "experience_alignment_score": round(experience_alignment_score, 2),
            "history_penalty": round(history_penalty, 2),
            "wrong_topic_penalty": round(wrong_topic_penalty, 2),
            "covered_topic_penalty": round(covered_topic_penalty, 2),
        },
        "history_details": {
            **history_details,
            "wrong_topic_token": wrong_topic_token,
            "experience_alignment_label": experience_alignment_label,
            "track_alignment_details": track_alignment_details,
        },
        "profile_alignment": {
            "goal": profile.goal if profile else None,
            "preferred_language": profile.preferred_language if profile else None,
            "primary_track": profile.primary_track if profile else None,
            "secondary_tracks": list(profile.secondary_tracks or []) if profile else [],
            "experience_level": profile.experience_level if profile else None,
        },
    }


def evaluate_course_discovery_fit(course: Course, context: DiscoveryContext) -> CourseDiscoveryEvaluation:
    if not context.personalization_enabled:
        return CourseDiscoveryEvaluation(
            final_score=0.0,
            personalization=None,
            history_details={
                "already_selected": False,
                "already_opened": False,
                "title_overlap_topics": [],
            },
            matched_topics=[],
            matched_focus=None,
        )

    topic_match_score, topic_matches = calculate_topic_match_score(course, context.learning_state)
    track_alignment_score, track_alignment_details = calculate_track_alignment_score(course, context.profile)
    experience_alignment_score, experience_alignment_label = calculate_experience_alignment_score(course, context.profile)
    language_score = calculate_language_score(course, context.profile, context.learning_state)
    content_type_score = calculate_content_type_score(course, context.learning_state)
    length_score = calculate_length_score(course, context.learning_state)
    quality_score = calculate_quality_score(course)
    history_penalty, history_details = calculate_history_penalty(course, context.history)
    wrong_topic_penalty, wrong_topic_token = calculate_wrong_topic_penalty(course, context.learning_state)
    covered_topic_penalty, covered_topic_overlap = calculate_covered_topic_penalty(course, context.learning_state)

    final_score = (
        topic_match_score
        + track_alignment_score
        + experience_alignment_score
        + language_score
        + content_type_score
        + length_score
        + quality_score
        + history_penalty
        + wrong_topic_penalty
        + covered_topic_penalty
    )

    matched_focus = determine_matched_focus(course, context.learning_state)
    personalization = build_recommendation_personalization(
        topic_matches=topic_matches,
        track_alignment_details=track_alignment_details,
        language_score=language_score,
        content_type_score=content_type_score,
        length_score=length_score,
        quality_score=quality_score,
        history_penalty=history_penalty,
        history_details=history_details,
        wrong_topic_penalty=wrong_topic_penalty,
        wrong_topic_token=wrong_topic_token,
        covered_topic_penalty=covered_topic_penalty,
        covered_topic_overlap=covered_topic_overlap,
        experience_alignment_score=experience_alignment_score,
        experience_alignment_label=experience_alignment_label,
        track_alignment_score=track_alignment_score,
        final_score=final_score,
        matched_focus=matched_focus,
        profile=context.profile,
        learning_state=context.learning_state,
    )

    return CourseDiscoveryEvaluation(
        final_score=round(final_score, 2),
        personalization=personalization,
        history_details=history_details,
        matched_topics=topic_matches,
        matched_focus=matched_focus,
    )