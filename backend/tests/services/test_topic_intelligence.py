from app.services.topic_intelligence import extract_canonical_topics_from_text, top_topics


def test_extract_canonical_topics_from_text_prioritizes_machine_learning_and_python() -> None:
    topics = extract_canonical_topics_from_text("machine learning with python for beginners")
    assert topics[:2] == ["machine_learning", "python"]


def test_top_topics_orders_by_frequency_then_priority() -> None:
    ranked = top_topics(["python", "machine_learning", "python", "data_science"], limit=2)
    assert ranked == ["python", "machine_learning"]
