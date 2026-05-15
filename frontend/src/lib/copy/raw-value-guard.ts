/**
 * Raw-value guard.
 *
 * Block 1 §4.5 (User-Facing Language) forbids rendering any of the
 * following to learners:
 *   - the literal strings "null", "undefined", "NaN"
 *   - raw `snake_case` enum identifiers
 *   - backend/internal/admin/ingest/raw/pipeline wording
 *   - provider/API-key technical terms
 *
 * This module is a defensive last line of defense. UI primitives and
 * formatters route their output through it via `assertSafeCopy()` in
 * development; production behavior is unchanged but the same predicate is
 * used by tests to fail the build when a violation is introduced.
 *
 * The guard is intentionally simple: a denylist of internal terms plus a
 * `snake_case` heuristic that requires a lowercase letter followed by an
 * underscore (so words like "in_progress" trip it but "1_a" or "_x" do not).
 */

const FORBIDDEN_TERMS = [
  // backend pipeline / admin / raw ingestion wording
  "ingest",
  "ingestion",
  "raw_course",
  "rawcourse",
  "raw scraped",
  "pipeline",
  "admin console",
  "admin-only",
  "backend internal",
  "internal pipeline",
  "fallback",
  "local replacement",
  // technical leakage
  "api_key",
  "api key",
  "stack trace",
  "traceback",
  "stacktrace",
  // value-leak sentinels (lower-case form)
  "undefined",
  "null",
  "nan",
] as const;

const SNAKE_CASE_RE = /[a-z][a-z0-9]*_[a-z0-9_]+/;

export type CopyViolation = {
  reason: "forbidden-term" | "snake-case" | "value-leak";
  value: string;
  matched: string;
};

export function checkCopy(value: unknown): CopyViolation | null {
  if (value == null) {
    return { reason: "value-leak", value: String(value), matched: String(value) };
  }
  if (typeof value === "number" && Number.isNaN(value)) {
    return { reason: "value-leak", value: "NaN", matched: "NaN" };
  }
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const lower = trimmed.toLowerCase();

  // Value-leak sentinels first (very common bug source).
  if (lower === "undefined" || lower === "null" || lower === "nan") {
    return { reason: "value-leak", value: trimmed, matched: lower };
  }

  // Forbidden internal-term substring match (whole-word-ish via word edges
  // is overkill for CP3; we trust the denylist to be specific enough).
  for (const term of FORBIDDEN_TERMS) {
    if (lower.includes(term)) {
      return { reason: "forbidden-term", value: trimmed, matched: term };
    }
  }

  // snake_case heuristic.
  const snake = SNAKE_CASE_RE.exec(trimmed);
  if (snake) {
    return { reason: "snake-case", value: trimmed, matched: snake[0] };
  }

  return null;
}

export function isSafeCopy(value: unknown): boolean {
  return checkCopy(value) === null;
}

/**
 * In development, throws when a forbidden value would be rendered. In
 * production, this is a no-op so a single bad string never crashes a
 * learner's session — instead it should be caught by tests/code review.
 */
export function assertSafeCopy(value: unknown, context?: string): void {
  if (process.env.NODE_ENV === "production") return;
  const violation = checkCopy(value);
  if (!violation) return;
  const where = context ? ` (${context})` : "";
  throw new Error(
    `Raw-value guard tripped${where}: ${violation.reason} on ${JSON.stringify(violation.value)}` +
      ` (matched ${JSON.stringify(violation.matched)})`,
  );
}
