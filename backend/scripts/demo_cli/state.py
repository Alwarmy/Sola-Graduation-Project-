from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from scripts.demo_cli import DEFAULT_BASE_URL, DEFAULT_NAMESPACE, DEFAULT_TIMEOUT_SECONDS


JsonDict = dict[str, Any]


@dataclass(slots=True)
class DemoConfig:
    base_url: str = DEFAULT_BASE_URL
    namespace: str = DEFAULT_NAMESPACE
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS
    transcript_file: Path | None = None


@dataclass(slots=True)
class AuthState:
    email: str | None = None
    full_name: str | None = None
    access_token: str | None = None
    refresh_token: str | None = None
    session_id: str | None = None


@dataclass(slots=True)
class DemoState:
    config: DemoConfig
    auth: AuthState = field(default_factory=AuthState)
    me: JsonDict | None = None
    profile: JsonDict | None = None
    learning_state: JsonDict | None = None
    search_query: str | None = None
    catalog_source_filter: str | None = None
    search_results: list[JsonDict] = field(default_factory=list)
    recommendations: list[JsonDict] = field(default_factory=list)
    selected_courses: list[JsonDict] = field(default_factory=list)
    queue_items: list[JsonDict] = field(default_factory=list)
    active_plan: JsonDict | None = None
    readiness: JsonDict | None = None
    schedule: JsonDict | None = None
    plan_items: list[JsonDict] = field(default_factory=list)
    execution_summary: JsonDict | None = None
    recovery_preview: JsonDict | None = None
    assistant_conversation: JsonDict | None = None
    assistant_last_exchange: JsonDict | None = None
    helper_catalog_bootstrap_used: bool = False
    helper_recovery_prep_used: bool = False

    @property
    def user_id(self) -> int | None:
        if not self.me:
            return None
        user_id = self.me.get("id")
        return int(user_id) if isinstance(user_id, int) else None

    @property
    def plan_id(self) -> int | None:
        if not self.active_plan:
            return None
        plan_id = self.active_plan.get("id")
        return int(plan_id) if isinstance(plan_id, int) else None

    @property
    def plan_version(self) -> int | None:
        if not self.active_plan:
            return None
        version = self.active_plan.get("version")
        return int(version) if isinstance(version, int) else None

    @property
    def schedule_revision(self) -> int | None:
        if not self.active_plan:
            return None
        revision = self.active_plan.get("schedule_revision")
        return int(revision) if isinstance(revision, int) else None
