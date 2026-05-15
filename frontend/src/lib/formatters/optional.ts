import { FALLBACK } from "@/lib/copy/fallback";

/**
 * Render an optional string value safely.
 *
 * - `null`, `undefined`, empty string → FALLBACK.unknown
 * - Non-empty trimmed string         → the value
 *
 * The raw-value guard catches "null"/"undefined"/"NaN" elsewhere; this
 * formatter is the first line of defense at the call site so a missing
 * backend field renders honestly rather than leaking the placeholder.
 */
export function formatOptional(
  value: string | null | undefined,
  fallback: string = FALLBACK.unknown,
): string {
  if (value == null) return fallback;
  const trimmed = value.trim();
  if (trimmed.length === 0) return fallback;
  return trimmed;
}
