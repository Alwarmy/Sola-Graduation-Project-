import { APP_TIMEZONE } from "@/lib/api/headers";
import { FALLBACK } from "@/lib/copy/fallback";

/**
 * Date / time formatting in the backend's default timezone.
 *
 * Backend `APP_TIMEZONE = "Asia/Riyadh"` per backend reference and
 * Build Gate PROTO-009. CP3 formatters respect it by default. UI surfaces
 * that explicitly want the learner's local timezone (e.g. for Schedule)
 * may pass `{ timeZone: "browser" }` to opt out.
 *
 * Inputs:
 *   - ISO 8601 strings ("2026-05-13T08:30:00Z")
 *   - Date objects
 *   - `null`/`undefined` → FALLBACK.unknown
 *   - Non-parsable strings → FALLBACK.unknown (never the raw string)
 */
export type DateInput = string | Date | null | undefined;

export type DateFormatOptions = {
  /** Default: APP_TIMEZONE ("Asia/Riyadh"). Pass `"browser"` for local. */
  timeZone?: string | "browser";
  /** Locale BCP-47 tag. Default: "en-US". */
  locale?: string;
};

function toValidDate(input: DateInput): Date | null {
  if (input == null) return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

function resolveTimeZone(tz: string | "browser" | undefined): string | undefined {
  if (tz === "browser") return undefined;
  return tz ?? APP_TIMEZONE;
}

export function formatDate(input: DateInput, options?: DateFormatOptions): string {
  const d = toValidDate(input);
  if (!d) return FALLBACK.unknown;
  try {
    return new Intl.DateTimeFormat(options?.locale ?? "en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      timeZone: resolveTimeZone(options?.timeZone),
    }).format(d);
  } catch {
    return FALLBACK.unknown;
  }
}

export function formatDateTime(input: DateInput, options?: DateFormatOptions): string {
  const d = toValidDate(input);
  if (!d) return FALLBACK.unknown;
  try {
    return new Intl.DateTimeFormat(options?.locale ?? "en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: resolveTimeZone(options?.timeZone),
    }).format(d);
  } catch {
    return FALLBACK.unknown;
  }
}

export function formatTime(input: DateInput, options?: DateFormatOptions): string {
  const d = toValidDate(input);
  if (!d) return FALLBACK.unknown;
  try {
    return new Intl.DateTimeFormat(options?.locale ?? "en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: resolveTimeZone(options?.timeZone),
    }).format(d);
  } catch {
    return FALLBACK.unknown;
  }
}
