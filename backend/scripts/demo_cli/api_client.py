from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

import requests


JsonDict = dict[str, Any]


@dataclass(slots=True)
class ApiError(Exception):
    method: str
    path: str
    status_code: int
    detail: str
    error_code: str | None
    request_id: str | None
    details: Any
    response_text: str

    def __str__(self) -> str:
        parts = [f"{self.method} {self.path} failed with HTTP {self.status_code}"]
        if self.error_code:
            parts.append(f"error_code={self.error_code}")
        if self.detail:
            parts.append(f"detail={self.detail}")
        if self.request_id:
            parts.append(f"request_id={self.request_id}")
        return " | ".join(parts)


class SolaApiClient:
    def __init__(self, *, base_url: str, timeout_seconds: int) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Accept": "application/json",
                "User-Agent": "SOLA-Demo-CLI/1.0",
            }
        )

    def set_access_token(self, access_token: str | None) -> None:
        if access_token:
            self.session.headers["Authorization"] = f"Bearer {access_token}"
        else:
            self.session.headers.pop("Authorization", None)

    def _request(
        self,
        method: str,
        path: str,
        *,
        expected_statuses: Iterable[int] = (200,),
        json_payload: JsonDict | None = None,
        params: JsonDict | None = None,
        headers: JsonDict | None = None,
    ) -> Any:
        try:
            response = self.session.request(
                method=method,
                url=f"{self.base_url}{path}",
                json=json_payload,
                params=params,
                headers=headers,
                timeout=self.timeout_seconds,
            )
        except requests.RequestException as error:
            raise ApiError(
                method=method.upper(),
                path=path,
                status_code=0,
                detail=str(error),
                error_code="transport_error",
                request_id=None,
                details=None,
                response_text=str(error),
            ) from error

        if response.status_code not in set(expected_statuses):
            raise self._build_error(method=method, path=path, response=response)

        if response.status_code == 204 or not response.text:
            return None

        try:
            return response.json()
        except ValueError:
            return response.text

    def _build_error(self, *, method: str, path: str, response: requests.Response) -> ApiError:
        payload: dict[str, Any] = {}
        try:
            parsed = response.json()
            if isinstance(parsed, dict):
                payload = parsed
        except ValueError:
            payload = {}

        return ApiError(
            method=method.upper(),
            path=path,
            status_code=response.status_code,
            detail=str(payload.get("detail") or response.text or "Request failed."),
            error_code=payload.get("error_code"),
            request_id=str(payload.get("request_id") or response.headers.get("X-Request-ID") or "") or None,
            details=payload.get("details"),
            response_text=response.text,
        )

    def get_root(self) -> JsonDict:
        payload = self._request("GET", "/", expected_statuses=(200,))
        return payload if isinstance(payload, dict) else {"message": str(payload)}

    def get_db_health(self) -> JsonDict:
        payload = self._request("GET", "/health/db", expected_statuses=(200,))
        return payload if isinstance(payload, dict) else {"status": str(payload)}

    def register(self, payload: JsonDict) -> JsonDict:
        result = self._request("POST", "/auth/register", expected_statuses=(201,), json_payload=payload)
        return result if isinstance(result, dict) else {}

    def login(self, payload: JsonDict) -> JsonDict:
        result = self._request("POST", "/auth/login", expected_statuses=(200,), json_payload=payload)
        return result if isinstance(result, dict) else {}

    def get_me(self) -> JsonDict:
        result = self._request("GET", "/auth/me", expected_statuses=(200,))
        return result if isinstance(result, dict) else {}

    def get_profile(self) -> JsonDict | None:
        try:
            result = self._request("GET", "/profile", expected_statuses=(200,))
        except ApiError as error:
            if error.status_code == 404:
                return None
            raise
        return result if isinstance(result, dict) else {}

    def create_profile(self, payload: JsonDict) -> JsonDict:
        result = self._request("POST", "/profile", expected_statuses=(201,), json_payload=payload)
        return result if isinstance(result, dict) else {}

    def update_profile(self, payload: JsonDict) -> JsonDict:
        result = self._request("PUT", "/profile", expected_statuses=(200,), json_payload=payload)
        return result if isinstance(result, dict) else {}

    def get_learning_state(self) -> JsonDict | None:
        try:
            result = self._request("GET", "/learning-state", expected_statuses=(200,))
        except ApiError as error:
            if error.status_code == 404:
                return None
            raise
        return result if isinstance(result, dict) else {}

    def refresh_learning_state(self) -> JsonDict:
        result = self._request("POST", "/learning-state/refresh", expected_statuses=(200,), json_payload={})
        return result if isinstance(result, dict) else {}

    def search_courses(
        self,
        *,
        query: str,
        sort_by: str,
        language: str | None = None,
        source: str | None = None,
    ) -> JsonDict:
        params: JsonDict = {
            "q": query,
            "sort_by": sort_by,
            "limit": 6,
            "offset": 0,
        }
        if language:
            params["language"] = language
        if source:
            params["source"] = source
        result = self._request("GET", "/courses/search", expected_statuses=(200,), params=params)
        return result if isinstance(result, dict) else {}

    def get_recommendations(self, *, limit: int = 5) -> JsonDict:
        result = self._request("GET", "/recommendations", expected_statuses=(200,), params={"limit": limit})
        return result if isinstance(result, dict) else {}

    def get_course(self, course_id: int) -> JsonDict:
        result = self._request("GET", f"/courses/{course_id}", expected_statuses=(200,))
        return result if isinstance(result, dict) else {}

    def get_course_structure(self, course_id: int) -> JsonDict | None:
        try:
            result = self._request("GET", f"/course-structures/{course_id}", expected_statuses=(200,))
        except ApiError as error:
            if error.status_code == 404:
                return None
            raise
        return result if isinstance(result, dict) else {}

    def build_course_structure(self, course_id: int) -> JsonDict:
        result = self._request("POST", f"/course-structures/{course_id}/build", expected_statuses=(200,))
        return result if isinstance(result, dict) else {}

    def record_event(self, payload: JsonDict) -> JsonDict:
        result = self._request("POST", "/events", expected_statuses=(201,), json_payload=payload)
        return result if isinstance(result, dict) else {}

    def list_queue(self) -> list[JsonDict]:
        result = self._request("GET", "/plans/queue", expected_statuses=(200,))
        return result if isinstance(result, list) else []

    def add_to_queue(self, course_id: int, *, note: str | None = None) -> JsonDict:
        result = self._request(
            "POST",
            f"/plans/queue/{course_id}",
            expected_statuses=(201,),
            json_payload={"note": note},
        )
        return result if isinstance(result, dict) else {}

    def create_plan(self, payload: JsonDict) -> JsonDict:
        result = self._request("POST", "/plans", expected_statuses=(201,), json_payload=payload)
        return result if isinstance(result, dict) else {}

    def list_plans(self) -> list[JsonDict]:
        result = self._request("GET", "/plans", expected_statuses=(200,))
        return result if isinstance(result, list) else []

    def get_active_plan(self) -> JsonDict | None:
        try:
            result = self._request("GET", "/plans/active", expected_statuses=(200,))
        except ApiError as error:
            if error.status_code == 404:
                return None
            raise
        return result if isinstance(result, dict) else {}

    def get_plan(self, plan_id: int) -> JsonDict:
        result = self._request("GET", f"/plans/{plan_id}", expected_statuses=(200,))
        return result if isinstance(result, dict) else {}

    def get_plan_readiness(self, plan_id: int) -> JsonDict:
        result = self._request("GET", f"/plans/{plan_id}/readiness", expected_statuses=(200,))
        return result if isinstance(result, dict) else {}

    def update_plan_status(self, *, plan_id: int, status: str, expected_version: int) -> JsonDict:
        result = self._request(
            "PUT",
            f"/plans/{plan_id}/status",
            expected_statuses=(200,),
            json_payload={
                "status": status,
                "expected_version": expected_version,
            },
        )
        return result if isinstance(result, dict) else {}

    def add_queue_item_to_plan(self, *, plan_id: int, queue_item_id: int, expected_version: int) -> JsonDict:
        result = self._request(
            "POST",
            f"/plans/{plan_id}/courses/queue-items/{queue_item_id}",
            expected_statuses=(200,),
            headers={"X-Expected-Version": str(expected_version)},
        )
        return result if isinstance(result, dict) else {}

    def generate_schedule(
        self,
        *,
        plan_id: int,
        expected_version: int,
        force_rebuild: bool = False,
        expected_schedule_revision: int | None = None,
    ) -> JsonDict:
        payload: JsonDict = {
            "force_rebuild": force_rebuild,
            "expected_version": expected_version,
        }
        if expected_schedule_revision is not None:
            payload["expected_schedule_revision"] = expected_schedule_revision
        result = self._request(
            "POST",
            f"/plans/{plan_id}/schedule/generate",
            expected_statuses=(200,),
            json_payload=payload,
        )
        return result if isinstance(result, dict) else {}

    def list_plan_items(self, plan_id: int, *, actionable_only: bool = False) -> list[JsonDict]:
        result = self._request(
            "GET",
            f"/plans/{plan_id}/items",
            expected_statuses=(200,),
            params={"actionable_only": str(actionable_only).lower()},
        )
        return result if isinstance(result, list) else []

    def get_execution_summary(self, plan_id: int) -> JsonDict:
        result = self._request("GET", f"/plans/{plan_id}/execution-summary", expected_statuses=(200,))
        return result if isinstance(result, dict) else {}

    def start_plan_item(self, *, plan_id: int, item_id: int, expected_version: int) -> JsonDict:
        result = self._request(
            "POST",
            f"/plans/{plan_id}/items/{item_id}/start",
            expected_statuses=(200,),
            headers={"X-Expected-Version": str(expected_version)},
        )
        return result if isinstance(result, dict) else {}

    def complete_plan_item(
        self,
        *,
        plan_id: int,
        item_id: int,
        actual_minutes: int | None,
        expected_version: int,
    ) -> JsonDict:
        result = self._request(
            "POST",
            f"/plans/{plan_id}/items/{item_id}/complete",
            expected_statuses=(200,),
            json_payload={
                "actual_minutes": actual_minutes,
                "expected_version": expected_version,
            },
        )
        return result if isinstance(result, dict) else {}

    def skip_plan_item(
        self,
        *,
        plan_id: int,
        item_id: int,
        skip_reason: str,
        expected_version: int,
    ) -> JsonDict:
        result = self._request(
            "POST",
            f"/plans/{plan_id}/items/{item_id}/skip",
            expected_statuses=(200,),
            json_payload={
                "skip_reason": skip_reason,
                "expected_version": expected_version,
            },
        )
        return result if isinstance(result, dict) else {}

    def get_recovery_preview(self, plan_id: int) -> JsonDict:
        result = self._request("GET", f"/plans/{plan_id}/recovery-preview", expected_statuses=(200,))
        return result if isinstance(result, dict) else {}

    def apply_recovery(self, *, plan_id: int, payload: JsonDict) -> JsonDict:
        result = self._request("POST", f"/plans/{plan_id}/recover", expected_statuses=(200,), json_payload=payload)
        return result if isinstance(result, dict) else {}

    def create_conversation(self, *, title: str | None = None) -> JsonDict:
        result = self._request(
            "POST",
            "/assistant/conversations",
            expected_statuses=(201,),
            json_payload={"title": title},
        )
        return result if isinstance(result, dict) else {}

    def send_assistant_message(self, *, conversation_id: int, content: str) -> JsonDict:
        result = self._request(
            "POST",
            f"/assistant/conversations/{conversation_id}/messages",
            expected_statuses=(200,),
            json_payload={"content": content},
        )
        return result if isinstance(result, dict) else {}

    def confirm_memory_signal(self, signal_id: int) -> JsonDict:
        result = self._request(
            "POST",
            f"/assistant/memory-signals/{signal_id}/confirm",
            expected_statuses=(200,),
        )
        return result if isinstance(result, dict) else {}

    def confirm_action_run(self, action_run_id: int) -> JsonDict:
        result = self._request(
            "POST",
            f"/assistant/action-runs/{action_run_id}/confirm",
            expected_statuses=(200,),
        )
        return result if isinstance(result, dict) else {}
