import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import {
  useApplyRecovery,
  useCompletePlanItem,
  useGenerateSchedule,
  useSkipPlanItem,
  useStartPlanItem,
} from "./useExecutionMutations";
import { usePlanItems } from "./usePlanItems";
import { useExecutionSummary } from "./useExecutionSummary";
import { useRecoveryPreview } from "./useRecoveryPreview";
import { makeQueryWrapper } from "@/test/react-query-wrapper";
import { BackendError } from "@/lib/errors/backend-error";

const fakeItem = {
  id: 301,
  planId: 199,
  courseId: 2,
  version: 1,
  title: "Variables",
  itemType: "video_segment",
  itemTypeLabel: "Video Segment",
  status: "in_progress",
  statusLabel: "In progress",
  scheduledDate: "2026-05-14",
  timeWindow: "evening",
  timeWindowLabel: "Evening",
  plannedMinutes: 30,
  actualMinutes: null,
  actualStartedAt: null,
  actualCompletedAt: null,
  skippedAt: null,
  skipReason: null,
  isDueToday: false,
  isOverdue: false,
  isActionable: true,
  scheduleOrderIndex: 0,
  course: { id: 2, title: "P", providerDisplayName: "YouTube", language: "en", url: null },
  courseUnit: { id: 41, title: "V", estimatedMinutes: 30 },
};
const fakeSummary = {
  planId: 199,
  planStatus: "active",
  planStatusLabel: "Active",
  totalItems: 1,
  pendingItemsCount: 0,
  inProgressItemsCount: 1,
  completedItemsCount: 0,
  skippedItemsCount: 0,
  overdueItemsCount: 0,
  dueTodayItemsCount: 0,
  completionRate: 0,
  completionRateLabel: "0%",
  isPlanFinished: false,
  canMarkCompleted: false,
  nextActionableItemId: 301,
  nextActionableScheduledDate: "2026-05-14",
  nextActionableTitle: "Variables",
};
const fakeAction = { item: fakeItem, executionSummary: fakeSummary };

