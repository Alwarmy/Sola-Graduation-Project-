import html
import re
from typing import Any

from sqlalchemy.orm import Session

from app.models.course import Course
from app.models.raw_course import RawCourse
from app.services.ai import validate_course_candidates
from app.services.youtube_service import get_playlist_details, get_video_details


COURSE_KEYWORDS = [
    "course",
    "full course",
    "tutorial",
    "bootcamp",
    "learn",
    "beginner",
    "complete",
]

NON_TARGET_LANGUAGE_KEYWORDS = [
    "hindi",
    "urdu",
    "bangla",
    "bengali",
    "telugu",
    "tamil",
    "malayalam",
    "kannada",
    "amharic",
]

BEGINNER_KEYWORDS = [
    "beginner",
    "beginners",
    "for beginners",
    "absolute beginner",
    "introduction",
    "intro",
    "fundamentals",
    "basics",
    "getting started",
    "zero to hero",
]

INTERMEDIATE_KEYWORDS = [
    "intermediate",
    "practical",
    "applied",
    "project",
    "real world",
    "hands-on",
]

ADVANCED_KEYWORDS = [
    "advanced",
    "expert",
    "masterclass",
    "production",
    "architecture",
    "internals",
    "optimization",
]

TOPIC_TAG_PATTERNS: list[tuple[str, list[str]]] = [
    ("python", ["python"]),
    ("machine_learning", ["machine learning", "ml", "scikit-learn", "scikit learn"]),
    ("data_science", ["data science", "data analysis"]),
    ("deep_learning", ["deep learning", "neural network", "neural networks"]),
    ("sql", ["sql", "postgresql", "mysql", "sqlite"]),
    ("javascript", ["javascript", "js"]),
    ("typescript", ["typescript"]),
    ("react", ["react"]),
    ("nodejs", ["node.js", "nodejs", "node js"]),
    ("backend", ["backend", "back-end", "api", "fastapi", "flask", "django"]),
    ("frontend", ["frontend", "front-end", "html", "css"]),
    ("devops", ["devops", "docker", "kubernetes", "terraform", "ci/cd"]),
    ("cloud", ["cloud", "aws", "azure", "gcp", "google cloud"]),
]

REJECTION_NON_TARGET_LANGUAGE = "non_target_language"
REJECTION_TOO_SHORT = "too_short"
REJECTION_NOT_COURSE_LIKE = "not_course_like"
REJECTION_DUPLICATE = "duplicate"
REJECTION_TOO_SMALL_PLAYLIST = "too_small_playlist"
REJECTION_AI_VALIDATION_FAILED = "ai_validation_failed"

DEFAULT_PLAYLIST_UNIT_MINUTES = 15
MIN_PLAYLIST_ESTIMATED_DURATION_MINUTES = 45


