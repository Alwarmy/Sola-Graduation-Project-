from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from datetime import date, timedelta
import math

from app.core.exceptions import ConflictException, ValidationException
from app.core.timezone_utils import get_local_date

MIN_GENERATABLE_MINUTES = 1

WEEKDAY_TO_NAME = {
    0: "monday",
    1: "tuesday",
    2: "wednesday",
    3: "thursday",
    4: "friday",
    5: "saturday",
    6: "sunday",
}


@dataclass
class GeneratedSegment:
    plan_course_id: int
    course_id: int
    course_unit_id: int
    title: str
    source_order_index: int
    planned_minutes: int
    segment_index: int
    segment_start_second: int | None
    segment_end_second: int | None
    practical_signal: str
    load_signal: str
    item_metadata: dict


def split_course_unit_into_segments(course_unit, session_cap_minutes: int) -> list[GeneratedSegment]:
    total_seconds = course_unit.raw_duration_seconds or 0

    if total_seconds <= 0:
        total_seconds = max(MIN_GENERATABLE_MINUTES, course_unit.estimated_minutes) * 60

    session_cap_seconds = session_cap_minutes * 60
    segment_count = max(1, math.ceil(total_seconds / session_cap_seconds))

    unit_base_start = course_unit.start_second if course_unit.start_second is not None else 0

    segments: list[GeneratedSegment] = []

    for segment_number in range(segment_count):
        relative_start = segment_number * session_cap_seconds
        relative_end = min(total_seconds, (segment_number + 1) * session_cap_seconds)
        segment_seconds = max(60, relative_end - relative_start)
        planned_minutes = max(MIN_GENERATABLE_MINUTES, math.ceil(segment_seconds / 60))

        if segment_count == 1:
            title = course_unit.title
            item_type = "study_session"
        else:
            title = f"{course_unit.title} - Segment {segment_number + 1}"
            item_type = "study_session_segment"

        segments.append(
            GeneratedSegment(
                plan_course_id=0,
                course_id=0,
                course_unit_id=course_unit.id,
                title=title,
                source_order_index=course_unit.source_order_index,
                planned_minutes=planned_minutes,
                segment_index=segment_number + 1,
                segment_start_second=unit_base_start + relative_start,
                segment_end_second=unit_base_start + relative_end,
                practical_signal=course_unit.practical_signal,
                load_signal=course_unit.load_signal,
                item_metadata={
                    "item_type_source": item_type,
                    "segment_count_for_unit": segment_count,
                    "unit_type": course_unit.unit_type,
                },
            )
        )

    return segments


def find_next_study_date(cursor_date: date, preferred_study_days: list[str]) -> date:
    allowed_days = set(preferred_study_days)

    current = cursor_date
    for _ in range(14):
        day_name = WEEKDAY_TO_NAME[current.weekday()]
        if day_name in allowed_days:
            return current
        current += timedelta(days=1)

    raise ValidationException("No valid preferred study day could be resolved.")


def _remaining_queue_minutes(queue: deque[GeneratedSegment]) -> int:
    return sum(segment.planned_minutes for segment in queue)


def _count_nonempty_queues(
    segment_queues: dict[int, deque[GeneratedSegment]],
    remaining_minutes: int | None = None,
) -> int:
    if remaining_minutes is None:
        return sum(1 for queue in segment_queues.values() if queue)

    return sum(
        1
        for queue in segment_queues.values()
        if queue and queue[0].planned_minutes <= remaining_minutes
    )


def _rotation_order(
    ordered_plan_course_ids: list[int],
    rotation_pointer: int,
) -> list[int]:
    if not ordered_plan_course_ids:
        return []
    return ordered_plan_course_ids[rotation_pointer:] + ordered_plan_course_ids[:rotation_pointer]


def _choose_next_plan_course_id(
    ordered_plan_course_ids: list[int],
    rotation_pointer: int,
    segment_queues: dict[int, deque[GeneratedSegment]],
    remaining_minutes: int,
    day_course_ids: set[int],
    last_load_signal: str | None,
) -> int | None:
    candidate_ids = [
        plan_course_id
        for plan_course_id in _rotation_order(ordered_plan_course_ids, rotation_pointer)
        if segment_queues[plan_course_id]
        and segment_queues[plan_course_id][0].planned_minutes <= remaining_minutes
    ]

    if not candidate_ids:
        return None

    desired_distinct_courses_today = min(
        2,
        _count_nonempty_queues(segment_queues, remaining_minutes=remaining_minutes),
    )

    best_plan_course_id: int | None = None
    best_score: float | None = None
    best_rank: int | None = None

    for rank, plan_course_id in enumerate(candidate_ids):
        queue = segment_queues[plan_course_id]
        next_segment = queue[0]
        remaining_course_minutes = _remaining_queue_minutes(queue)

        score = 0.0

        if plan_course_id not in day_course_ids and len(day_course_ids) < desired_distinct_courses_today:
            score += 30.0
        elif plan_course_id in day_course_ids:
            score += 4.0

        short_course_bias = max(0.0, 12.0 - (remaining_course_minutes / 30.0))
        score += short_course_bias

        if last_load_signal == "heavy":
            if next_segment.load_signal == "light":
                score += 10.0
            elif next_segment.load_signal == "medium":
                score += 6.0
            else:
                score -= 8.0
        elif last_load_signal == "medium":
            if next_segment.load_signal == "light":
                score += 3.0
            elif next_segment.load_signal == "heavy":
                score -= 2.0
        elif last_load_signal == "light":
            if next_segment.load_signal == "heavy":
                score += 2.0

        score += max(0.0, 6.0 - rank)

        if (
            best_score is None
            or score > best_score
            or (score == best_score and rank < (best_rank or 0))
        ):
            best_plan_course_id = plan_course_id
            best_score = score
            best_rank = rank

    return best_plan_course_id


