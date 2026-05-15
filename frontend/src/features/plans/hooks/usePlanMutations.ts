"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/query-keys";
import { plansFetch } from "@/features/plans/api/client";
import type {
  PublicLearningPlan,
  PublicSchedulingPreference,
  SchedulingPreferenceUpdateRequest,
  LearningPlanStatusUpdateRequest,
} from "@/lib/contracts/plans";
import type { BackendError } from "@/lib/errors/backend-error";

/**
 * The four version-controlled mutations live here together so the
 * concurrency story (`expectedVersion`) is impossible to forget at the
 * call site.
 *
 * On stale-version conflict (any 409 / 412 or `BackendError.intent ===
 * "stale-refresh"`), the calling component should:
 *   1. render `<ConflictState>` (CP3 primitive); and
 *   2. invalidate plan.detail(id) + plan.queue() + plan.readiness(id);
 *   3. ask the user to retry with the refreshed version.
 *
 * `mutations.retry: false` from the CP3 QueryClient defaults applies —
 * we never silently retry a stale-write.
 */

function invalidatePlanScope(queryClient: ReturnType<typeof useQueryClient>, planId: number | string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.plans.detail(planId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.plans.queue() });
  queryClient.invalidateQueries({ queryKey: queryKeys.plans.list() });
  queryClient.invalidateQueries({ queryKey: queryKeys.plans.active() });
  queryClient.invalidateQueries({ queryKey: queryKeys.plans.readiness(planId) });
}

/**
 * Add a queued course to an existing plan.
 * Header concurrency: `X-Expected-Version: plan.version`.
 */
export function useAddQueueItemToPlan() {
  const queryClient = useQueryClient();
  return useMutation<
    PublicLearningPlan,
    BackendError,
    { planId: number | string; queueItemId: number | string; expectedVersion: number }
  >({
    mutationFn: ({ planId, queueItemId, expectedVersion }) =>
      plansFetch<PublicLearningPlan>(
        `/api/plans/${encodeURIComponent(String(planId))}/courses/queue-items/${encodeURIComponent(String(queueItemId))}`,
        { method: "POST", expectedVersion },
      ),
    onSuccess: (plan, vars) => {
      queryClient.setQueryData(queryKeys.plans.detail(vars.planId), { kind: "loaded", plan });
      invalidatePlanScope(queryClient, vars.planId);
    },
  });
}

/**
 * Remove a plan course.
 * Header concurrency: `X-Expected-Version: plan.version`.
 */
export function useRemovePlanCourse() {
  const queryClient = useQueryClient();
  return useMutation<
    PublicLearningPlan,
    BackendError,
    { planId: number | string; planCourseId: number | string; expectedVersion: number }
  >({
    mutationFn: ({ planId, planCourseId, expectedVersion }) =>
      plansFetch<PublicLearningPlan>(
        `/api/plans/${encodeURIComponent(String(planId))}/courses/${encodeURIComponent(String(planCourseId))}`,
        { method: "DELETE", expectedVersion },
      ),
    onSuccess: (plan, vars) => {
      queryClient.setQueryData(queryKeys.plans.detail(vars.planId), { kind: "loaded", plan });
      invalidatePlanScope(queryClient, vars.planId);
    },
  });
}

/**
 * Update scheduling preferences.
 * Body concurrency: `expected_version`.
 */
export function useUpdatePlanPreferences() {
  const queryClient = useQueryClient();
  return useMutation<
    PublicSchedulingPreference,
    BackendError,
    { planId: number | string; input: SchedulingPreferenceUpdateRequest }
  >({
    mutationFn: ({ planId, input }) =>
      plansFetch<PublicSchedulingPreference>(
        `/api/plans/${encodeURIComponent(String(planId))}/preferences`,
        { method: "PUT", json: input },
      ),
    onSuccess: (_pref, vars) => invalidatePlanScope(queryClient, vars.planId),
  });
}

/**
 * Update plan status (active / paused / completed / archived).
 * Body concurrency: `expected_version`.
 */
export function useUpdatePlanStatus() {
  const queryClient = useQueryClient();
  return useMutation<
    PublicLearningPlan,
    BackendError,
    { planId: number | string; input: LearningPlanStatusUpdateRequest }
  >({
    mutationFn: ({ planId, input }) =>
      plansFetch<PublicLearningPlan>(
        `/api/plans/${encodeURIComponent(String(planId))}/status`,
        { method: "PUT", json: input },
      ),
    onSuccess: (plan, vars) => {
      queryClient.setQueryData(queryKeys.plans.detail(vars.planId), { kind: "loaded", plan });
      invalidatePlanScope(queryClient, vars.planId);
    },
  });
}
