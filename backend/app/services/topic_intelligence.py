from collections import Counter


CANONICAL_TOPIC_PATTERNS: dict[str, set[str]] = {
    "python": {"python", "py"},
    "java": {"java", "spring"},
    "javascript": {"javascript", "js"},
    "react": {"react", "jsx"},
    "react_native": {"reactnative", "react", "native"},
    "frontend": {"frontend", "html", "css", "javascript", "react"},
    "backend": {"backend", "api", "server", "fastapi", "django", "flask", "spring"},
    "web_development": {"web", "frontend", "backend", "html", "css", "javascript", "react"},
    "data_science": {"data", "analysis", "analytics", "statistics", "pandas", "numpy"},
    "machine_learning": {"machine", "learning", "ml", "scikit", "sklearn"},
    "deep_learning": {"deep", "neural", "tensorflow", "keras", "pytorch"},
    "generative_ai": {"generative", "llm", "gpt", "transformer", "rag"},
    "ai": {"ai", "artificial", "intelligence"},
    "databases": {"database", "databases", "sql", "postgresql", "mysql", "mongodb"},
    "mobile_development": {"mobile", "android", "ios", "flutter", "reactnative"},
    "cybersecurity": {"cybersecurity", "security", "network", "penetration"},
    "accounting": {"accounting", "bookkeeping"},
    "economics": {"economics", "economic"},
    "finance": {"finance", "investment"},
    "design": {"design", "ui", "ux", "figma"},
}

WEAK_TOKENS = {
    "programming",
    "coding",
    "development",
    "computer",
    "science",
    "technology",
    "software",
    "engineer",
    "engineering",
    "course",
    "tutorial",
}

BACKGROUND_TRACK_TO_TOPICS: dict[str, list[str]] = {
    "software_engineering": ["python"],
    "web_development": ["web_development", "frontend", "backend", "react", "javascript"],
    "mobile_development": ["mobile_development", "react_native"],
    "data_science": ["data_science", "python", "machine_learning"],
    "ai_ml": ["ai", "machine_learning", "deep_learning", "generative_ai", "python"],
    "cybersecurity": ["cybersecurity"],
    "accounting": ["accounting", "finance", "databases"],
    "economics": ["economics", "finance", "data_science"],
    "finance": ["finance", "economics", "data_science"],
    "business": [],
    "marketing": [],
    "design": ["design"],
    "physics": [],
    "mathematics": ["data_science"],
    "medicine": [],
    "law": [],
    "education": [],
    "other": [],
}

TOPIC_PRIORITY = {
    "generative_ai": 100,
    "deep_learning": 95,
    "machine_learning": 90,
    "data_science": 85,
    "react_native": 84,
    "react": 82,
    "python": 80,
    "javascript": 78,
    "java": 76,
    "frontend": 60,
    "backend": 58,
    "web_development": 55,
    "ai": 54,
    "databases": 50,
    "mobile_development": 48,
    "cybersecurity": 46,
    "finance": 40,
    "economics": 38,
    "accounting": 36,
    "design": 34,
}

CANONICAL_DOMINANCE_RULES = {
    "machine": "machine_learning",
    "learning": "machine_learning",
    "ml": "machine_learning",
    "deep": "deep_learning",
    "neural": "deep_learning",
    "llm": "generative_ai",
    "gpt": "generative_ai",
    "rag": "generative_ai",
    "reactnative": "react_native",
}


def tokenize_text(value: str | None) -> list[str]:
    if not value:
        return []

    normalized = value.lower()
    for char in [",", ".", "|", "/", "-", "_", "(", ")", "[", "]", "{", "}", ":", ";"]:
        normalized = normalized.replace(char, " ")

    tokens = [token.strip() for token in normalized.split() if token.strip()]

    stopwords = {
        "for",
        "and",
        "the",
        "to",
        "in",
        "with",
        "course",
        "courses",
        "tutorial",
        "tutorials",
        "full",
        "learn",
        "learning",
        "beginner",
        "beginners",
        "complete",
        "from",
        "scratch",
        "part",
        "all",
        "one",
        "want",
        "become",
        "strong",
        "good",
        "match",
        "job",
        "projects",
        "project",
        "introduction",
    }

    return [
        token
        for token in tokens
        if token not in stopwords and token not in WEAK_TOKENS and len(token) > 1
    ]


def apply_canonical_dominance(topics: list[str]) -> list[str]:
    topic_set = set(topics)

    if "machine_learning" in topic_set:
        topic_set.discard("machine")
        topic_set.discard("learning")
        topic_set.discard("ml")

    if "deep_learning" in topic_set:
        topic_set.discard("deep")
        topic_set.discard("neural")

    if "generative_ai" in topic_set:
        topic_set.discard("ai")
        topic_set.discard("llm")
        topic_set.discard("gpt")
        topic_set.discard("rag")

    if "react_native" in topic_set:
        topic_set.discard("react")

    return list(topic_set)


def normalize_topic_tokens(tokens: list[str]) -> list[str]:
    normalized_topics: list[str] = []
    token_set = set(tokens)

    for canonical_topic, patterns in CANONICAL_TOPIC_PATTERNS.items():
        if token_set.intersection(patterns):
            normalized_topics.append(canonical_topic)

    for token in tokens:
        dominant = CANONICAL_DOMINANCE_RULES.get(token)
        if dominant:
            normalized_topics.append(dominant)

    normalized_topics = apply_canonical_dominance(normalized_topics)

    unique_topics = []
    seen = set()
    for topic in normalized_topics:
        if topic not in seen:
            seen.add(topic)
            unique_topics.append(topic)

    unique_topics.sort(key=lambda topic: TOPIC_PRIORITY.get(topic, 10), reverse=True)
    return unique_topics


def extract_canonical_topics_from_text(value: str | None) -> list[str]:
    tokens = tokenize_text(value)
    return normalize_topic_tokens(tokens)


def build_background_seed_topics(background_track: str | None) -> list[str]:
    if not background_track:
        return []

    topics = BACKGROUND_TRACK_TO_TOPICS.get(background_track, [])
    return apply_canonical_dominance(topics)


def summarize_topic_counts(topic_list: list[str]) -> dict[str, int]:
    return dict(Counter(topic_list))


def top_topics(topic_list: list[str], limit: int) -> list[str]:
    counter = Counter(topic_list)
    ranked = sorted(
        counter.items(),
        key=lambda item: (item[1], TOPIC_PRIORITY.get(item[0], 10)),
        reverse=True,
    )
    return [topic for topic, _count in ranked[:limit]]