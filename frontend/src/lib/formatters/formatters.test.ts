import { describe, expect, test } from "vitest";

import { formatOptional } from "@/lib/formatters/optional";
import { formatCount, formatPercentage } from "@/lib/formatters/count";
import { formatDurationMinutes } from "@/lib/formatters/duration";
import { formatDate, formatDateTime, formatTime } from "@/lib/formatters/date";
import { formatRequestId } from "@/lib/formatters/request-id";
import { FALLBACK } from "@/lib/copy/fallback";

describe("formatOptional", () => {
  test("returns fallback for null/undefined/empty", () => {
    expect(formatOptional(null)).toBe(FALLBACK.unknown);
    expect(formatOptional(undefined)).toBe(FALLBACK.unknown);
    expect(formatOptional("   ")).toBe(FALLBACK.unknown);
  });
  test("trims and returns non-empty values", () => {
    expect(formatOptional("  hello  ")).toBe("hello");
  });
  test("accepts a custom fallback", () => {
    expect(formatOptional(null, "—")).toBe("—");
  });
});

describe("formatCount", () => {
  test("returns fallback for non-finite", () => {
    expect(formatCount(null)).toBe(FALLBACK.unknown);
    expect(formatCount(Number.NaN)).toBe(FALLBACK.unknown);
    expect(formatCount(Number.POSITIVE_INFINITY)).toBe(FALLBACK.unknown);
  });
  test("formats integers with locale grouping", () => {
    expect(formatCount(1234, { locale: "en-US" })).toBe("1,234");
  });
  test("clamps negatives to 0", () => {
    expect(formatCount(-5)).toBe("0");
  });
});

describe("formatPercentage", () => {
  test("formats a fraction", () => {
    expect(formatPercentage(0.5)).toMatch(/50/); // locale-dependent suffix
  });
  test("formats a percent (mode=percent)", () => {
    expect(formatPercentage(80, { mode: "percent" })).toMatch(/80/);
  });
  test("returns fallback out of range", () => {
    expect(formatPercentage(1.5)).toBe(FALLBACK.unknown);
    expect(formatPercentage(-0.1)).toBe(FALLBACK.unknown);
  });
});

describe("formatDurationMinutes", () => {
  test("renders short forms", () => {
    expect(formatDurationMinutes(45)).toBe("45 min");
    expect(formatDurationMinutes(60)).toBe("1h");
    expect(formatDurationMinutes(90)).toBe("1h 30m");
    expect(formatDurationMinutes(825)).toBe("13h 45m");
  });
  test("supports estimated suffix", () => {
    expect(formatDurationMinutes(825, { isEstimated: true })).toBe("13h 45m estimated");
  });
  test("returns fallback for invalid", () => {
    expect(formatDurationMinutes(null)).toBe(FALLBACK.unknown);
    expect(formatDurationMinutes(-1)).toBe(FALLBACK.unknown);
    expect(formatDurationMinutes(Number.NaN)).toBe(FALLBACK.unknown);
  });
});

describe("formatDate / formatDateTime / formatTime", () => {
  // 2026-05-13T08:30:00Z is 11:30 on the same date in Asia/Riyadh (UTC+3).
  const iso = "2026-05-13T08:30:00Z";
  test("formatDate uses APP_TIMEZONE by default", () => {
    expect(formatDate(iso, { locale: "en-US" })).toMatch(/May 13, 2026/);
  });
  test("formatDateTime renders the Riyadh-local time", () => {
    expect(formatDateTime(iso, { locale: "en-US" })).toMatch(/11:30/);
  });
  test("formatTime renders the Riyadh-local time only", () => {
    expect(formatTime(iso, { locale: "en-US" })).toBe("11:30");
  });
  test("invalid inputs return fallback", () => {
    expect(formatDate(null)).toBe(FALLBACK.unknown);
    expect(formatDate("not-a-date")).toBe(FALLBACK.unknown);
  });
  test("browser timezone opt-out resolves without throwing", () => {
    expect(typeof formatDateTime(iso, { timeZone: "browser" })).toBe("string");
  });
});

describe("formatRequestId", () => {
  test("renders a ref label for non-empty ids", () => {
    expect(formatRequestId("abc123")).toBe("Ref: abc123");
  });
  test("returns null for empty/null", () => {
    expect(formatRequestId(null)).toBeNull();
    expect(formatRequestId("")).toBeNull();
    expect(formatRequestId("   ")).toBeNull();
  });
});