def clean_text(value: str | None) -> str:
    if not value:
        return ""

    cleaned = html.unescape(value)
    cleaned = cleaned.replace("\u200b", " ").replace("\ufeff", " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def detect_language(text: str) -> str | None:
    if not text:
        return None

    arabic_chars = re.findall(r"[\u0600-\u06FF]", text)
    english_chars = re.findall(r"[A-Za-z]", text)

    if len(arabic_chars) > len(english_chars) and len(arabic_chars) > 0:
        return "ar"

    if len(english_chars) > 0:
        return "en"

    return None


def contains_explicit_non_target_language(
    title: str,
    description: str,
    channel_title: str,
) -> bool:
    text = f"{title} {description} {channel_title}".lower()
    return any(keyword in text for keyword in NON_TARGET_LANGUAGE_KEYWORDS)


def is_course_like(title: str | None, description: str | None) -> bool:
    text = f"{title or ''} {description or ''}".lower()
    return any(keyword in text for keyword in COURSE_KEYWORDS)


def parse_iso8601_duration_to_minutes(duration: str) -> int:
    hours = 0
    minutes = 0
    seconds = 0

    hour_match = re.search(r"(\d+)H", duration)
    minute_match = re.search(r"(\d+)M", duration)
    second_match = re.search(r"(\d+)S", duration)

    if hour_match:
        hours = int(hour_match.group(1))
    if minute_match:
        minutes = int(minute_match.group(1))
    if second_match:
        seconds = int(second_match.group(1))

    total_minutes = hours * 60 + minutes
    if seconds > 0:
        total_minutes += 1

    return total_minutes


def extract_video_duration_minutes(detail: dict | None) -> int | None:
    if not detail:
        return None

    duration = detail.get("contentDetails", {}).get("duration", "")
    if not duration:
        return None

    return parse_iso8601_duration_to_minutes(duration)


def extract_playlist_item_count(detail: dict | None) -> int | None:
    if not detail:
        return None

    item_count = detail.get("contentDetails", {}).get("itemCount")
    if item_count is None:
        return None

    return int(item_count)


def estimate_playlist_duration_minutes(item_count: int | None) -> int | None:
    if item_count is None or item_count <= 0:
        return None

    return max(
        MIN_PLAYLIST_ESTIMATED_DURATION_MINUTES,
        item_count * DEFAULT_PLAYLIST_UNIT_MINUTES,
    )


def normalize_title_for_dedup(title: str) -> str:
    normalized = clean_text(title).lower()

    phrases_to_remove = [
        "full course",
        "complete course",
        "for beginners",
        "beginner tutorial",
        "tutorial",
        "course",
        "complete",
        "bootcamp",
        "full tutorial",
        "crash course",
        "masterclass",
        "beginners",
        "|",
        ":",
        "-",
    ]

    for phrase in phrases_to_remove:
        normalized = normalized.replace(phrase, " ")

    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def infer_difficulty_level(
    title: str,
    description: str,
    *,
    content_type: str,
    duration_minutes_total: int | None,
    playlist_item_count: int | None,
) -> str | None:
    text = f"{title} {description}".lower()

    if any(keyword in text for keyword in ADVANCED_KEYWORDS):
        return "advanced"

    if any(keyword in text for keyword in INTERMEDIATE_KEYWORDS):
        return "intermediate"

    if any(keyword in text for keyword in BEGINNER_KEYWORDS):
        return "beginner"

    if content_type == "video" and duration_minutes_total is not None:
        if duration_minutes_total <= 90:
            return "beginner"
        if duration_minutes_total >= 300:
            return "intermediate"

    if content_type == "playlist" and playlist_item_count is not None:
        if playlist_item_count <= 5:
            return "beginner"
        if playlist_item_count >= 20:
            return "intermediate"

    return None


def extract_topic_tags(title: str, description: str) -> list[str]:
    text = f"{title} {description}".lower()
    tags: list[str] = []

    for tag, patterns in TOPIC_TAG_PATTERNS:
        if any(pattern in text for pattern in patterns):
            tags.append(tag)

    return tags[:8]


def humanize_topic_tag(tag: str) -> str:
    return tag.replace("_", " ")


def infer_prerequisite_hint(
    difficulty_level: str | None,
    topic_tags: list[str],
) -> str | None:
    if difficulty_level not in {"intermediate", "advanced"}:
        return None

    subject_name = humanize_topic_tag(topic_tags[0]) if topic_tags else "the subject"

    if difficulty_level == "intermediate":
        return f"Basic familiarity with {subject_name} is recommended before starting this course."

    return f"Strong prior foundation in {subject_name} is recommended before starting this course."


def infer_progression_hint(difficulty_level: str | None) -> str | None:
    if difficulty_level == "beginner":
        return "foundation"
    if difficulty_level == "intermediate":
        return "next_step"
    if difficulty_level == "advanced":
        return "specialization"
    return None


def build_quality_signals(
    *,
    raw_course: RawCourse,
    heuristic_score: int,
    duration_minutes_total: int | None,
    duration_is_estimated: bool,
    playlist_item_count: int | None,
) -> dict[str, Any]:
    return {
        "heuristic_score_raw": heuristic_score,
        "heuristic_score_normalized": max(0, min(heuristic_score, 100)),
        "content_type": raw_course.content_type,
        "language": raw_course.language,
        "duration_minutes_total": duration_minutes_total,
        "duration_is_estimated": duration_is_estimated,
        "playlist_item_count": playlist_item_count,
        "ai_validated": True,
    }


def build_provider_metadata(
    *,
    raw_course: RawCourse,
    detail: dict | None,
    playlist_item_count: int | None,
) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        "provider": "youtube",
        "source": raw_course.source,
        "youtube_channel_title": clean_text(raw_course.channel_title),
        "youtube_content_type": raw_course.content_type,
        "youtube_playlist_item_count": playlist_item_count,
    }

    if raw_course.content_type == "video" and detail:
        metadata["youtube_duration_iso8601"] = (
            detail.get("contentDetails", {}).get("duration")
        )

    return metadata


