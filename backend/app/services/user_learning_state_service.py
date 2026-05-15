from collections import Counter
from sqlalchemy.orm import Session

from app.models.user_event import UserEvent
from app.models.user_learning_state import UserLearningState
from app.models.user_profile import UserProfile
from app.services.topic_intelligence import (
    build_background_seed_topics,
    extract_canonical_topics_from_text,
    top_topics,
)


SEARCH_EVENT_TYPES = {"search_performed"}
COURSE_INTERACTION_EVENT_TYPES = {
    "course_opened",
    "course_saved",
    "course_selected",
    "course_dismissed",
    "recommendation_clicked",
}

def get_user_learning_state(db: Session, user_id: int) -> UserLearningState | None:
    return (
        db.query(UserLearningState)
        .filter(UserLearningState.user_id == user_id)
        .first()
    )


def _resolve_primary_track(profile: UserProfile) -> str:
    return profile.primary_track or profile.background_track


def _resolve_secondary_tracks(profile: UserProfile) -> list[str]:
    return list(profile.secondary_tracks or [])


def infer_interests_from_events_and_profile(
    profile: UserProfile | None,
    events: list[UserEvent],
) -> tuple[list[str], list[str], str | None, list[str], dict[str, int], dict]:
    weighted_topics: list[str] = []
    search_topics: list[str] = []
    selected_topics: list[str] = []
    opened_topics: list[str] = []
    profile_topics: list[str] = []

    if profile:
        primary_track = _resolve_primary_track(profile)
        secondary_tracks = _resolve_secondary_tracks(profile)

        primary_track_topics = build_background_seed_topics(primary_track)
        secondary_track_topics: list[str] = []
        for track in secondary_tracks:
            secondary_track_topics.extend(build_background_seed_topics(track))

        profile_topics.extend(primary_track_topics)
        profile_topics.extend(primary_track_topics)
        profile_topics.extend(secondary_track_topics)

        profile_topics.extend(extract_canonical_topics_from_text(profile.education_major))
        profile_topics.extend(extract_canonical_topics_from_text(profile.target_role))
        profile_topics.extend(extract_canonical_topics_from_text(profile.bio))

    for topic in profile_topics:
        weighted_topics.append(topic)

    for event in events:
        payload = event.event_payload or {}

        if event.event_type in SEARCH_EVENT_TYPES:
            query = payload.get("query", "")
            topics = extract_canonical_topics_from_text(query)
            search_topics.extend(topics)
            for topic in topics:
                weighted_topics.extend([topic, topic, topic])

        elif event.event_type in COURSE_INTERACTION_EVENT_TYPES:
            course_title = payload.get("course_title", "")
            topics = extract_canonical_topics_from_text(course_title)

            if event.event_type == "course_selected":
                selected_topics.extend(topics)
                for topic in topics:
                    weighted_topics.extend([topic, topic, topic, topic])

            elif event.event_type == "course_opened":
                opened_topics.extend(topics)
                for topic in topics:
                    weighted_topics.extend([topic, topic])

            else:
                weighted_topics.extend(topics)

        elif event.event_type == "assistant_memory_signal_confirmed":
            signal_type = payload.get("signal_type")
            signal_value = payload.get("signal_value") or {}
            signal_topics: list[str] = []

            if signal_type == "learning_support_signal":
                concept = signal_value.get("concept")
                if concept:
                    signal_topics.extend(extract_canonical_topics_from_text(concept))

            for topic in signal_topics:
                weighted_topics.extend([topic, topic, topic])
                search_topics.append(topic)

    dominant_interests = top_topics(weighted_topics, 5)
    emerging_interests = top_topics(search_topics, 3)

    current_focus = None
    if emerging_interests:
        current_focus = emerging_interests[0]
    elif selected_topics:
        selected_ranked = top_topics(selected_topics, 3)
        current_focus = selected_ranked[0] if selected_ranked else None
    elif dominant_interests:
        current_focus = dominant_interests[0]

    familiarity_counter: Counter[str] = Counter()
    familiarity_counter.update(profile_topics)
    familiarity_counter.update(search_topics)
    familiarity_counter.update(opened_topics)
    familiarity_counter.update(opened_topics)
    familiarity_counter.update(selected_topics)
    familiarity_counter.update(selected_topics)
    familiarity_counter.update(selected_topics)

    covered_topics = [
        topic
        for topic, count in familiarity_counter.items()
        if count >= 3
    ]

    topic_families = {
        "search_topics": top_topics(search_topics, 5),
        "selected_topics": top_topics(selected_topics, 5),
        "opened_topics": top_topics(opened_topics, 5),
        "profile_topics": top_topics(profile_topics, 5),
    }

    return (
        dominant_interests,
        emerging_interests,
        current_focus,
        covered_topics,
        dict(familiarity_counter),
        topic_families,
    )


def infer_preferred_content_type(events: list[UserEvent]) -> str | None:
    counter: Counter[str] = Counter()

    for event in events:
        payload = event.event_payload or {}
        content_type = payload.get("content_type")
        if content_type:
            counter.update([content_type])

    if not counter:
        return None

    return counter.most_common(1)[0][0]


