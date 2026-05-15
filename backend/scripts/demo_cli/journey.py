from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.schemas.user_profile import PREFERRED_LANGUAGE_OPTIONS
from scripts.demo_cli import DEMO_SOURCE
from scripts.demo_cli.api_client import ApiError, SolaApiClient
from scripts.demo_cli.bootstrap import ensure_demo_catalog, prepare_recovery_state
from scripts.demo_cli.prompts import (
    prompt_choice,
    prompt_int,
    prompt_multi_choice,
    prompt_password,
    prompt_text,
    prompt_yes_no,
)
from scripts.demo_cli import render
from scripts.demo_cli.state import DemoConfig, DemoState, JsonDict
from scripts.demo_cli.transcript import SessionTranscript


BACKGROUND_TRACK_ORDER = [
    "software_engineering",
    "web_development",
    "mobile_development",
    "data_science",
    "ai_ml",
    "cybersecurity",
    "accounting",
    "economics",
    "finance",
    "business",
    "marketing",
    "design",
    "physics",
    "mathematics",
    "medicine",
    "law",
    "education",
    "other",
]
EXPERIENCE_LEVEL_ORDER = ["beginner", "intermediate", "advanced"]
EMPLOYMENT_STATUS_ORDER = ["employed", "job_seeker", "unemployed"]
GOAL_ORDER = ["job", "project", "skill_growth", "general", "freelance", "academic"]
LANGUAGE_ORDER = ["en", "ar", "any"]
TIME_WINDOW_ORDER = ["morning", "afternoon", "evening", "night"]
PACE_MODE_ORDER = ["relaxed", "balanced", "accelerated"]
STUDY_DAY_ORDER = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
]

# Verified against app/core/domain_values.py and assistant action services in the current working tree.
VERIFIED_RECOVERY_APPLY_ACTION_TYPES = {"apply_recommended_recovery"}


class JourneyAborted(Exception):
    pass


