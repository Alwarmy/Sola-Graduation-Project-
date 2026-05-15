import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useCourseDetail } from "./useCourseDetail";
import { makeQueryWrapper } from "@/test/react-query-wrapper";

describe("useCourseDetail — CP6 hardening URL regression", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  test("calls /api/courses/<id> (NOT /api/sola/courses/<id>)", async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("/api/courses/7");
      expect(url).not.toContain("/api/sola");
      return new Response(
        JSON.stringify({
          id: 7,
          title: "Sample",
          source: "youtube",
          providerDisplayName: "YouTube",
          contentFormatLabel: "Video course",
          difficultyLabel: null,
          durationLabel: null,
          pricingLabel: null,
          instructorDisplayName: null,
          language: null,
          topicTagLabels: [],
          progressionLabel: null,
          qualityTier: null,
          cardSummary: null,
          shortDescription: null,
          description: null,
          url: null,
          thumbnailUrl: null,
          badges: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useCourseDetail(7), {
      wrapper: makeQueryWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.kind).toBe("found");
  });

  test("404 → { kind: 'missing' } (not an error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ detail: "Course not found", error_code: "not_found" }),
          { status: 404, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const { result } = renderHook(() => useCourseDetail(99999), {
      wrapper: makeQueryWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.kind).toBe("missing");
  });

  test("disabled when id is null", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderHook(() => useCourseDetail(null), { wrapper: makeQueryWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