def build_course_url(raw_course: RawCourse) -> str:
    if raw_course.content_type == "video":
        return f"https://www.youtube.com/watch?v={raw_course.external_id}"
    return f"https://www.youtube.com/playlist?list={raw_course.external_id}"


def score_raw_course(raw_course: RawCourse, detail: dict | None) -> int:
    score = 0

    if raw_course.content_type == "playlist":
        score += 30
    elif raw_course.content_type == "video":
        score += 20

    title = clean_text(raw_course.normalized_title)
    description = ""
    if raw_course.raw_data:
        description = clean_text(raw_course.raw_data.get("snippet", {}).get("description", ""))

    if is_course_like(title, description):
        score += 20

    if raw_course.language in {"ar", "en"}:
        score += 10

    if raw_course.content_type == "video" and detail:
        total_minutes = extract_video_duration_minutes(detail) or 0
        score += min(total_minutes, 300) // 10

    if raw_course.content_type == "playlist" and detail:
        item_count = extract_playlist_item_count(detail) or 0
        score += min(item_count, 50)

    return score


def _extract_course_snippet_fields(raw_course: RawCourse) -> tuple[str, str]:
    description = ""
    thumbnail_url = ""

    if raw_course.raw_data:
        snippet = raw_course.raw_data.get("snippet", {})
        description = clean_text(snippet.get("description", ""))
        thumbnails = snippet.get("thumbnails", {})
        thumbnail_url = (
            thumbnails.get("high", {}).get("url")
            or thumbnails.get("medium", {}).get("url")
            or thumbnails.get("default", {}).get("url")
            or ""
        )

    return description, thumbnail_url


def _build_course_enrichment(
    *,
    raw_course: RawCourse,
    detail: dict | None,
    heuristic_score: int,
) -> dict[str, Any]:
    title = clean_text(raw_course.normalized_title) or "Untitled Course"
    description, thumbnail_url = _extract_course_snippet_fields(raw_course)

    playlist_item_count = None
    duration_minutes_total = None
    duration_is_estimated = False

    if raw_course.content_type == "video":
        duration_minutes_total = extract_video_duration_minutes(detail)
    elif raw_course.content_type == "playlist":
        playlist_item_count = extract_playlist_item_count(detail)
        duration_minutes_total = estimate_playlist_duration_minutes(playlist_item_count)
        duration_is_estimated = duration_minutes_total is not None

    difficulty_level = infer_difficulty_level(
        title=title,
        description=description,
        content_type=raw_course.content_type,
        duration_minutes_total=duration_minutes_total,
        playlist_item_count=playlist_item_count,
    )

    topic_tags = extract_topic_tags(title, description)
    prerequisite_hint = infer_prerequisite_hint(difficulty_level, topic_tags)
    progression_hint = infer_progression_hint(difficulty_level)

    quality_score = max(0, min(heuristic_score, 100))
    quality_signals = build_quality_signals(
        raw_course=raw_course,
        heuristic_score=heuristic_score,
        duration_minutes_total=duration_minutes_total,
        duration_is_estimated=duration_is_estimated,
        playlist_item_count=playlist_item_count,
    )

    provider_metadata = build_provider_metadata(
        raw_course=raw_course,
        detail=detail,
        playlist_item_count=playlist_item_count,
    )

    return {
        "title": title,
        "description": description,
        "thumbnail_url": thumbnail_url,
        "provider": "youtube",
        "channel_title": clean_text(raw_course.channel_title),
        "instructor_name": clean_text(raw_course.channel_title) or None,
        "language": raw_course.language,
        "level": difficulty_level,
        "difficulty_level": difficulty_level,
        "duration_minutes_total": duration_minutes_total,
        "duration_is_estimated": duration_is_estimated,
        "pricing_model": "free",
        "topic_tags": topic_tags,
        "quality_score": quality_score,
        "quality_signals": quality_signals,
        "prerequisite_hint": prerequisite_hint,
        "progression_hint": progression_hint,
        "provider_metadata": provider_metadata,
        "url": build_course_url(raw_course),
        "published_at": raw_course.published_at,
    }


