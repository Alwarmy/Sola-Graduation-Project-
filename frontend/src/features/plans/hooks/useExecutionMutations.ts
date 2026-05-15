"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/query-keys";
import { plansFetch } from "@/features/plans/api/client";
import type {
  LearningPlanItemCompleteRequest,
  LearningPlanItemSkipRequest,
  PlanRecoveryApplyRequest,
  PlanScheduleGenerateRequest,
  PublicPlanItemActionResult,
  PublicRecoveryResult,
  PublicScheduleGenerationResult,
} from "@/lib/contracts/plan-execution";
import type { BackendError } from "@/lib/errors/backend-error";

/**
 * CP8 mutations — schedule generation, item start/complete/skip, and
 * recovery apply. Concurrency per the CP8 Revision/Conflict Contract
 * Table:
 *   - generate: `expected_version` BODY + optional `expected_schedule_revision` BODY.
 *   - start:    `X-Expected-Version` HEADER.
 *   - complete: `expected_version` BODY.
 *   - skip:     `expected_version` BODY.
 *   - recover:  `expected_version` BODY + REQUIRED `expected_schedule_revision` BODY.
 *
 * All hooks rely on `mutations.retry: false` (CP3 default) so a stale
 * conflict is never silently retried with the cached version.
 *
 * Invalidation: on success, every CP8 mutation invalidates the plan
 * scope so the next render sees the fresh `version`, `scheduleRevision`,
 * item list, execution summary, recovery preview, and readiness.
 */

function invalidateCp8Scope(
  queryClient: ReturnType<typeof useQueryClient>,
  planId: number | string,
) {
  queryClient.invalidateQueries({ queryKey: queryKeys.plans.detail(planId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.plans.readiness(planId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.plans.items(planId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.plans.executionSummary(planId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.plans.recoveryPreview(planId) });
}

export function useGenerateSchedule() {
  const queryClient = useQueryClient();
  return useMutation<
    PublicScheduleGenerationResult,
    BackendError,
    { planId: number | string; input: PlanScheduleGenerateRequest }
  >({
    mutationFn: ({ planId, input }) =>
      plansFetch<PublicScheduleGenerationResult>(
        `/api/plans/${encodeURIComponent(String(planId))}/schedule/generate`,
        { method: "POST", json: input },
      ),
    onSuccess: (_result, vars) => invalidateCp8Scope(queryClient, vars.planId),
  });
}

export function useStartPlanItem() {
  const queryClient = useQueryClient();
  return useMutation<
    PublicPlanItemActionResult,
    BackendError,
    {
      planId: number | string;
      itemId: number | string;
      /** Sent as `X-Expected-Version` header. Use `item.version`. */
      expectedVersion: number;
    }
  >({
    mutationFn: ({ planId, itemId, expectedVersion }) =>
      plansFetch<PublicPlanItemActionResult>(
        `/api/plans/${encodeURIComponent(String(planId))}/items/${encodeURIComponent(String(itemId))}/start`,
        { method: "POST", expectedVersion },
      ),
    onSuccess: (_result, vars) => invalidateCp8Scope(queryClient, vars.planId),
  });
}

export function useCompletePlanItem() {
  const queryClient = useQueryClient();
  return useMutation<
    PublicPlanItemActionResult,
    BackendError,
    {
      planId: number | string;
      itemId: number | string;
      input: LearningPlanItemCompleteRequest;
    }
  >({
    mutationFn: ({ planId, itemId, input }) =>
      plansFetch<PublicPlanItemActionResult>(
        `/api/plans/${encodeURIComponent(String(planId))}/items/${encodeURIComponent(String(itemId))}/complete`,
        { method: "POST", json: input },
      ),
    onSuccess: (_result, vars) => invalidateCp8Scope(queryClient, vars.planId),
  });
}

export function useSkipPlanItem() {
  const queryClient = useQueryClient();
  return useMutation<
    PublicPlanItemActionResult,
    BackendError,
    {
      planId: number | string;
      itemId: number | string;
      input: LearningPlanItemSkipRequest;
    }
  >({
    mutationFn: ({ planId, itemId, input }) =>
      plansFetch<PublicPlanItemActionResult>(
        `/api/plans/${encodeURIComponent(String(planId))}/items/${encodeURIComponent(String(itemId))}/skip`,
        { method: "POST", json: input },
      ),
    onSuccess: (_result, vars) => invalidateCp8Scope(queryClient, vars.planId),
  });
}

export function useApplyRecovery() {
  const queryClient = useQueryClient();
  return useMutation<
    PublicRecoveryResult,
    BackendError,
    { planId: number | string; input: PlanRecoveryApplyRequest }
  >({
    mutationFn: ({ planId, input }) =>
      plansFetch<PublicRecoveryResult>(
        `/api/plans/${encodeURIComponent(String(planId))}/recover`,
        { method: "POST", json: input },
      ),
    onSuccess: (_result, vars) => {
      invalidateCp8Scope(queryClient, vars.planId);
      queryClient.invalidateQueries({ queryKey: queryKeys.plans.list() });
      queryClient.invalidateQueries({ queryKey: queryKeys.plans.active() });
    },
  });
}
