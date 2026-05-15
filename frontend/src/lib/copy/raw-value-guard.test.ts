import { describe, expect, test, vi } from "vitest";

import { checkCopy, isSafeCopy, assertSafeCopy } from "@/lib/copy/raw-value-guard";

describe("raw-value-guard", () => {
  test("flags null and undefined", () => {
    expect(checkCopy(null)?.reason).toBe("value-leak");
    expect(checkCopy(undefined)?.reason).toBe("value-leak");
  });

  test("flags the literal strings null/undefined/NaN (case-insensitive)", () => {
    for (const v of ["null", "Undefined", "NaN", "  NULL  "]) {
      expect(checkCopy(v)?.reason).toBe("value-leak");
    }
  });

  test("flags NaN numbers", () => {
    expect(checkCopy(Number.NaN)?.reason).toBe("value-leak");
  });

  test("flags backend/internal/admin/ingest/raw wording", () => {
    for (const v of [
      "Ingestion failed",
      "raw scraped data",
      "Admin console",
      "Internal pipeline error",
      "fallback chain",
      "api_key not configured",
    ]) {
      expect(checkCopy(v)?.reason).toBe("forbidden-term");
    }
  });

  test("flags snake_case identifiers", () => {
    expect(checkCopy("in_progress")?.reason).toBe("snake-case");
    expect(checkCopy("duration_short")?.reason).toBe("snake-case");
  });

  test("accepts safe user-facing copy", () => {
    for (const v of [
      "Add to queue",
      "Course search",
      "1h 30m",
      "Welcome back",
      "No courses found yet.",
    ]) {
      expect(isSafeCopy(v)).toBe(true);
    }
  });

  test("accepts non-string types gracefully (numbers, booleans)", () => {
    // Not user-facing data, but should not blow up.
    expect(isSafeCopy(42)).toBe(true);
    expect(isSafeCopy(true)).toBe(true);
  });

  test("assertSafeCopy throws in development for violations", () => {
    vi.stubEnv("NODE_ENV", "development");
    try {
      expect(() => assertSafeCopy("ingest pipeline running", "ctx")).toThrow(/forbidden-term/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("assertSafeCopy is a no-op in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(() => assertSafeCopy("ingest pipeline running")).not.toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
