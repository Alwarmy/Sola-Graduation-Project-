from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.exceptions import ConflictException, NotFoundException, ValidationException
from app.core.timezone_utils import resolve_effective_timezone
from app.models.user_profile import UserProfile
from app.schemas.user_profile import (
    BACKGROUND_TRACK_OPTIONS,
    EMPLOYMENT_STATUS_OPTIONS,
    EXPERIENCE_LEVEL_OPTIONS,
    GOAL_OPTIONS,
    PREFERRED_LANGUAGE_OPTIONS,
    TRACK_OPTIONS,
    UserProfileCreate,
    UserProfileUpdate,
)
from app.services.user_learning_state_service import refresh_user_learning_state


def validate_user_profile_payload(
    *,
    background_track: str,
    primary_track: str | None,
    secondary_tracks: list[str],
    target_role: str | None,
    experience_level: str | None,
    employment_status: str,
    goal: str,
    preferred_language: str,
) -> None:
    if background_track not in BACKGROUND_TRACK_OPTIONS:
        raise ValidationException("Invalid background_track.")

    if primary_track is not None and primary_track not in TRACK_OPTIONS:
        raise ValidationException("Invalid primary_track.")

    invalid_secondary_tracks = [
        track for track in secondary_tracks
        if track not in TRACK_OPTIONS
    ]
    if invalid_secondary_tracks:
        raise ValidationException("Invalid secondary_tracks.")

    if len(secondary_tracks) != len(set(secondary_tracks)):
        raise ValidationException("secondary_tracks must be unique.")

    resolved_primary_track = primary_track or background_track
    if resolved_primary_track in secondary_tracks:
        raise ValidationException("secondary_tracks cannot include primary_track.")

    if target_role is not None and len(target_role.strip()) > 120:
        raise ValidationException("target_role is too long.")

    if experience_level is not None and experience_level not in EXPERIENCE_LEVEL_OPTIONS:
        raise ValidationException("Invalid experience_level.")

    if employment_status not in EMPLOYMENT_STATUS_OPTIONS:
        raise ValidationException("Invalid employment_status.")

    if goal not in GOAL_OPTIONS:
        raise ValidationException("Invalid goal.")

    if preferred_language not in PREFERRED_LANGUAGE_OPTIONS:
        raise ValidationException("Invalid preferred_language.")


def get_user_profile(db: Session, user_id: int) -> UserProfile | None:
    return (
        db.query(UserProfile)
        .filter(UserProfile.user_id == user_id)
        .first()
    )


def _normalize_primary_track(
    background_track: str,
    primary_track: str | None,
) -> str:
    return primary_track or background_track


def _normalize_secondary_tracks(
    secondary_tracks: list[str] | None,
) -> list[str]:
    if not secondary_tracks:
        return []

    normalized: list[str] = []
    seen: set[str] = set()

    for track in secondary_tracks:
        cleaned = track.strip()
        if cleaned and cleaned not in seen:
            normalized.append(cleaned)
            seen.add(cleaned)

    return normalized


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None

    cleaned = value.strip()
    return cleaned or None


def create_user_profile(
    db: Session,
    user_id: int,
    payload: UserProfileCreate,
) -> UserProfile:
    existing_profile = get_user_profile(db, user_id)
    if existing_profile:
        raise ConflictException("User profile already exists.")

    resolved_primary_track = _normalize_primary_track(
        background_track=payload.background_track,
        primary_track=payload.primary_track,
    )
    normalized_secondary_tracks = _normalize_secondary_tracks(payload.secondary_tracks)
    normalized_target_role = _normalize_optional_text(payload.target_role)

    validate_user_profile_payload(
        background_track=payload.background_track,
        primary_track=resolved_primary_track,
        secondary_tracks=normalized_secondary_tracks,
        target_role=normalized_target_role,
        experience_level=payload.experience_level,
        employment_status=payload.employment_status,
        goal=payload.goal,
        preferred_language=payload.preferred_language,
    )

    try:
        resolved_timezone = resolve_effective_timezone(payload.timezone)
    except ValueError as exc:
        raise ValidationException(str(exc)) from exc

    profile = UserProfile(
        user_id=user_id,
        background_track=resolved_primary_track,
        primary_track=resolved_primary_track,
        secondary_tracks=normalized_secondary_tracks,
        target_role=normalized_target_role,
        experience_level=payload.experience_level,
        employment_status=payload.employment_status,
        is_student=payload.is_student,
        education_major=_normalize_optional_text(payload.education_major),
        weekly_hours=payload.weekly_hours,
        goal=payload.goal,
        preferred_language=payload.preferred_language,
        bio=_normalize_optional_text(payload.bio),
        timezone=resolved_timezone,
    )

    db.add(profile)
    db.commit()
    db.refresh(profile)

    refresh_user_learning_state(db=db, user_id=user_id)

    return profile


def update_user_profile(
    db: Session,
    user_id: int,
    payload: UserProfileUpdate,
) -> UserProfile:
    profile = get_user_profile(db, user_id)
    if not profile:
        raise NotFoundException("User profile not found.")

    resolved_primary_track = _normalize_primary_track(
        background_track=payload.background_track,
        primary_track=payload.primary_track,
    )
    normalized_secondary_tracks = _normalize_secondary_tracks(payload.secondary_tracks)
    normalized_target_role = _normalize_optional_text(payload.target_role)

    validate_user_profile_payload(
        background_track=payload.background_track,
        primary_track=resolved_primary_track,
        secondary_tracks=normalized_secondary_tracks,
        target_role=normalized_target_role,
        experience_level=payload.experience_level,
        employment_status=payload.employment_status,
        goal=payload.goal,
        preferred_language=payload.preferred_language,
    )

    try:
        resolved_timezone = resolve_effective_timezone(payload.timezone or profile.timezone)
    except ValueError as exc:
        raise ValidationException(str(exc)) from exc

    profile.background_track = resolved_primary_track
    profile.primary_track = resolved_primary_track
    profile.secondary_tracks = normalized_secondary_tracks
    profile.target_role = normalized_target_role
    profile.experience_level = payload.experience_level
    profile.employment_status = payload.employment_status
    profile.is_student = payload.is_student
    profile.education_major = _normalize_optional_text(payload.education_major)
    profile.weekly_hours = payload.weekly_hours
    profile.goal = payload.goal
    profile.preferred_language = payload.preferred_language
    profile.bio = _normalize_optional_text(payload.bio)
    profile.timezone = resolved_timezone

    db.commit()
    db.refresh(profile)

    refresh_user_learning_state(db=db, user_id=user_id)

    return profile