def generate_schedule_items_payload(
    *,
    plan_id: int,
    ordered_plan_course_ids: list[int],
    segment_queues: dict[int, deque[GeneratedSegment]],
    preferred_study_days: list[str],
    preferred_time_window: str,
    max_daily_minutes: int,
    schedule_timezone_snapshot: str,
    schedule_revision: int,
    fixed_reserved_minutes_by_date: dict[date, int] | None = None,
    initial_order_index: int = 1,
    start_date: date | None = None,
    extra_item_metadata: dict | None = None,
) -> list[dict]:
    if not preferred_study_days:
        raise ValidationException("Preferred study days are required for schedule generation.")

    if fixed_reserved_minutes_by_date is None:
        fixed_reserved_minutes_by_date = {}

    if extra_item_metadata is None:
        extra_item_metadata = {}

    cursor_date = start_date or get_local_date(schedule_timezone_snapshot)
    schedule_order_index = initial_order_index
    rotation_pointer = 0
    generated_items: list[dict] = []

    while any(segment_queues[plan_course_id] for plan_course_id in ordered_plan_course_ids):
        scheduled_date = find_next_study_date(
            cursor_date=cursor_date,
            preferred_study_days=preferred_study_days,
        )

        reserved_minutes = fixed_reserved_minutes_by_date.get(scheduled_date, 0)
        remaining_minutes = max_daily_minutes - reserved_minutes

        if remaining_minutes < MIN_GENERATABLE_MINUTES:
            cursor_date = scheduled_date + timedelta(days=1)
            continue

        day_scheduled_anything = False
        day_course_ids: set[int] = set()
        last_load_signal: str | None = None

        while remaining_minutes >= MIN_GENERATABLE_MINUTES:
            selected_plan_course_id = _choose_next_plan_course_id(
                ordered_plan_course_ids=ordered_plan_course_ids,
                rotation_pointer=rotation_pointer,
                segment_queues=segment_queues,
                remaining_minutes=remaining_minutes,
                day_course_ids=day_course_ids,
                last_load_signal=last_load_signal,
            )

            if selected_plan_course_id is None:
                break

            queue = segment_queues[selected_plan_course_id]
            next_segment = queue.popleft()

            generated_items.append(
                {
                    "plan_id": plan_id,
                    "plan_course_id": next_segment.plan_course_id,
                    "course_id": next_segment.course_id,
                    "course_unit_id": next_segment.course_unit_id,
                    "title": next_segment.title,
                    "item_type": next_segment.item_metadata["item_type_source"],
                    "status": "pending",
                    "schedule_order_index": schedule_order_index,
                    "source_order_index": next_segment.source_order_index,
                    "scheduled_date": scheduled_date,
                    "time_window": preferred_time_window,
                    "planned_minutes": next_segment.planned_minutes,
                    "actual_started_at": None,
                    "actual_completed_at": None,
                    "actual_minutes": None,
                    "skipped_at": None,
                    "skip_reason": None,
                    "segment_index": next_segment.segment_index,
                    "segment_start_second": next_segment.segment_start_second,
                    "segment_end_second": next_segment.segment_end_second,
                    "practical_signal": next_segment.practical_signal,
                    "load_signal": next_segment.load_signal,
                    "item_metadata": {
                        **next_segment.item_metadata,
                        "schedule_timezone_snapshot": schedule_timezone_snapshot,
                        "schedule_revision": schedule_revision,
                        **extra_item_metadata,
                    },
                }
            )

            remaining_minutes -= next_segment.planned_minutes
            schedule_order_index += 1
            day_scheduled_anything = True
            day_course_ids.add(selected_plan_course_id)
            last_load_signal = next_segment.load_signal
            rotation_pointer = (
                ordered_plan_course_ids.index(selected_plan_course_id) + 1
            ) % len(ordered_plan_course_ids)

        if not day_scheduled_anything:
            raise ConflictException("Schedule generation stalled because no segment could fit inside the daily cap.")

        cursor_date = scheduled_date + timedelta(days=1)

    return generated_items