def _apply_course_fields(
    course: Course,
    *,
    raw_course: RawCourse,
    enrichment: dict[str, Any],
) -> Course:
    course.source = raw_course.source
    course.external_id = raw_course.external_id
    course.content_type = raw_course.content_type

    course.title = enrichment["title"]
    course.description = enrichment["description"]

    course.provider = enrichment["provider"]
    course.channel_title = enrichment["channel_title"]
    course.instructor_name = enrichment["instructor_name"]

    course.language = enrichment["language"]
    course.level = enrichment["level"]
    course.difficulty_level = enrichment["difficulty_level"]

    course.duration_minutes_total = enrichment["duration_minutes_total"]
    course.duration_is_estimated = enrichment["duration_is_estimated"]

    course.pricing_model = enrichment["pricing_model"]

    course.topic_tags = enrichment["topic_tags"]
    course.quality_score = enrichment["quality_score"]
    course.quality_signals = enrichment["quality_signals"]

    course.prerequisite_hint = enrichment["prerequisite_hint"]
    course.progression_hint = enrichment["progression_hint"]

    course.provider_metadata = enrichment["provider_metadata"]

    course.url = enrichment["url"]
    course.thumbnail_url = enrichment["thumbnail_url"]
    course.published_at = enrichment["published_at"]

    return course


