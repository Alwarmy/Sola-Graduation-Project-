from __future__ import annotations

import json
import textwrap
from typing import Any


LINE_WIDTH = 88


def _wrap(value: Any, *, width: int = LINE_WIDTH - 4) -> str:
    text = "None" if value is None else str(value)
    return "\n".join(textwrap.wrap(text, width=width)) or text


def banner(title: str) -> None:
    print("\n" + "=" * LINE_WIDTH)
    print(title)
    print("=" * LINE_WIDTH)


def section(title: str) -> None:
    print("\n" + "-" * LINE_WIDTH)
    print(title)
    print("-" * LINE_WIDTH)


def info(message: str) -> None:
    print(_wrap(message))


def warning(message: str) -> None:
    print(f"WARNING: {_wrap(message)}")


def success(message: str) -> None:
    print(f"OK: {_wrap(message)}")


def key_value(label: str, value: Any) -> None:
    print(f"{label}: {_wrap(value, width=LINE_WIDTH - len(label) - 4)}")


def bullet(message: str) -> None:
    print(f"- {_wrap(message, width=LINE_WIDTH - 6)}")


def compact_json(label: str, payload: dict[str, Any]) -> None:
    section(label)
    print(json.dumps(payload, ensure_ascii=False, indent=2, default=str))


def render_profile(profile: dict[str, Any]) -> None:
    section("Profile")
    key_value("Track", profile.get("primary_track") or profile.get("background_track"))
    key_value("Target role", profile.get("target_role"))
    key_value("Experience", profile.get("experience_level"))
    key_value("Weekly hours", profile.get("weekly_hours"))
    key_value("Goal", profile.get("goal"))
    key_value("Language", profile.get("preferred_language"))
    key_value("Timezone", profile.get("timezone"))


def render_learning_state(learning_state: dict[str, Any]) -> None:
    section("Learning State")
    key_value("Current focus", learning_state.get("current_focus"))
    key_value("Dominant interests", ", ".join(learning_state.get("dominant_interests") or []))
    key_value("Emerging interests", ", ".join(learning_state.get("emerging_interests") or []))
    key_value("Engagement score", learning_state.get("engagement_score"))


def _course_line(course: dict[str, Any]) -> str:
    summary = course.get("card_summary") or course.get("title") or "Course"
    discovery = course.get("discovery") or {}
    explanation = discovery.get("explanation_summary")
    if explanation:
        return f"{course.get('title')} | {summary} | {explanation}"
    return f"{course.get('title')} | {summary}"


def render_course_list(title: str, courses: list[dict[str, Any]]) -> None:
    section(title)
    if not courses:
        info("No courses available.")
        return
    for index, course in enumerate(courses, start=1):
        print(f"{index}. {_course_line(course)}")


def render_course_detail(course: dict[str, Any]) -> None:
    section("Course Detail")
    key_value("ID", course.get("id"))
    key_value("Title", course.get("title"))
    key_value("Summary", course.get("card_summary"))
    key_value("Description", course.get("description") or course.get("short_description"))
    key_value("Topics", ", ".join(course.get("topic_tag_labels") or course.get("topic_tags") or []))
    key_value("Provider", course.get("provider_display_name") or course.get("provider"))
    key_value("Difficulty", course.get("difficulty_label") or course.get("difficulty_level"))
    key_value("Duration", course.get("duration_label"))
    personalization = course.get("personalization") or {}
    if personalization:
        key_value("Fit", personalization.get("fit_label"))
        key_value("Why now", "; ".join(personalization.get("why_now") or []))


def render_course_structure(structure: dict[str, Any]) -> None:
    section("Course Structure")
    key_value("Structure ID", structure.get("id"))
    key_value("Build status", structure.get("build_status"))
    key_value("Type", structure.get("structure_type"))
    key_value("Units", structure.get("total_units"))
    key_value("Total minutes", structure.get("total_minutes"))


def render_queue(queue_items: list[dict[str, Any]]) -> None:
    section("Schedule Queue")
    if not queue_items:
        info("The queue is empty.")
        return
    for item in queue_items:
        course = item.get("course") or {}
        print(
            f"- Queue item {item.get('id')}: {course.get('title')} "
            f"({item.get('status')}, note={item.get('note') or 'none'})"
        )


def render_plan(plan: dict[str, Any]) -> None:
    section("Learning Plan")
    key_value("Plan ID", plan.get("id"))
    key_value("Title", plan.get("title"))
    key_value("Goal", plan.get("goal"))
    key_value("Status", plan.get("status"))
    key_value("Version", plan.get("version"))
    key_value("Schedule revision", plan.get("schedule_revision"))
    courses = plan.get("courses") or []
    key_value("Course count", len(courses))


