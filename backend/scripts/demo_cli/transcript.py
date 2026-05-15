from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass(slots=True)
class SessionTranscript:
    path: Path | None = None

    def __post_init__(self) -> None:
        if self.path is None:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        started_at = datetime.now(timezone.utc).isoformat()
        self.path.write_text(
            f"SOLA demo session transcript\nStarted at: {started_at}\n\n",
            encoding="utf-8",
        )

    @property
    def enabled(self) -> bool:
        return self.path is not None

    def record(self, category: str, message: str) -> None:
        if not self.path:
            return
        timestamp = datetime.now(timezone.utc).strftime("%H:%M:%S")
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(f"[{timestamp}] {category.upper()}: {message}\n")

    def section(self, title: str) -> None:
        self.record("section", title)

    def info(self, message: str) -> None:
        self.record("info", message)

    def warning(self, message: str) -> None:
        self.record("warning", message)

    def result(self, message: str) -> None:
        self.record("result", message)
