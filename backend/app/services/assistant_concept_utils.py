from __future__ import annotations

import re


HELP_PATTERNS = [
    r"(?:i do not understand|i don't understand|i still don't understand|help me understand|explain|what is|what does|clarify)\s+(?P<concept>.+)",
    r"(?:ما فهمت|مو فاهم|مو فاهمه|اشرح|وش يعني|ايش يعني|ما معنى|وش هو|وش هي|وش المقصود بـ|ايش المقصود بـ)\s+(?P<concept>.+)",
]

TRAILING_NOISE = {
    "exactly",
    "yet",
    "really",
    "please",
    "بالضبط",
    "الحين",
    "مرة",
    "مره",
    "بصراحة",
    "بصراحه",
}

LEADING_NOISE = {
    "the",
    "a",
    "an",
    "موضوع",
    "مفهوم",
    "concept",
    "topic",
}


def _clean_text(value: str) -> str:
    value = value.strip().strip("\"'`“”‘’")
    value = re.sub(r"[\?\!\.\,\:\;\(\)\[\]\{\}]+", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def _trim_noise_tokens(value: str) -> str:
    tokens = value.split()
    while tokens and tokens[0].lower() in LEADING_NOISE:
        tokens.pop(0)
    while tokens and tokens[-1].lower() in TRAILING_NOISE:
        tokens.pop()
    return " ".join(tokens).strip()


def normalize_concept_label(value: str) -> str:
    value = _clean_text(value)
    value = _trim_noise_tokens(value)
    value = re.sub(r"\s+", " ", value).strip().lower()
    return value[:120]


def extract_requested_concept(message: str) -> str | None:
    raw = message.strip()
    if not raw:
        return None

    for pattern in HELP_PATTERNS:
        match = re.search(pattern, raw, flags=re.IGNORECASE)
        if match:
            concept = normalize_concept_label(match.group("concept"))
            return concept or None

    quoted = re.findall(r"['\"`“”‘’]([^'\"`“”‘’]{2,120})['\"`“”‘’]", raw)
    if quoted:
        concept = normalize_concept_label(quoted[0])
        return concept or None

    return None