def render_plan_readiness(readiness: dict[str, Any]) -> None:
    section("Plan Readiness")
    key_value("Ready for schedule generation", readiness.get("is_ready_for_schedule_generation"))
    key_value("Ready for execution", readiness.get("is_ready_for_execution"))
    key_value("Has schedule items", readiness.get("has_schedule_items"))
    key_value("Recommended action", readiness.get("recommended_action"))
    blockers = readiness.get("generation_blockers") or []
    if blockers:
        key_value("Generation blockers", ", ".join(blockers))


def render_schedule(schedule: dict[str, Any]) -> None:
    section("Schedule")
    key_value("Plan ID", schedule.get("plan_id"))
    key_value("Plan version", schedule.get("plan_version"))
    key_value("Schedule revision", schedule.get("schedule_revision"))
    key_value("Total items", schedule.get("total_items"))
    key_value("Total minutes", schedule.get("total_minutes"))
    print("\nOrder | Date       | Window    | Minutes | Status      | Title")
    print("-" * LINE_WIDTH)
    for item in schedule.get("items") or []:
        print(
            f"{str(item.get('schedule_order_index')).rjust(5)} | "
            f"{str(item.get('scheduled_date')).ljust(10)} | "
            f"{str(item.get('time_window')).ljust(9)} | "
            f"{str(item.get('planned_minutes')).rjust(7)} | "
            f"{str(item.get('status')).ljust(11)} | "
            f"{item.get('title')}"
        )


def render_execution_summary(summary: dict[str, Any]) -> None:
    section("Execution Summary")
    key_value("Pending", summary.get("pending_items_count"))
    key_value("In progress", summary.get("in_progress_items_count"))
    key_value("Completed", summary.get("completed_items_count"))
    key_value("Skipped", summary.get("skipped_items_count"))
    key_value("Overdue", summary.get("overdue_items_count"))
    key_value("Completion rate", summary.get("completion_rate"))
    key_value("Next item", summary.get("next_actionable_title"))


def render_action_result(label: str, payload: dict[str, Any]) -> None:
    section(label)
    item = payload.get("item") or {}
    key_value("Item ID", item.get("id"))
    key_value("Title", item.get("title"))
    key_value("Status", item.get("status"))
    key_value("Version", item.get("version"))
    execution_summary = payload.get("execution_summary") or {}
    if execution_summary:
        key_value("Completed count", execution_summary.get("completed_items_count"))
        key_value("Skipped count", execution_summary.get("skipped_items_count"))
        key_value("Overdue count", execution_summary.get("overdue_items_count"))


def render_recovery_preview(preview: dict[str, Any]) -> None:
    section("Recovery Preview")
    key_value("Needs recovery", preview.get("needs_recovery"))
    key_value("Drift level", preview.get("drift_level"))
    key_value("Overdue items", preview.get("overdue_items_count"))
    key_value("Overdue minutes", preview.get("overdue_minutes"))
    key_value("Recommended action", preview.get("recommended_action"))
    key_value("Recommended mode", preview.get("recommended_recovery_mode"))


def render_recovery_changes(changes: list[dict[str, Any]]) -> None:
    section("Recovery Prep Changes")
    if not changes:
        info("No schedule dates had to be changed.")
        return
    for change in changes:
        print(
            f"- Item {change.get('item_id')} | {change.get('title')} | "
            f"{change.get('old_scheduled_date')} -> {change.get('new_scheduled_date')} | "
            f"{change.get('reason')}"
        )


def render_helper_preview(title: str, reasons: list[str], changes: list[str]) -> None:
    section(title)
    info("Why this helper is needed:")
    for reason in reasons:
        bullet(reason)
    info("What it will change:")
    for change in changes:
        bullet(change)
    info("This is demo-state preparation, not natural user behavior.")


def render_assistant_exchange(exchange: dict[str, Any]) -> None:
    section("Assistant Exchange")
    assistant_message = exchange.get("assistant_message") or {}
    governance = exchange.get("governance") or {}
    key_value("Response mode", exchange.get("response_mode"))
    key_value("Governance status", governance.get("status"))
    key_value("Assistant reply", assistant_message.get("content"))
    key_value("Memory candidates", len(exchange.get("memory_candidates") or []))
    key_value("Suggested actions", len(exchange.get("suggested_actions") or []))


def render_memory_candidates(memory_candidates: list[dict[str, Any]]) -> None:
    section("Memory Candidates")
    if not memory_candidates:
        info("No memory candidates were returned.")
        return
    for candidate in memory_candidates:
        print(
            f"- Signal {candidate.get('id')} | {candidate.get('signal_key')} | "
            f"{candidate.get('status')} | {candidate.get('signal_summary')}"
        )


def render_suggested_actions(actions: list[dict[str, Any]]) -> None:
    section("Suggested Actions")
    if not actions:
        info("No suggested actions were returned.")
        return
    for action in actions:
        print(
            f"- Action run {action.get('action_run_id')} | {action.get('action_type')} | "
            f"{action.get('title')} | {action.get('summary')}"
        )


def render_closeout(summary: dict[str, Any]) -> None:
    section("Demo Closeout")
    for key, value in summary.items():
        key_value(key.replace("_", " ").title(), value)
