import { FALLBACK } from "@/lib/copy/fallback";

/**
 * Format a minutes count as a human-readable duration.
 *
 *   45    → "45 min"
 *   90    → "1h 30m"
 *   825   → "13h 45m"
 *   1440  → "24h"
 *
 * Used when a `duration_label` backend-built string is not available;
 * domain code should prefer the backend label per the CP1 pipeline
 * evidence (`B1_CP1_course_search_pipeline_evidence.md` §3).
 */
export function formatDurationMinutes(
  minutes: number | null | undefined,
  options?: { isEstimated?: boolean },
): string {
  if (minutes == null || typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 0) {
    return FALLBACK.unknown;
  }
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;

  let label: string;
  if (h === 0) label = `${m} min`;
  else if (m === 0) label = `${h}h`;
  else label = `${h}h ${m}m`;

  if (options?.isEstimated) label += " estimated";
  return label;
}
