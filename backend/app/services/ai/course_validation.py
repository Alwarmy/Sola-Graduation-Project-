from __future__ import annotations

import json
import logging
from typing import Any

from app.core.config import settings
from app.services.ai.client import get_openai_client
from app.services.ai.prompts import COURSE_VALIDATION_SYSTEM_PROMPT
from app.services.ai.schemas import CourseValidationResponse

logger = logging.getLogger(__name__)

FALLBACK_REASON = "ai_validation_fallback"


def _build_fallback_decisions(
    candidates: list[dict[str, Any]],
    *,
    reason: str,
) -> dict[str, dict[str, Any]]:
    decisions: dict[str, dict[str, Any]] = {}

    for candidate in candidates:
        external_id = str(candidate.get("external_id") or "").strip()
        if not external_id:
            continue

        detected_language = candidate.get("heuristic_language")
        if detected_language not in {"ar", "en"}:
            detected_language = None

        decisions[external_id] = {
            "accepted": True,
            "detected_language": detected_language,
            "reason": reason,
            "validated_by_ai": False,
        }

    return decisions


def validate_course_candidates(
    candidates: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    if not candidates:
        return {}

    try:
        client = get_openai_client()

        user_payload = {
            "candidates": candidates,
        }

        response = client.chat.completions.create(
            model=settings.AI_MODEL_NAME,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": COURSE_VALIDATION_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(user_payload, ensure_ascii=False),
                },
            ],
        )

        raw_content = response.choices[0].message.content
        parsed = json.loads(raw_content)
        validated = CourseValidationResponse(**parsed)

        decisions: dict[str, dict[str, Any]] = {}

        for item in validated.items:
            decisions[item.external_id] = {
                "accepted": item.accepted,
                "detected_language": item.detected_language,
                "reason": item.reason,
                "validated_by_ai": True,
            }

        if len(decisions) < len(candidates):
            fallback_decisions = _build_fallback_decisions(
                candidates=candidates,
                reason=FALLBACK_REASON,
            )
            for external_id, decision in fallback_decisions.items():
                decisions.setdefault(external_id, decision)

        return decisions

    except Exception:
        logger.exception(
            "AI course validation unavailable; falling back to heuristic candidate acceptance."
        )
        return _build_fallback_decisions(
            candidates=candidates,
            reason=FALLBACK_REASON,
        )