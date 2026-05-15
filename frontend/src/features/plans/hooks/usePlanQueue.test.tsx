import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { useAddCourseToQueue, useRemoveQueueItem, usePlanQueue } from "./usePlanQueue";
import { makeQueryWrapper } from "@/test/react-query-wrapper";

// Pre-hardening raw backend shape kept here for documentation parity —
// the dedicated handler test in `src/app/api/plans/__route_get.test.ts`
// exercises the snake → camel adapter directly. The hook now consumes
// the Public shape, so the inline fixture in the test below is what
// matters here.
const _historicalRawQueueRow = {
  id: 11,
  user_id: 266,
  course_id: 42,
  status: "queued",
  note: null,
  created_at: "2026-05-13T08:00:00Z",
  updated_at: "2026-05-13T08:00:00Z",
  course: {
    id: 42,
    source: "youtube",
    external_id: "ext42",
    content_type: "video",
    content_format_label: "Video course",
    title: "Sample Course",
    provider: "youtube",
    provider_display_name: "YouTube",
    card_summary: "Video",
    badges: [],
  },
};

describe("usePlanQueue — URL + invalidation regression", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  test("GET queue uses the dedicated /api/plans/queue (NOT /api/sola — post-CP10 hardening)", async () => {
    // The dedicated handler now adapts the response server-side, so the
    // browser receives the already-adapted Public shape (camelCase, no
    // internals). The stub returns that adapted shape directly.
    const publicQueueRow = {
      id: 11,
      courseId: 42,
      status: "queued",
      statusLabel: "Queued",
      note: null,
      createdAt: "2026-05-13T08:00:00Z",
      updatedAt: "2026-05-13T08:00:00Z",
      course: {
        id: 42,
        title: "Sample Course",
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
        cardSummary: "Video",
        shortDescription: null,
        description: null,
        url: null,
        thumbnailUrl: null,
        badges: [],
      },
    };
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("/api/plans/queue");
      expect(url).not.toContain("/api/sola");
      return new Response(JSON.stringify([publicQueueRow]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => usePlanQueue(), { wrapper: makeQueryWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0]?.statusLabel).toBe("Queued");
  });
});

describe("useAddCourseToQueue — URL regression", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  test("POST goes to /api/plans/queue/<courseId> (NOT /api/sola/...)", async () => {
    const calls: string[] = [];
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      return new Response(JSON.stringify({ id: 11, courseId: 42, status: "queued", statusLabel: "Queued", note: null, createdAt: "x", updatedAt: "x", course: { id: 42, title: "S", source: "youtube", providerDisplayName: "YouTube", contentFormatLabel: "Video", difficultyLabel: null, durationLabel: null, pricingLabel: null, instructorDisplayName: null, language: null, topicTagLabels: [], progressionLabel: null, qualityTier: null, cardSummary: null, shortDescription: null, badges: [] } }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useAddCourseToQueue(), { wrapper: makeQueryWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ courseId: 42, note: "ok" });
    });
    expect(calls[0]).toContain("/api/plans/queue/42");
    expect(calls[0]).not.toContain("/api/sola");
  });
});

describe("useRemoveQueueItem — URL regression", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  test("DELETE goes to /api/plans/queue/<queueItemId>", async () => {
    const calls: string[] = [];
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useRemoveQueueItem(), { wrapper: makeQueryWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ queueItemId: 11 });
    });
    expect(calls[0]).toContain("/api/plans/queue/11");
    expect(calls[0]).not.toContain("/api/sola");
  });
});
