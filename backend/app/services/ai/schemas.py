from typing import Literal
from pydantic import BaseModel


class CourseValidationDecision(BaseModel):
    external_id: str
    accepted: bool
    detected_language: Literal["ar", "en", "other", "unknown"]
    reason: str


class CourseValidationResponse(BaseModel):
    items: list[CourseValidationDecision]