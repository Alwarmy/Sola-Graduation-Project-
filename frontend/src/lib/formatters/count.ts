import { FALLBACK } from "@/lib/copy/fallback";

/**
 * Format integer counts. Non-integers and NaN render as FALLBACK.unknown.
 * Negative counts are clamped to 0 (the backend should not send negatives;
 * if it does, displaying "-3 courses" is worse than rounding up).
 */
export function formatCount(
  value: number | null | undefined,
  options?: { locale?: string },
): string {
  if (value == null || typeof value !== "number" || !Number.isFinite(value)) {
    return FALLBACK.unknown;
  }
  const safe = Math.max(0, Math.trunc(value));
  try {
    return new Intl.NumberFormat(options?.locale ?? "en-US").format(safe);
  } catch {
    return String(safe);
  }
}

/**
 * Format a percentage. Accepts either a 0–1 fraction or a 0–100 percentage
 * via `mode`. Rounds to `digits` (default 0). Out-of-range or non-finite
 * values render as FALLBACK.unknown.
 */
export function formatPercentage(
  value: number | null | undefined,
  options?: { mode?: "fraction" | "percent"; digits?: number; locale?: string },
): string {
  if (value == null || typeof value !== "number" || !Number.isFinite(value)) {
    return FALLBACK.unknown;
  }
  const mode = options?.mode ?? "fraction";
  const digits = options?.digits ?? 0;
  const pct = mode === "fraction" ? value * 100 : value;
  if (pct < 0 || pct > 100) return FALLBACK.unknown;
  try {
    return new Intl.NumberFormat(options?.locale ?? "en-US", {
      style: "percent",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(pct / 100);
  } catch {
    return `${pct.toFixed(digits)}%`;
  }
}