def infer_preferred_course_length(profile: UserProfile | None, events: list[UserEvent]) -> str | None:
    explicit_counter: Counter[str] = Counter()

    for event in events:
        payload = event.event_payload or {}
        value = payload.get("course_length_category")
        if value in {"short", "medium", "long"}:
            explicit_counter.update([value])

    if explicit_counter:
        return explicit_counter.most_common(1)[0][0]

    if not profile:
        return None

    weekly_hours = profile.weekly_hours
    if weekly_hours <= 4:
        return "short"
    if weekly_hours <= 8:
        return "medium"

    return "long"


def infer_effective_preferred_language(profile: UserProfile | None) -> str | None:
    if not profile:
        return None

    return profile.preferred_language


def compute_engagement_score(events: list[UserEvent]) -> int:
    score = 0

    for event in events:
        if event.event_type == "search_performed":
            score += 2
        elif event.event_type == "course_opened":
            score += 3
        elif event.event_type == "course_selected":
            score += 5
        elif event.event_type == "course_saved":
            score += 4
        elif event.event_type == "recommendation_clicked":
            score += 3
        elif event.event_type == "profile_updated":
            score += 2
        elif event.event_type == "onboarding_completed":
            score += 2
        else:
            score += 1

    return score


def build_source_event_summary(events: list[UserEvent]) -> dict:
    event_type_counter: Counter[str] = Counter(event.event_type for event in events)

    recent_searches = []
    selected_courses = []

    for event in events:
        payload = event.event_payload or {}

        if event.event_type == "search_performed":
            query = payload.get("query")
            if query:
                recent_searches.append(query)

        if event.event_type == "course_selected":
            course_id = payload.get("course_id")
            if course_id is not None:
                selected_courses.append(course_id)

    confirmed_signal_keys = []
    for event in events:
        payload = event.event_payload or {}
        if event.event_type == "assistant_memory_signal_confirmed":
            signal_key = payload.get("signal_key")
            if signal_key:
                confirmed_signal_keys.append(signal_key)

    return {
        "total_events": len(events),
        "event_type_counts": dict(event_type_counter),
        "recent_searches": recent_searches[-5:],
        "selected_course_ids": selected_courses[-10:],
        "confirmed_assistant_signal_keys": confirmed_signal_keys[-10:],
    }


def build_profile_alignment(profile: UserProfile | None) -> dict:
    if not profile:
        return {}

    return {
        "background_track": profile.background_track,
        "primary_track": profile.primary_track,
        "secondary_tracks": list(profile.secondary_tracks or []),
        "target_role": profile.target_role,
        "experience_level": profile.experience_level,
        "goal": profile.goal,
        "weekly_hours": profile.weekly_hours,
        "preferred_language": profile.preferred_language,
    }


def refresh_user_learning_state(db: Session, user_id: int) -> UserLearningState:
    profile = (
        db.query(UserProfile)
        .filter(UserProfile.user_id == user_id)
        .first()
    )

    events = (
        db.query(UserEvent)
        .filter(UserEvent.user_id == user_id)
        .order_by(UserEvent.id.asc())
        .all()
    )

    (
        dominant_interests,
        emerging_interests,
        current_focus,
        covered_topics,
        topic_familiarity,
        topic_families,
    ) = infer_interests_from_events_and_profile(
        profile=profile,
        events=events,
    )

    preferred_content_type = infer_preferred_content_type(events)
    preferred_course_length = infer_preferred_course_length(
        profile=profile,
        events=events,
    )
    effective_preferred_language = infer_effective_preferred_language(profile)
    engagement_score = compute_engagement_score(events)

    profile_snapshot = {}
    if profile:
        profile_snapshot = {
            "background_track": profile.background_track,
            "primary_track": profile.primary_track,
            "secondary_tracks": list(profile.secondary_tracks or []),
            "target_role": profile.target_role,
            "experience_level": profile.experience_level,
            "employment_status": profile.employment_status,
            "is_student": profile.is_student,
            "education_major": profile.education_major,
            "weekly_hours": profile.weekly_hours,
            "goal": profile.goal,
            "preferred_language": profile.preferred_language,
            "bio": profile.bio,
            "timezone": profile.timezone,
        }

    event_summary = build_source_event_summary(events)
    profile_alignment = build_profile_alignment(profile)

    learning_state = get_user_learning_state(db, user_id)

    if not learning_state:
        learning_state = UserLearningState(user_id=user_id)
        db.add(learning_state)

    learning_state.dominant_interests = dominant_interests
    learning_state.emerging_interests = emerging_interests
    learning_state.covered_topics = covered_topics
    learning_state.topic_familiarity = topic_familiarity
    learning_state.topic_families = topic_families
    learning_state.current_focus = current_focus
    learning_state.preferred_content_type = preferred_content_type
    learning_state.preferred_course_length = preferred_course_length
    learning_state.effective_preferred_language = effective_preferred_language
    learning_state.engagement_score = engagement_score
    learning_state.source_profile_snapshot = profile_snapshot
    learning_state.source_event_summary = event_summary
    learning_state.profile_alignment = profile_alignment

    db.commit()
    db.refresh(learning_state)

    return learning_state