from app.services.assistant_intent_service import detect_assistant_intent


def test_detect_assistant_intent_identifies_schedule_support() -> None:
    assert detect_assistant_intent("جدولي مو مناسب وأنا أشتغل ليل") == "schedule_support"


def test_detect_assistant_intent_identifies_next_course_guidance() -> None:
    assert detect_assistant_intent("وش أدرس بعد ما أخلص بايثون؟") == "next_course_guidance"


def test_detect_assistant_intent_identifies_concept_help() -> None:
    assert detect_assistant_intent("ما فهمت ال loop في بايثون") == "study_concept_help"


def test_detect_assistant_intent_identifies_recovery_guidance() -> None:
    assert detect_assistant_intent("أنا متأخر وأبغى ألحق الجدول") == "recovery_guidance"


def test_detect_assistant_intent_identifies_progress_reflection() -> None:
    assert detect_assistant_intent("كيف تقدمي في الخطة؟") == "progress_reflection"


def test_detect_assistant_intent_identifies_course_comparison() -> None:
    assert detect_assistant_intent("Compare the best two course options for me") == "course_comparison"
