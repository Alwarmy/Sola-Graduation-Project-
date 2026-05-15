import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import {
  useAddQueueItemToPlan,
  useRemovePlanCourse,
  useUpdatePlanPreferences,
  useUpdatePlanStatus,
} from "./usePlanMutations";
import { makeQueryWrapper } from "@/test/react-query-wrapper";

function planJson(version: number) {
  return JSON.stringify({
    id: 9,
    title: "T",
    goal: "G",
    status: "active",
    statusLabel: "Active",
    version,
    scheduleRevision: 0,
    currentFocusSnapshot: null,
    weeklyHoursSnapshot: 10,
    scheduleTimezoneSnapshot: "Asia/Riyadh",
    createdAt: "x",
    updatedAt: "x",
    preference: null,
    courses: [],
  });
}

describe("usePlanMutations — URL + header forwarding", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  test("useAddQueueItemToPlan: POST /api/plans/<id>/courses/queue-items/<q> with x-expected-version", async () => {
    let observed: { url?: string; init?: RequestInit } = {};
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      observed = { url: String(input), init };
      return new Response(planJson(9), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useAddQueueItemToPlan(), { wrapper: makeQueryWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ planId: 9, queueItemId: 11, expectedVersion: 8 });
    });
    expect(observed.url).toContain("/api/plans/9/courses/queue-items/11");
    expect(observed.url).not.toContain("/api/sola");
    const headers = observed.init?.headers as Record<string, string>;
    expect(headers["x-expected-version"]).toBe("8");
    expect(observed.init?.method).toBe("POST");
  });

  test("useRemovePlanCourse: DELETE /api/plans/<id>/courses/<pcId> with x-expected-version", async () => {
    let observed: { url?: string; init?: RequestInit } = {};
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      observed = { url: String(input), init };
      return new Response(planJson(10), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useRemovePlanCourse(), { wrapper: makeQueryWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ planId: 9, planCourseId: 55, expectedVersion: 9 });
    });
    expect(observed.url).toContain("/api/plans/9/courses/55");
    expect(observed.url).not.toContain("/api/sola");
    const headers = observed.init?.headers as Record<string, string>;
    expect(headers["x-expected-version"]).toBe("9");
    expect(observed.init?.method).toBe("DELETE");
  });

  test("useUpdatePlanPreferences: PUT /api/plans/<id>/preferences carries expected_version in BODY", async () => {
    let observed: { url?: string; init?: RequestInit } = {};
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      observed = { url: String(input), init };
      return new Response(
        JSON.stringify({
          id: 1,
          planId: 9,
          planVersion: 9,
          preferredTimeWindow: "evening",
          preferredTimeWindowLabel: "Evening",
          paceMode: "standard",
          paceModeLabel: "Standard",
          preferredStudyDays: [],
          preferredStudyDayLabels: [],
          maxDailyMinutes: 60,
          sessionCapMinutes: 45,
          temporaryNote: null,
          deadlineDate: null,
          createdAt: "x",
          updatedAt: "x",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useUpdatePlanPreferences(), { wrapper: makeQueryWrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        planId: 9,
        input: {
          expected_version: 8,
          preferred_time_window: "evening",
          pace_mode: "standard",
          max_daily_minutes: 60,
          session_cap_minutes: 45,
        },
      });
    });
    expect(observed.url).toContain("/api/plans/9/preferences");
    const headers = observed.init?.headers as Record<string, string>;
    // expected_version is in body, NOT in header for preferences:
    expect(headers["x-expected-version"]).toBeUndefined();
    const sent = JSON.parse(observed.init?.body as string);
    expect(sent.expected_version).toBe(8);
    expect(observed.init?.method).toBe("PUT");
  });

  test("useUpdatePlanStatus: PUT /api/plans/<id>/status carries expected_version in BODY", async () => {
    let observed: { url?: string; init?: RequestInit } = {};
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      observed = { url: String(input), init };
      return new Response(planJson(10), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useUpdatePlanStatus(), { wrapper: makeQueryWrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        planId: 9,
        input: { status: "paused", expected_version: 9 },
      });
    });
    expect(observed.url).toContain("/api/plans/9/status");
    const sent = JSON.parse(observed.init?.body as string);
    expect(sent.status).toBe("paused");
    expect(sent.expected_version).toBe(9);
  });

  test("409 conflict throws BackendError with stale-refresh intent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ detail: "stale", error_code: "expected_version_mismatch" }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const { result } = renderHook(() => useUpdatePlanStatus(), { wrapper: makeQueryWrapper() });
    let caught: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({
          planId: 9,
          input: { status: "paused", expected_version: 1 },
        });
      } catch (e) {
        caught = e;
      }
    });
    expect(caught).toBeDefined();
    expect((caught as { status: number }).status).toBe(409);
    expect((caught as { intent: string }).intent).toBe("stale-refresh");
  });
});
