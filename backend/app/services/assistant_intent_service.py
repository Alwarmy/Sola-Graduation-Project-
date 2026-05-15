from __future__ import annotations

import re

SCHEDULE_KEYWORDS = {
    "schedule",
    "جدول",
    "الجدول",
    "وقت",
    "دوام",
    "مشغول",
    "ليل",
    "نهار",
    "صباح",
    "مساء",
    "night",
    "morning",
    "evening",
    "busy",
    "shift",
}
NEXT_COURSE_KEYWORDS = {
    "وش",
    "ماذا",
    "ادرس",
    "أدرس",
    "القادمة",
    "بعد",
    "next",
    "study",
    "learn",
}
CONCEPT_HELP_KEYWORDS = {
    "ما",
    "مو",
    "اشرح",
    "فهمت",
    "فاهم",
    "explain",
    "understand",
    "loop",
    "loops",
    "for",
    "while",
    "function",
    "functions",
    "recursion",
    "linear",
    "regression",
}
RECOMMENDATION_KEYWORDS = {
    "ليش",
    "why",
    "رشحت",
    "recommended",
    "recommendation",
    "course",
    "دورة",
    "recommend",
}
PROGRESS_KEYWORDS = {
    "تقدمي",
    "progress",
    "how am i doing",
    "وين وصلت",
    "وين واصل",
    "status",
    "الخطة",
    "plan",
    "مستواي",
}
RECOVERY_KEYWORDS = {
    "متأخر",
    "متاخر",
    "overdue",
    "behind",
    "catch up",
    "recover",
    "recovery",
    "الحق",
    "متراكم",
}
COURSE_COMPARISON_KEYWORDS = {
    "compare",
    "comparison",
    "versus",
    "vs",
    "قارن",
    "مقارنة",
    "بين",
    "بديل",
    "أفضل",
    "افضل",
}

INTENT_OPTIONS = {
    "schedule_support",
    "next_course_guidance",
    "recommendation_explanation",
    "study_concept_help",
    "progress_reflection",
    "recovery_guidance",
    "course_comparison",
    "general_guidance",
}


def normalize_message_tokens(message: str) -> list[str]:
    normalized = message.lower()
    normalized = re.sub(r"[^\w\s؀-ۿ]", " ", normalized)
    return [token for token in normalized.split() if token]


def detect_assistant_intent(message: str) -> str:
    tokens = set(normalize_message_tokens(message))
    lowered = " ".join(message.lower().split())

    if any(phrase in lowered for phrase in ["قارن", "مقارنة", "compare", "compare the", "which is better", "best two options"]):
        return "course_comparison"
    if tokens.intersection(COURSE_COMPARISON_KEYWORDS) and tokens.intersection({"course", "دورة", "recommendation", "بديل", "option", "options"}):
        return "course_comparison"

    if any(phrase in lowered for phrase in ["متأخر", "متاخر", "behind schedule", "catch up", "recover"]):
        return "recovery_guidance"
    if tokens.intersection(RECOVERY_KEYWORDS):
        return "recovery_guidance"

    if any(phrase in lowered for phrase in ["جدولي", "مو مناسب", "not suitable", "change my schedule"]):
        return "schedule_support"
    if tokens.intersection(SCHEDULE_KEYWORDS):
        return "schedule_support"

    if tokens.intersection(RECOMMENDATION_KEYWORDS) and any(
        phrase in lowered for phrase in ["ليش", "why", "رشحت", "recommended", "why this course"]
    ):
        return "recommendation_explanation"

    if (
        tokens.intersection(NEXT_COURSE_KEYWORDS)
        and any(phrase in lowered for phrase in ["بعد", "next", "القادمة", "وش أدرس", "what should i study"])
    ):
        return "next_course_guidance"

    if tokens.intersection(CONCEPT_HELP_KEYWORDS) and any(
        phrase in lowered
        for phrase in [
            "ما فهمت",
            "مو فاهم",
            "اشرح",
            "explain",
            "understand",
            "loop",
            "for loop",
            "while",
            "function",
            "recursion",
            "regression",
        ]
    ):
        return "study_concept_help"

    if tokens.intersection(PROGRESS_KEYWORDS) or any(
        phrase in lowered for phrase in ["كيف تقدمي", "how am i doing", "وين وصلت", "review my plan"]
    ):
        return "progress_reflection"

    return "general_guidance"