def process_raw_courses(db: Session, ingestion_id: int) -> list[Course]:
    raw_courses = (
        db.query(RawCourse)
        .filter(RawCourse.ingestion_id == ingestion_id)
        .all()
    )

    video_ids = [item.external_id for item in raw_courses if item.content_type == "video"]
    playlist_ids = [item.external_id for item in raw_courses if item.content_type == "playlist"]

    video_details = get_video_details(video_ids)
    playlist_details = get_playlist_details(playlist_ids)

    heuristic_candidates: list[dict[str, Any]] = []

    for raw_course in raw_courses:
        title = clean_text(raw_course.normalized_title)
        description = ""
        channel_title = clean_text(raw_course.channel_title)

        if raw_course.raw_data:
            description = clean_text(raw_course.raw_data.get("snippet", {}).get("description", ""))

        raw_course.normalized_title = title
        raw_course.channel_title = channel_title

        language = detect_language(f"{title} {description}")
        raw_course.language = language
        raw_course.is_processed = True

        if language not in {"ar", "en"}:
            raw_course.is_accepted = False
            raw_course.rejection_reason = REJECTION_NON_TARGET_LANGUAGE
            continue

        if contains_explicit_non_target_language(title, description, channel_title):
            raw_course.is_accepted = False
            raw_course.rejection_reason = REJECTION_NON_TARGET_LANGUAGE
            continue

        if not is_course_like(title, description):
            raw_course.is_accepted = False
            raw_course.rejection_reason = REJECTION_NOT_COURSE_LIKE
            continue

        detail = None
        duration_minutes = None
        playlist_item_count = None

        if raw_course.content_type == "video":
            detail = video_details.get(raw_course.external_id)

            if not detail:
                raw_course.is_accepted = False
                raw_course.rejection_reason = REJECTION_NOT_COURSE_LIKE
                continue

            duration_minutes = extract_video_duration_minutes(detail)

            if duration_minutes is None or duration_minutes < 30:
                raw_course.is_accepted = False
                raw_course.rejection_reason = REJECTION_TOO_SHORT
                continue

        elif raw_course.content_type == "playlist":
            detail = playlist_details.get(raw_course.external_id)

            if not detail:
                raw_course.is_accepted = False
                raw_course.rejection_reason = REJECTION_NOT_COURSE_LIKE
                continue

            playlist_item_count = extract_playlist_item_count(detail)

            if playlist_item_count is None or playlist_item_count < 3:
                raw_course.is_accepted = False
                raw_course.rejection_reason = REJECTION_TOO_SMALL_PLAYLIST
                continue

        heuristic_score = score_raw_course(raw_course, detail)

        heuristic_candidates.append(
            {
                "raw_course": raw_course,
                "detail": detail,
                "score": heuristic_score,
                "validation_payload": {
                    "external_id": raw_course.external_id,
                    "content_type": raw_course.content_type,
                    "title": title,
                    "description": description,
                    "channel_title": channel_title,
                    "heuristic_language": language,
                    "duration_minutes": duration_minutes,
                    "playlist_item_count": playlist_item_count,
                    "published_at": (
                        raw_course.published_at.isoformat()
                        if raw_course.published_at
                        else None
                    ),
                },
            }
        )

    ai_decisions = validate_course_candidates(
        [candidate["validation_payload"] for candidate in heuristic_candidates]
    )

    accepted_candidates: list[dict[str, Any]] = []

    for candidate in heuristic_candidates:
        raw_course = candidate["raw_course"]
        detail = candidate["detail"]
        score = candidate["score"]

        decision = ai_decisions.get(raw_course.external_id)

        if not decision:
            raw_course.is_accepted = False
            raw_course.rejection_reason = REJECTION_AI_VALIDATION_FAILED
            continue

        detected_language = decision.get("detected_language")
        reason = decision.get("reason", "")

        if detected_language in {"ar", "en"}:
            raw_course.language = detected_language

        if not decision.get("accepted", False):
            raw_course.is_accepted = False
            raw_course.rejection_reason = reason or REJECTION_AI_VALIDATION_FAILED
            continue

        raw_course.is_accepted = True
        raw_course.rejection_reason = None

        accepted_candidates.append(
            {
                "raw_course": raw_course,
                "detail": detail,
                "score": score,
            }
        )

    accepted_candidates.sort(key=lambda item: item["score"], reverse=True)

    promoted_courses: list[Course] = []
    seen_titles: set[str] = set()

    for candidate in accepted_candidates:
        raw_course = candidate["raw_course"]
        detail = candidate["detail"]
        score = candidate["score"]

        normalized_key = normalize_title_for_dedup(raw_course.normalized_title or "")

        if normalized_key in seen_titles:
            raw_course.is_accepted = False
            raw_course.rejection_reason = REJECTION_DUPLICATE
            continue

        seen_titles.add(normalized_key)

        enrichment = _build_course_enrichment(
            raw_course=raw_course,
            detail=detail,
            heuristic_score=score,
        )

        existing_course = (
            db.query(Course)
            .filter(Course.external_id == raw_course.external_id)
            .first()
        )

        if existing_course:
            _apply_course_fields(
                existing_course,
                raw_course=raw_course,
                enrichment=enrichment,
            )
            promoted_courses.append(existing_course)
            continue

        course = Course(
            source=raw_course.source,
            external_id=raw_course.external_id,
            content_type=raw_course.content_type,
            title=enrichment["title"],
            description=enrichment["description"],
            provider=enrichment["provider"],
            channel_title=enrichment["channel_title"],
            instructor_name=enrichment["instructor_name"],
            language=enrichment["language"],
            level=enrichment["level"],
            difficulty_level=enrichment["difficulty_level"],
            duration_minutes_total=enrichment["duration_minutes_total"],
            duration_is_estimated=enrichment["duration_is_estimated"],
            pricing_model=enrichment["pricing_model"],
            topic_tags=enrichment["topic_tags"],
            quality_score=enrichment["quality_score"],
            quality_signals=enrichment["quality_signals"],
            prerequisite_hint=enrichment["prerequisite_hint"],
            progression_hint=enrichment["progression_hint"],
            provider_metadata=enrichment["provider_metadata"],
            url=enrichment["url"],
            thumbnail_url=enrichment["thumbnail_url"],
            published_at=enrichment["published_at"],
        )

        db.add(course)
        promoted_courses.append(course)

    db.commit()

    for course in promoted_courses:
        db.refresh(course)

    return promoted_courses