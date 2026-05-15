import { FALLBACK } from "@/lib/copy/fallback";

/**
 * Default `snake_case` → "Title Case" humanizer.
 *
 * Used as the last-resort fallback when no explicit backend label is
 * available (e.g. when a `*_label` field is null but the raw enum value is
 * known). Domain-specific label maps in `lib/labels/<domain>.ts` should
 * always win over this generic transform.
 *
 * Examples:
 *   "in_progress"     → "In Progress"
 *   "duration_short"  → "Duration Short"
 *   ""                → FALLBACK.unknown
 */
export function humanize(raw: unknown): string {
  if (raw == null) return FALLBACK.unknown;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? String(raw) : FALLBACK.unknown;
  }
  if (typeof raw !== "string") return FALLBACK.unknown;

  const trimmed = raw.trim();
  if (trimmed.length === 0) return FALLBACK.unknown;

  // Replace separators with spaces, drop multiple spaces, then title-case.
  const spaced = trimmed.replace(/[_\-]+/g, " ").replace(/\s+/g, " ");
  return spaced
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Choose the first non-empty user-safe label. Designed so feature code can
 * write `label(course.difficulty_label, () => humanize(course.difficulty_level))`
 * without nested if-statements.
 */
export function label(
  preferred: string | null | undefined,
  fallback: () => string,
): string {
  if (typeof preferred === "string" && preferred.trim().length > 0) return preferred;
  const next = fallback();
  if (typeof next === "string" && next.trim().length > 0) return next;
  return FALLBACK.unknown;
}