class DemoJourney:
    def __init__(self, config: DemoConfig) -> None:
        self.state = DemoState(config=config)
        self.transcript = SessionTranscript(config.transcript_file)
        self.client = SolaApiClient(
            base_url=config.base_url,
            timeout_seconds=config.timeout_seconds,
        )

    def run(self) -> DemoState:
        render.banner("SOLA Interactive Terminal Demo")
        self.step_preflight()
        self.step_auth()
        self.step_profile()
        self.step_discovery()
        self.step_queue_and_plan()
        self.step_schedule_and_execution()
        self.step_recovery()
        self.step_assistant()
        self.step_closeout()
        return self.state

    def step_preflight(self) -> None:
        self.transcript.section("Preflight")
        root_payload = self.client.get_root()
        db_payload = self.client.get_db_health()
        render.section("Preflight")
        render.key_value("Backend URL", self.state.config.base_url)
        render.key_value("Root", root_payload.get("message"))
        render.key_value("Database", db_payload.get("status"))
        self.transcript.info(
            f"Connected to {self.state.config.base_url}. Root={root_payload.get('message')}, DB={db_payload.get('status')}"
        )

    def step_auth(self) -> None:
        self.transcript.section("Authentication")
        options = ["Register a new demo user", "Log in with an existing user"]
        auth_mode = prompt_choice("How do you want to start?", options, default_index=0)

        suggested_email = (
            f"sola.demo.{self.state.config.namespace}."
            f"{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}@example.com"
        )

        email = prompt_text("Email", default=suggested_email if auth_mode == 0 else None)
        password = prompt_password("Password", default_if_blank="SolaDemo123!")
        full_name = None

        if auth_mode == 0:
            full_name = prompt_text("Full name", default=f"SOLA Demo {self.state.config.namespace}")
            try:
                self.client.register(
                    {
                        "email": email,
                        "full_name": full_name,
                        "password": password,
                    }
                )
                render.success("Registration succeeded.")
                self.transcript.result(f"Registered demo user {email}.")
            except ApiError as error:
                if error.status_code == 409 and prompt_yes_no(
                    "That user already exists. Continue with login instead?",
                    default=True,
                ):
                    render.warning("Continuing with login for the existing user.")
                    self.transcript.warning(f"Registration for {email} already existed; switching to login.")
                else:
                    raise

        tokens = self.client.login({"email": email, "password": password})
        self.client.set_access_token(tokens.get("access_token"))
        me = self.client.get_me()

        self.state.auth.email = email
        self.state.auth.full_name = full_name or me.get("full_name")
        self.state.auth.access_token = tokens.get("access_token")
        self.state.auth.refresh_token = tokens.get("refresh_token")
        self.state.auth.session_id = tokens.get("session_id")
        self.state.me = me

        render.section("Authenticated Session")
        render.key_value("User ID", me.get("id"))
        render.key_value("Email", me.get("email"))
        render.key_value("Full name", me.get("full_name"))
        self.transcript.result(f"Authenticated as {me.get('email')} (user_id={me.get('id')}).")

    def step_profile(self) -> None:
        self.transcript.section("Profile")
        existing_profile = self.client.get_profile()
        action = "create"
        if existing_profile:
            self.state.profile = existing_profile
            render.render_profile(existing_profile)
            choice = prompt_choice(
                "How do you want to handle the existing profile?",
                ["Keep the current profile", "Update the profile for this demo"],
                default_index=0,
            )
            action = "keep" if choice == 0 else "update"

        if action in {"create", "update"}:
            payload = self._prompt_profile_payload(existing_profile)
            if action == "create":
                self.state.profile = self.client.create_profile(payload)
                self._record_event_best_effort(
                    "onboarding_completed",
                    {
                        "background_track": payload["background_track"],
                        "goal": payload["goal"],
                        "timezone": payload["timezone"],
                    },
                )
                self.transcript.result("Created profile for the guided demo.")
            else:
                self.state.profile = self.client.update_profile(payload)
                self._record_event_best_effort(
                    "profile_updated",
                    {
                        "background_track": payload["background_track"],
                        "goal": payload["goal"],
                        "timezone": payload["timezone"],
                    },
                )
                self.transcript.result("Updated the profile for the guided demo.")
        else:
            self.transcript.info("Reused the existing profile.")

        if not self.state.profile:
            raise JourneyAborted("A profile is required to continue the guided journey.")

        render.render_profile(self.state.profile)
        self.state.learning_state = self.client.refresh_learning_state()
        render.render_learning_state(self.state.learning_state)
        self.transcript.info(
            f"Learning state refreshed. Current focus={self.state.learning_state.get('current_focus')!r}."
        )

    def step_discovery(self) -> None:
        self.transcript.section("Discovery")
        default_query = (
            (self.state.learning_state or {}).get("current_focus")
            or (self.state.profile or {}).get("target_role")
            or (self.state.profile or {}).get("primary_track")
            or "python backend"
        )

        while True:
            render.section("Course Discovery")
            query = prompt_text("What should we search for?", default=default_query)
            self.state.search_query = query

            self._record_event_best_effort("search_performed", {"query": query})

            search_payload = self.client.search_courses(
                query=query,
                sort_by="personalized",
                language=self._preferred_language(),
                source=self.state.catalog_source_filter,
            )
            search_items = list(search_payload.get("items") or [])
            self.state.search_results = search_items

            recommendation_items: list[JsonDict] = []
            if self.state.catalog_source_filter != DEMO_SOURCE:
                recommendation_items = list((self.client.get_recommendations(limit=5) or {}).get("items") or [])
            self.state.recommendations = recommendation_items

            render.render_course_list("Search Results", search_items)
            if recommendation_items:
                render.render_course_list("Recommended Now", recommendation_items)

            course_pool = self._dedupe_courses(search_items, recommendation_items)
            if not course_pool:
                helper_used = self._maybe_run_catalog_bootstrap(
                    query=query,
                    reason="Live discovery did not return any usable courses for a truthful end-to-end demo.",
                )
                if helper_used:
                    continue
                if prompt_yes_no("Try a different discovery query instead?", default=True):
                    self.state.catalog_source_filter = None
                    continue
                raise JourneyAborted("Discovery did not return any demo-usable courses.")

            inspect_index = prompt_choice(
                "Which course should we inspect first?",
                [
                    f"{course.get('title')} ({course.get('_origin', 'search')})"
                    for course in course_pool
                ],
                default_index=0,
            )
            inspected_course = self.client.get_course(int(course_pool[inspect_index]["id"]))
            inspected_course["_origin"] = course_pool[inspect_index].get("_origin", "search")

            render.render_course_detail(inspected_course)
            self._record_event_best_effort(
                "course_opened",
                {
                    "course_id": inspected_course.get("id"),
                    "course_title": inspected_course.get("title"),
                    "content_type": inspected_course.get("content_type"),
                },
            )
            if inspected_course.get("_origin") == "recommendation":
                self._record_event_best_effort(
                    "recommendation_clicked",
                    {
                        "course_id": inspected_course.get("id"),
                        "course_title": inspected_course.get("title"),
                    },
                )

            inspected_structure = self._ensure_course_structure_ready(inspected_course)
            if inspected_structure:
                render.render_course_structure(inspected_structure)

            selected_indices = prompt_multi_choice(
                "Select one or two courses to carry into queue and planning",
                [course.get("title") or f"Course {course.get('id')}" for course in course_pool],
                min_count=1,
                max_count=min(2, len(course_pool)),
                default_indices=[inspect_index],
            )

            ready_courses: list[JsonDict] = []
            for selected_index in selected_indices:
                selected_stub = course_pool[selected_index]
                course = inspected_course if selected_index == inspect_index else self.client.get_course(int(selected_stub["id"]))
                course["_origin"] = selected_stub.get("_origin", "search")
                structure = inspected_structure if selected_index == inspect_index else self._ensure_course_structure_ready(course)
                if not structure or int(structure.get("total_units") or 0) <= 0:
                    render.warning(
                        f"{course.get('title')} could not be prepared with a built course structure, so it cannot be scheduled yet."
                    )
                    continue

                ready_courses.append(course)
                self._record_event_best_effort(
                    "course_selected",
                    {
                        "course_id": course.get("id"),
                        "course_title": course.get("title"),
                        "topic_tags": list(course.get("topic_tags") or [])[:5],
                    },
                )

            if ready_courses:
                self.state.selected_courses = ready_courses
                self.transcript.result(
                    "Selected courses: " + ", ".join(course.get("title") or str(course.get("id")) for course in ready_courses)
                )
                return

            helper_used = False
            if self.state.catalog_source_filter != DEMO_SOURCE:
                helper_used = self._maybe_run_catalog_bootstrap(
                    query=query,
                    reason="The selected live courses could not produce built structures needed for scheduling.",
                )
            if helper_used:
                continue
            if prompt_yes_no("Try another discovery pass instead?", default=True):
                self.state.catalog_source_filter = None
                continue
            raise JourneyAborted("No selected course could be prepared for scheduling.")

    def step_queue_and_plan(self) -> None:
        self.transcript.section("Queue And Plan")
        if not self.state.selected_courses:
            raise JourneyAborted("At least one selected course is required before queueing and planning.")

        render.section("Queue Selected Courses")
        latest_queue = self.client.list_queue()
        queue_by_course_id = {
            int(item.get("course", {}).get("id")): item
            for item in latest_queue
            if item.get("course", {}).get("id") is not None
        }

        for course in self.state.selected_courses:
            course_id = int(course["id"])
            existing_queue_item = queue_by_course_id.get(course_id)
            if existing_queue_item:
                render.info(f"{course.get('title')} is already in the schedule queue as item {existing_queue_item.get('id')}.")
                continue

            try:
                queue_item = self.client.add_to_queue(
                    course_id,
                    note="Selected during the SOLA interactive terminal demo.",
                )
                self._record_event_best_effort(
                    "course_saved",
                    {
                        "course_id": course_id,
                        "course_title": course.get("title"),
                    },
                )
                render.success(f"Queued {course.get('title')} as queue item {queue_item.get('id')}.")
            except ApiError as error:
                if error.status_code != 409:
                    raise
                render.warning(f"{course.get('title')} could not be queued cleanly: {error.detail}")

            latest_queue = self.client.list_queue()
            queue_by_course_id = {
                int(item.get("course", {}).get("id")): item
                for item in latest_queue
                if item.get("course", {}).get("id") is not None
            }

        self.state.queue_items = self.client.list_queue()
        render.render_queue(self.state.queue_items)

        selected_course_ids = {int(course["id"]) for course in self.state.selected_courses}
        selected_queue_items = [
            item
            for item in self.state.queue_items
            if int(item.get("course", {}).get("id") or 0) in selected_course_ids
        ]

        open_plan = self.client.get_active_plan()
        if open_plan is None:
            open_plan = self._find_open_plan()

        if open_plan:
            render.warning(
                f"Open plan {open_plan.get('id')} already exists with status {open_plan.get('status')}. "
                "The demo will continue with that plan."
            )
            if open_plan.get("status") == "paused":
                if not prompt_yes_no("Resume the paused plan so execution can continue?", default=True):
                    raise JourneyAborted("The guided demo requires an active plan for schedule execution.")
                open_plan = self.client.update_plan_status(
                    plan_id=int(open_plan["id"]),
                    status="active",
                    expected_version=int(open_plan["version"]),
                )
                render.success(f"Resumed plan {open_plan.get('id')}.")
                self.transcript.result(f"Resumed paused plan {open_plan.get('id')}.")

            readiness = self.client.get_plan_readiness(int(open_plan["id"]))
            if not readiness.get("has_schedule_items"):
                for queue_item in selected_queue_items:
                    if queue_item.get("status") != "queued":
                        continue
                    course_id = int(queue_item.get("course", {}).get("id") or 0)
                    if self._plan_contains_course(open_plan, course_id):
                        continue
                    try:
                        open_plan = self.client.add_queue_item_to_plan(
                            plan_id=int(open_plan["id"]),
                            queue_item_id=int(queue_item["id"]),
                            expected_version=int(open_plan["version"]),
                        )
                        render.success(
                            f"Added queue item {queue_item.get('id')} into plan {open_plan.get('id')}."
                        )
                    except ApiError as error:
                        render.warning(
                            f"Queue item {queue_item.get('id')} could not be attached to the existing plan: {error.detail}"
                        )
            else:
                render.warning(
                    "This plan already has schedule items, so any newly queued courses will remain in the queue."
                )

            self.state.active_plan = self.client.get_plan(int(open_plan["id"]))
        else:
            queue_item_ids = [
                int(item["id"])
                for item in selected_queue_items
                if item.get("status") == "queued"
            ][:3]
            if not queue_item_ids:
                raise JourneyAborted("No queued items are available for plan creation.")

            payload = self._prompt_plan_payload(
                [item for item in self.state.queue_items if int(item["id"]) in set(queue_item_ids)]
            )
            self.state.active_plan = self.client.create_plan(payload)
            self._record_event_best_effort(
                "plan_created",
                {
                    "plan_id": self.state.active_plan.get("id"),
                    "queue_item_ids": queue_item_ids,
                },
            )
            self.transcript.result(f"Created active plan {self.state.active_plan.get('id')}.")

        if not self.state.active_plan:
            raise JourneyAborted("The guided demo could not secure an active plan.")

        self.state.active_plan = self.client.get_plan(int(self.state.active_plan["id"]))
        self.state.readiness = self.client.get_plan_readiness(int(self.state.active_plan["id"]))
        render.render_plan(self.state.active_plan)
        render.render_plan_readiness(self.state.readiness)
        self.transcript.info(
            f"Plan {self.state.active_plan.get('id')} ready state: "
            f"generate={self.state.readiness.get('is_ready_for_schedule_generation')}, "
            f"execute={self.state.readiness.get('is_ready_for_execution')}."
        )

    def step_schedule_and_execution(self) -> None:
        self.transcript.section("Schedule And Execution")
        if not self.state.active_plan:
            raise JourneyAborted("An active plan is required before schedule generation.")

        plan_id = int(self.state.active_plan["id"])
        if self.state.readiness and self.state.readiness.get("has_schedule_items"):
            render.info("Reusing the existing schedule for this plan.")
            self.state.plan_items = self.client.list_plan_items(plan_id)
            self.state.schedule = self._schedule_from_items(self.state.plan_items)
        else:
            self.state.schedule = self.client.generate_schedule(
                plan_id=plan_id,
                expected_version=int(self.state.active_plan["version"]),
                force_rebuild=False,
            )
            self.state.plan_items = list(self.state.schedule.get("items") or [])
            self.state.active_plan = self.client.get_plan(plan_id)
            self.state.readiness = self.client.get_plan_readiness(plan_id)
            render.success(f"Generated schedule revision {self.state.schedule.get('schedule_revision')}.")
            self.transcript.result(
                f"Generated schedule for plan {plan_id} with {self.state.schedule.get('total_items')} items."
            )

        if not self.state.schedule:
            self.state.schedule = self._schedule_from_items(self.state.plan_items)

        render.render_schedule(self.state.schedule)
        self.state.execution_summary = self.client.get_execution_summary(plan_id)
        render.render_execution_summary(self.state.execution_summary)

        actionable_items = [
            item
            for item in self.state.plan_items
            if item.get("status") in {"pending", "in_progress"} and item.get("is_actionable", True)
        ]
        if not actionable_items:
            raise JourneyAborted("No actionable schedule items are available for the execution step.")

        current_item = actionable_items[0]
        if current_item.get("status") == "pending" and prompt_yes_no(
            f"Start the next item now: {current_item.get('title')}?",
            default=True,
        ):
            start_result = self.client.start_plan_item(
                plan_id=plan_id,
                item_id=int(current_item["id"]),
                expected_version=int(current_item["version"]),
            )
            render.render_action_result("Started Item", start_result)
            current_item = start_result.get("item") or current_item
            self.state.execution_summary = start_result.get("execution_summary") or self.state.execution_summary
            self.transcript.result(f"Started plan item {current_item.get('id')}.")

        if prompt_yes_no(f"Complete the item now: {current_item.get('title')}?", default=True):
            actual_minutes = prompt_int(
                "Actual minutes spent",
                default=int(current_item.get("planned_minutes") or 25),
                minimum=1,
                maximum=720,
            )
            complete_result = self.client.complete_plan_item(
                plan_id=plan_id,
                item_id=int(current_item["id"]),
                actual_minutes=actual_minutes,
                expected_version=int(current_item["version"]),
            )
            render.render_action_result("Completed Item", complete_result)
            self.state.execution_summary = complete_result.get("execution_summary") or self.state.execution_summary
            self.transcript.result(f"Completed plan item {current_item.get('id')} in {actual_minutes} minutes.")

        self.state.plan_items = self.client.list_plan_items(plan_id)
        self.state.execution_summary = self.client.get_execution_summary(plan_id)
        render.render_execution_summary(self.state.execution_summary)

        remaining_pending = [item for item in self.state.plan_items if item.get("status") == "pending"]
        if remaining_pending and prompt_yes_no(
            "Skip one additional pending item to demonstrate another execution transition?",
            default=False,
        ):
            skip_item = remaining_pending[0]
            skip_result = self.client.skip_plan_item(
                plan_id=plan_id,
                item_id=int(skip_item["id"]),
                skip_reason="Skipped during the SOLA interactive terminal demo.",
                expected_version=int(skip_item["version"]),
            )
            render.render_action_result("Skipped Item", skip_result)
            self.state.plan_items = self.client.list_plan_items(plan_id)
            self.state.execution_summary = self.client.get_execution_summary(plan_id)
            self.transcript.result(f"Skipped plan item {skip_item.get('id')}.")

        self.state.schedule = self._schedule_from_items(self.state.plan_items)

    def step_recovery(self) -> None:
        self.transcript.section("Recovery")
        if not self.state.active_plan:
            raise JourneyAborted("An active plan is required before recovery preview.")

        plan_id = int(self.state.active_plan["id"])
        self.state.recovery_preview = self.client.get_recovery_preview(plan_id)
        render.render_recovery_preview(self.state.recovery_preview)

        if self.state.recovery_preview.get("needs_recovery"):
            self.transcript.info(
                f"Recovery is already meaningful for plan {plan_id} with "
                f"{self.state.recovery_preview.get('overdue_items_count')} overdue items."
            )
            return

        helper_preview_reasons = [
            "The current plan does not yet contain overdue pending items, so the backend truthfully reports no recovery is needed.",
        ]
        helper_preview_changes = [
            "Move up to two pending items in the current demo plan into the past.",
            "Leave completed, skipped, and in-progress items untouched.",
            "Refresh the plan summary so the backend can produce a truthful recovery preview.",
        ]
        render.render_helper_preview("Recovery Preparation Helper", helper_preview_reasons, helper_preview_changes)
        if not prompt_yes_no("Apply recovery-state preparation for this demo plan?", default=True):
            self.transcript.info("Recovery preparation helper was declined.")
            return

        recovery_prep = prepare_recovery_state(
            user_id=int(self.state.me["id"]),
            plan_id=plan_id,
        )
        self.state.helper_recovery_prep_used = True
        render.render_recovery_changes(recovery_prep.changed_items)
        for change in recovery_prep.changed_items:
            self.transcript.result(
                f"Recovery prep changed item {change.get('item_id')}: "
                f"{change.get('old_scheduled_date')} -> {change.get('new_scheduled_date')}."
            )

        self.state.active_plan = self.client.get_plan(plan_id)
        self.state.readiness = self.client.get_plan_readiness(plan_id)
        self.state.execution_summary = self.client.get_execution_summary(plan_id)
        self.state.recovery_preview = self.client.get_recovery_preview(plan_id)
        render.render_recovery_preview(self.state.recovery_preview)

    def step_assistant(self) -> None:
        self.transcript.section("Assistant")
        if not self.state.active_plan:
            raise JourneyAborted("An active plan is required before assistant guidance.")

        conversation = self.client.create_conversation(
            title=f"SOLA demo conversation for plan {self.state.active_plan.get('id')}"
        )
        self.state.assistant_conversation = conversation
        self.transcript.result(f"Created assistant conversation {conversation.get('id')}.")

        memory_exchange = self.client.send_assistant_message(
            conversation_id=int(conversation["id"]),
            content="This week I am busy at night, and I need help adjusting my schedule.",
        )
        self.state.assistant_last_exchange = memory_exchange
        render.render_assistant_exchange(memory_exchange)
        render.render_memory_candidates(list(memory_exchange.get("memory_candidates") or []))

        memory_candidates = list(memory_exchange.get("memory_candidates") or [])
        if memory_candidates and prompt_yes_no("Confirm the first assistant memory signal?", default=True):
            confirmed_signal = self.client.confirm_memory_signal(int(memory_candidates[0]["id"]))
            render.success(
                f"Confirmed memory signal {confirmed_signal.get('id')} "
                f"({confirmed_signal.get('signal_key')})."
            )
            self.transcript.result(
                f"Confirmed assistant memory signal {confirmed_signal.get('id')}."
            )

        recovery_exchange = self.client.send_assistant_message(
            conversation_id=int(conversation["id"]),
            content="I am behind on my plan and need help recovering my schedule.",
        )
        self.state.assistant_last_exchange = recovery_exchange
        render.render_assistant_exchange(recovery_exchange)
        render.render_suggested_actions(list(recovery_exchange.get("suggested_actions") or []))

        recovery_action = self._find_recovery_apply_action(list(recovery_exchange.get("suggested_actions") or []))
        if recovery_action and prompt_yes_no("Confirm the assistant recovery action?", default=True):
            try:
                action_result = self.client.confirm_action_run(int(recovery_action["action_run_id"]))
                render.section("Assistant Action Result")
                render.key_value("Action type", action_result.get("action_type"))
                render.key_value("Status", action_result.get("status"))
                render.key_value("Failure reason", action_result.get("failure_reason"))
                render.key_value("Recovery mode", (action_result.get("result_payload") or {}).get("recovery_mode"))
                self.transcript.result(
                    f"Confirmed assistant recovery action run {action_result.get('id')}."
                )
            except ApiError as error:
                render.warning(
                    f"The assistant recovery action could not be confirmed cleanly: {error.detail}"
                )
                self.transcript.warning(
                    f"Assistant recovery confirmation failed with HTTP {error.status_code}; using direct fallback."
                )
                self._apply_recovery_direct_fallback()
        else:
            if not recovery_action:
                render.warning("The assistant did not return a direct recovery-apply action for this state.")
            self._apply_recovery_direct_fallback()

        if len(self.state.recommendations) >= 2:
            comparison_exchange = self.client.send_assistant_message(
                conversation_id=int(conversation["id"]),
                content="Compare the best two course options for me and tell me which one is stronger now.",
            )
            self.state.assistant_last_exchange = comparison_exchange
            render.render_assistant_exchange(comparison_exchange)
            render.render_suggested_actions(list(comparison_exchange.get("suggested_actions") or []))

            queue_action = next(
                (
                    action
                    for action in list(comparison_exchange.get("suggested_actions") or [])
                    if action.get("action_type") == "queue_top_recommendation"
                ),
                None,
            )
            if queue_action and prompt_yes_no(
                "Confirm the assistant queue-top-recommendation action as an optional follow-up?",
                default=False,
            ):
                queue_result = self.client.confirm_action_run(int(queue_action["action_run_id"]))
                render.section("Assistant Queue Action")
                render.key_value("Action type", queue_result.get("action_type"))
                render.key_value("Status", queue_result.get("status"))
                render.key_value("Course ID", (queue_result.get("result_payload") or {}).get("course_id"))
                self.state.queue_items = self.client.list_queue()
                render.render_queue(self.state.queue_items)
                self.transcript.result(
                    f"Confirmed assistant queue action run {queue_result.get('id')}."
                )

        plan_id = int(self.state.active_plan["id"])
        self.state.active_plan = self.client.get_plan(plan_id)
        self.state.readiness = self.client.get_plan_readiness(plan_id)
        self.state.plan_items = self.client.list_plan_items(plan_id)
        self.state.schedule = self._schedule_from_items(self.state.plan_items)
        self.state.execution_summary = self.client.get_execution_summary(plan_id)
        self.state.recovery_preview = self.client.get_recovery_preview(plan_id)
        render.render_recovery_preview(self.state.recovery_preview)

    def step_closeout(self) -> None:
        summary = {
            "user_email": (self.state.me or {}).get("email"),
            "selected_courses": ", ".join(course.get("title") or str(course.get("id")) for course in self.state.selected_courses),
            "plan_id": self.state.plan_id,
            "schedule_items": len(self.state.plan_items),
            "completed_items": (self.state.execution_summary or {}).get("completed_items_count"),
            "skipped_items": (self.state.execution_summary or {}).get("skipped_items_count"),
            "recovery_needed_after_demo": (self.state.recovery_preview or {}).get("needs_recovery"),
            "assistant_conversation_id": (self.state.assistant_conversation or {}).get("id"),
            "catalog_bootstrap_used": self.state.helper_catalog_bootstrap_used,
            "recovery_prep_used": self.state.helper_recovery_prep_used,
            "transcript_file": str(self.state.config.transcript_file) if self.state.config.transcript_file else None,
        }
        render.render_closeout(summary)
        self.transcript.section("Closeout")
        self.transcript.result(f"Demo completed for plan {self.state.plan_id}.")

    def _prompt_profile_payload(self, existing_profile: JsonDict | None) -> JsonDict:
        background_track = self._prompt_from_values(
            "Choose your background track",
            BACKGROUND_TRACK_ORDER,
            default=(existing_profile or {}).get("background_track", "software_engineering"),
        )
        secondary_choices = [track for track in BACKGROUND_TRACK_ORDER if track != background_track]
        secondary_defaults = [
            secondary_choices.index(track)
            for track in (existing_profile or {}).get("secondary_tracks", [])
            if track in secondary_choices
        ]
        secondary_tracks: list[str] = []
        if secondary_choices and prompt_yes_no("Do you want to choose any secondary tracks?", default=False):
            secondary_tracks = [secondary_choices[index] for index in prompt_multi_choice(
                "Select any secondary tracks that matter for this demo",
                secondary_choices,
                min_count=1,
                max_count=min(2, len(secondary_choices)),
                default_indices=secondary_defaults[:2] or None,
            )]

        return {
            "background_track": background_track,
            "primary_track": background_track,
            "secondary_tracks": secondary_tracks,
            "target_role": prompt_text(
                "Target role",
                default=(existing_profile or {}).get("target_role") or "Backend Engineer",
            ),
            "experience_level": self._prompt_from_values(
                "Choose your experience level",
                EXPERIENCE_LEVEL_ORDER,
                default=(existing_profile or {}).get("experience_level", "beginner"),
            ),
            "employment_status": self._prompt_from_values(
                "Choose your employment status",
                EMPLOYMENT_STATUS_ORDER,
                default=(existing_profile or {}).get("employment_status", "job_seeker"),
            ),
            "is_student": prompt_yes_no(
                "Are you currently a student?",
                default=bool((existing_profile or {}).get("is_student", False)),
            ),
            "education_major": prompt_text(
                "Education major",
                default=(existing_profile or {}).get("education_major") or "",
                allow_empty=True,
            ),
            "weekly_hours": prompt_int(
                "How many hours per week can you study?",
                default=int((existing_profile or {}).get("weekly_hours", 8)),
                minimum=1,
                maximum=80,
            ),
            "goal": self._prompt_from_values(
                "Choose your primary goal",
                GOAL_ORDER,
                default=(existing_profile or {}).get("goal", "job"),
            ),
            "preferred_language": self._prompt_from_values(
                "Choose your preferred language",
                LANGUAGE_ORDER,
                default=(existing_profile or {}).get("preferred_language", "en"),
            ),
            "bio": prompt_text(
                "Short bio or learning note",
                default=(existing_profile or {}).get("bio") or "",
                allow_empty=True,
            ),
            "timezone": prompt_text(
                "Timezone",
                default=(existing_profile or {}).get("timezone") or "Asia/Riyadh",
            ),
        }

    def _prompt_from_values(self, question: str, values: list[str], *, default: str) -> str:
        default_index = values.index(default) if default in values else 0
        selected_index = prompt_choice(question, [value.replace("_", " ") for value in values], default_index=default_index)
        return values[selected_index]

    def _preferred_language(self) -> str | None:
        if not self.state.profile:
            return None
        preferred_language = self.state.profile.get("preferred_language")
        return preferred_language if preferred_language in PREFERRED_LANGUAGE_OPTIONS and preferred_language != "any" else None

    def _record_event_best_effort(self, event_type: str, event_payload: JsonDict) -> None:
        try:
            self.client.record_event({"event_type": event_type, "event_payload": event_payload})
        except ApiError as error:
            render.warning(f"Analytics event '{event_type}' could not be recorded: {error.detail}")
            self.transcript.warning(f"Best-effort event '{event_type}' failed with HTTP {error.status_code}.")

    def _dedupe_courses(self, search_items: list[JsonDict], recommendation_items: list[JsonDict]) -> list[JsonDict]:
        deduped: list[JsonDict] = []
        seen_ids: set[int] = set()

        for origin, items in (("search", search_items), ("recommendation", recommendation_items)):
            for course in items:
                course_id = course.get("id")
                if not isinstance(course_id, int) or course_id in seen_ids:
                    continue
                seen_ids.add(course_id)
                deduped.append({**course, "_origin": origin})

        return deduped

    def _prompt_plan_payload(self, selected_queue_items: list[JsonDict]) -> JsonDict:
        selected_titles = [
            item.get("course", {}).get("title") or f"Queue item {item.get('id')}"
            for item in selected_queue_items
        ]
        default_title = f"SOLA Demo Plan: {selected_titles[0]}" if selected_titles else "SOLA Demo Learning Plan"
        default_goal = (
            (self.state.profile or {}).get("target_role")
            or (self.state.learning_state or {}).get("current_focus")
            or "Build a practical learning plan"
        )

        preferred_time_window = self._prompt_from_values(
            "Choose the preferred study window",
            TIME_WINDOW_ORDER,
            default="evening",
        )
        pace_mode = self._prompt_from_values(
            "Choose the pacing mode",
            PACE_MODE_ORDER,
            default="balanced",
        )
        default_day_indices = [
            index
            for index, value in enumerate(STUDY_DAY_ORDER)
            if value in self._default_study_days()
        ]
        selected_day_indices = prompt_multi_choice(
            "Choose the preferred study days",
            [day.title() for day in STUDY_DAY_ORDER],
            min_count=2,
            max_count=5,
            default_indices=default_day_indices or [0, 1, 2],
        )
        preferred_study_days = [STUDY_DAY_ORDER[index] for index in selected_day_indices]

        while True:
            max_daily_minutes = prompt_int(
                "Maximum study minutes per day",
                default=90,
                minimum=30,
                maximum=180,
            )
            session_cap_minutes = prompt_int(
                "Maximum minutes per study session",
                default=30,
                minimum=15,
                maximum=45,
            )
            if session_cap_minutes <= max_daily_minutes:
                break
            render.warning("Session cap minutes cannot be greater than max daily minutes. Please choose again.")

        return {
            "title": prompt_text("Plan title", default=default_title),
            "goal": prompt_text("Plan goal", default=default_goal),
            "queue_item_ids": [int(item["id"]) for item in selected_queue_items[:3]],
            "preferred_time_window": preferred_time_window,
            "pace_mode": pace_mode,
            "preferred_study_days": preferred_study_days,
            "max_daily_minutes": max_daily_minutes,
            "session_cap_minutes": session_cap_minutes,
            "temporary_note": prompt_text(
                "Temporary note for this schedule",
                default="Prepared through the SOLA interactive terminal demo.",
                allow_empty=True,
            ),
        }

    def _default_study_days(self) -> list[str]:
        employment_status = (self.state.profile or {}).get("employment_status")
        is_student = bool((self.state.profile or {}).get("is_student"))
        if employment_status == "employed" or is_student:
            return ["sunday", "monday", "wednesday", "thursday"]
        if employment_status in {"unemployed", "job_seeker"}:
            return ["sunday", "monday", "tuesday", "wednesday", "thursday"]
        return ["sunday", "tuesday", "thursday"]

    def _find_open_plan(self) -> JsonDict | None:
        plans = self.client.list_plans()
        return next((plan for plan in plans if plan.get("status") in {"active", "paused"}), None)

    def _plan_contains_course(self, plan: JsonDict, course_id: int) -> bool:
        return any(int(course.get("course_id") or 0) == course_id for course in list(plan.get("courses") or []))

    def _schedule_from_items(self, items: list[JsonDict]) -> JsonDict:
        scheduled_dates = [item.get("scheduled_date") for item in items if item.get("scheduled_date")]
        return {
            "plan_id": self.state.plan_id,
            "plan_version": self.state.plan_version,
            "schedule_revision": self.state.schedule_revision,
            "total_items": len(items),
            "total_minutes": sum(int(item.get("planned_minutes") or 0) for item in items),
            "scheduled_start_date": min(scheduled_dates) if scheduled_dates else None,
            "scheduled_end_date": max(scheduled_dates) if scheduled_dates else None,
            "items": items,
        }

    def _maybe_run_catalog_bootstrap(self, *, query: str, reason: str) -> bool:
        helper_preview_reasons = [reason]
        helper_preview_changes = [
            "Create or reuse a tiny deterministic demo-scoped course set for the current demo user.",
            "Build ready-to-schedule structures and units only for those demo-scoped courses.",
            "Keep all unrelated catalog records and user progress untouched.",
        ]
        render.render_helper_preview("Catalog Bootstrap Helper", helper_preview_reasons, helper_preview_changes)
        if not prompt_yes_no("Apply the catalog bootstrap helper?", default=True):
            self.transcript.info("Catalog bootstrap helper was declined.")
            return False

        seed_result = ensure_demo_catalog(
            user_id=int(self.state.me["id"]),
            namespace=self.state.config.namespace,
            query=query,
            profile=self.state.profile,
            learning_state=self.state.learning_state,
        )
        self.state.helper_catalog_bootstrap_used = True
        self.state.catalog_source_filter = DEMO_SOURCE
        render.success(
            f"Catalog bootstrap ready. Created {seed_result.created_count}, reused {seed_result.reused_count}, "
            f"scope={seed_result.scope_key}."
        )
        render.render_course_list("Bootstrapped Demo Courses", seed_result.courses)
        self.transcript.result(
            f"Catalog bootstrap applied with scope {seed_result.scope_key} "
            f"(created={seed_result.created_count}, reused={seed_result.reused_count})."
        )
        return True

    def _ensure_course_structure_ready(self, course: JsonDict) -> JsonDict | None:
        course_id = int(course["id"])
        structure = self.client.get_course_structure(course_id)
        if structure and structure.get("build_status") == "built" and int(structure.get("total_units") or 0) > 0:
            return structure

        render.info(f"Course {course.get('title')} needs a built structure before it can be scheduled.")
        if not prompt_yes_no("Build the course structure now?", default=True):
            return None

        try:
            structure = self.client.build_course_structure(course_id)
        except ApiError as error:
            render.warning(
                f"Course structure build failed for {course.get('title')}: {error.detail}"
            )
            self.transcript.warning(
                f"Course structure build failed for course {course_id} with HTTP {error.status_code}."
            )
            return None

        if structure.get("build_status") != "built" or int(structure.get("total_units") or 0) <= 0:
            render.warning(f"Course structure for {course.get('title')} is still not ready for scheduling.")
            return None
        return structure

    def _find_recovery_apply_action(self, actions: list[JsonDict]) -> JsonDict | None:
        for action in actions:
            if action.get("action_type") in VERIFIED_RECOVERY_APPLY_ACTION_TYPES:
                return action

        compatible_aliases = {
            "apply_recovery_plan",
            "apply_recovery",
            "recovery_apply",
        }
        for action in actions:
            if action.get("action_type") in compatible_aliases:
                render.warning(
                    f"Using compatible repository action type {action.get('action_type')} for recovery apply confirmation."
                )
                self.transcript.warning(
                    f"Assistant recovery action matched compatible type {action.get('action_type')}."
                )
                return action

        return None

    def _apply_recovery_direct_fallback(self) -> None:
        if not self.state.active_plan:
            return

        plan_id = int(self.state.active_plan["id"])
        self.state.recovery_preview = self.client.get_recovery_preview(plan_id)
        if not self.state.recovery_preview.get("needs_recovery"):
            render.info("Direct recovery fallback was not needed because the plan no longer requires recovery.")
            return

        recommended_mode = self.state.recovery_preview.get("recommended_recovery_mode")
        if not recommended_mode:
            render.warning("Direct recovery fallback is unavailable because the backend did not expose a recommended recovery mode.")
            return

        render.info(
            "Falling back to the direct recovery endpoint because the assistant did not yield a usable recovery-apply confirmation path."
        )
        if not prompt_yes_no("Apply the direct recovery fallback now?", default=True):
            self.transcript.info("Direct recovery fallback was declined.")
            return

        recovery_result = self.client.apply_recovery(
            plan_id=plan_id,
            payload={
                "mode": recommended_mode,
                "expected_version": int(self.state.recovery_preview["plan_version"]),
                "expected_schedule_revision": int(self.state.recovery_preview["schedule_revision"]),
                "recovery_note": "Applied from the SOLA interactive terminal demo fallback.",
            },
        )
        render.section("Direct Recovery Apply")
        render.key_value("Plan ID", recovery_result.get("plan_id"))
        render.key_value("Recovery mode", recovery_result.get("recovery_mode"))
        render.key_value("Schedule revision", recovery_result.get("schedule_revision"))
        render.key_value("Rebuilt pending items", recovery_result.get("rebuilt_pending_items_count"))
        self.transcript.result(
            f"Applied direct recovery fallback for plan {recovery_result.get('plan_id')} "
            f"using mode {recovery_result.get('recovery_mode')}."
        )