describe("CP8 hooks — URL targets, header vs body concurrency, no /api/sola", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  test("usePlanItems GETs /api/plans/[planId]/items (NOT /api/sola)", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return new Response(JSON.stringify([fakeItem]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const { result } = renderHook(() => usePlanItems(199), { wrapper: makeQueryWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls[0]).toContain("/api/plans/199/items");
    expect(calls[0]).not.toContain("/api/sola");
  });

  test("useExecutionSummary GETs /api/plans/[planId]/execution-summary", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return new Response(JSON.stringify(fakeSummary), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const { result } = renderHook(() => useExecutionSummary(199), { wrapper: makeQueryWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls[0]).toContain("/api/plans/199/execution-summary");
  });

  test("useRecoveryPreview GETs /api/plans/[planId]/recovery-preview", async () => {
    const fakePreview = {
      planId: 199,
      planVersion: 5,
      scheduleRevision: 2,
      planStatus: "active",
      planStatusLabel: "Active",
      missedStudySlotsCount: 0,
      overdueItemsCount: 0,
      overdueMinutes: 0,
      dueTodayItemsCount: 0,
      remainingPendingItemsCount: 1,
      remainingPendingMinutes: 30,
      inProgressItemsCount: 0,
      availableCapacityNext7StudySlotsMinutes: 420,
      recoveryPressureRatio: 0,
      recoveryPressureLabel: "0%",
      driftLevel: "on_track",
      driftLevelLabel: "On track",
      needsRecovery: false,
      currentScheduleStillViable: true,
      canRecoverWithoutRebuild: false,
      shouldOfferRebuild: false,
      recommendedAction: "stay_on_track",
      recommendedActionLabel: "Stay on track",
      recommendedRecoveryMode: null,
      recommendedRecoveryModeLabel: null,
      availableActions: ["stay_on_track"],
      availableActionLabels: ["Stay on track"],
      availableRecoveryModes: [],
      availableRecoveryModeLabels: [],
    };
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return new Response(JSON.stringify(fakePreview), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const { result } = renderHook(() => useRecoveryPreview(199), { wrapper: makeQueryWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls[0]).toContain("/api/plans/199/recovery-preview");
  });

  test("useGenerateSchedule POSTs to /api/plans/[planId]/schedule/generate with body version", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return new Response(
          JSON.stringify({
            planId: 199,
            planVersion: 6,
            scheduleRevision: 2,
            totalItems: 1,
            totalMinutes: 30,
            scheduledStartDate: null,
            scheduledEndDate: null,
            items: [fakeItem],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    const { result } = renderHook(() => useGenerateSchedule(), { wrapper: makeQueryWrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        planId: 199,
        input: { expected_version: 5, expected_schedule_revision: 1, force_rebuild: false },
      });
    });
    expect(calls[0]!.url).toContain("/api/plans/199/schedule/generate");
    expect(calls[0]!.url).not.toContain("/api/sola");
    const sent = JSON.parse(String(calls[0]!.init?.body));
    expect(sent.expected_version).toBe(5);
    expect(sent.expected_schedule_revision).toBe(1);
  });

  test("useStartPlanItem POSTs with X-Expected-Version HEADER (not body)", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return new Response(JSON.stringify(fakeAction), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const { result } = renderHook(() => useStartPlanItem(), { wrapper: makeQueryWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ planId: 199, itemId: 301, expectedVersion: 2 });
    });
    expect(calls[0]!.url).toContain("/api/plans/199/items/301/start");
    const headers = calls[0]!.init?.headers as Record<string, string> | undefined;
    expect(headers?.["x-expected-version"]).toBe("2");
    // No request body — backend reads version from header.
    expect(calls[0]!.init?.body).toBeUndefined();
  });

  test("useCompletePlanItem POSTs with expected_version BODY", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return new Response(JSON.stringify(fakeAction), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const { result } = renderHook(() => useCompletePlanItem(), { wrapper: makeQueryWrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        planId: 199,
        itemId: 301,
        input: { expected_version: 2, actual_minutes: 28 },
      });
    });
    expect(calls[0]!.url).toContain("/api/plans/199/items/301/complete");
    const sent = JSON.parse(String(calls[0]!.init?.body));
    expect(sent.expected_version).toBe(2);
    expect(sent.actual_minutes).toBe(28);
  });

  test("useSkipPlanItem POSTs with expected_version BODY + skip_reason", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return new Response(JSON.stringify(fakeAction), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const { result } = renderHook(() => useSkipPlanItem(), { wrapper: makeQueryWrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        planId: 199,
        itemId: 301,
        input: { expected_version: 2, skip_reason: "Holiday" },
      });
    });
    expect(calls[0]!.url).toContain("/api/plans/199/items/301/skip");
    const sent = JSON.parse(String(calls[0]!.init?.body));
    expect(sent.expected_version).toBe(2);
    expect(sent.skip_reason).toBe("Holiday");
  });

  test("useApplyRecovery POSTs both expected_version AND expected_schedule_revision in BODY", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return new Response(
          JSON.stringify({
            planId: 199,
            planVersion: 6,
            scheduleRevision: 3,
            recoveryMode: "rebalance",
            recoveryModeLabel: "Rebalance the schedule",
            recoveryNote: null,
            rebuiltPendingItemsCount: 0,
            preservedCompletedItemsCount: 0,
            preservedSkippedItemsCount: 0,
            preservedInProgressItemsCount: 0,
            newScheduledStartDate: null,
            newScheduledEndDate: null,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    const { result } = renderHook(() => useApplyRecovery(), { wrapper: makeQueryWrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        planId: 199,
        input: {
          mode: "rebalance",
          expected_version: 5,
          expected_schedule_revision: 2,
        },
      });
    });
    expect(calls[0]!.url).toContain("/api/plans/199/recover");
    const sent = JSON.parse(String(calls[0]!.init?.body));
    expect(sent.mode).toBe("rebalance");
    expect(sent.expected_version).toBe(5);
    expect(sent.expected_schedule_revision).toBe(2);
  });

  test("412 stale → BackendError with stale-refresh intent (no silent retry)", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        return new Response(
          JSON.stringify({
            detail: "stale",
            error_code: "expected_version_mismatch",
            request_id: "req-stale",
          }),
          {
            status: 412,
            headers: { "content-type": "application/json", "x-request-id": "req-stale" },
          },
        );
      }),
    );
    const { result } = renderHook(() => useStartPlanItem(), { wrapper: makeQueryWrapper() });
    try {
      await act(async () => {
        await result.current.mutateAsync({ planId: 199, itemId: 301, expectedVersion: 1 });
      });
    } catch (err) {
      expect(err).toBeInstanceOf(BackendError);
      expect((err as BackendError).intent).toBe("stale-refresh");
      expect((err as BackendError).requestId).toBe("req-stale");
    }
    expect(calls).toBe(1); // mutations.retry: false from CP3 defaults
  });
});
