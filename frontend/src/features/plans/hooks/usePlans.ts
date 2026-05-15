"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/query-keys";
import { plansFetch } from "@/features/plans/api/client";
import { plansSafeFetch } from "@/features/plans/api/safe-reads";
import type {
  LearningPlanCreateRequest,
  PublicLearningPlan,
} from "@/lib/contracts/plans";
import { BackendError } from "@/lib/errors/backend-error";

export type ActivePlanQueryResult =
  | { kind: "missing" }
  | { kind: "loaded"; plan: PublicLearningPlan };

export type PlanDetailQueryResult =
  | { kind: "missing" }
  | { kind: "loaded"; plan: PublicLearningPlan };

/**
 * Read all plans for the learner.
 *
 * Post-CP10 hardening: moved off `/api/sola/[...path]` to the dedicated
 * `GET /api/plans` handler that adapts each plan server-side
 * (NOTE-CP10-CP11-PLANS-PASSTHROUGH-001).
 */
export function usePlans() {
  return useQuery<PublicLearningPlan[], BackendError>({
    queryKey: queryKeys.plans.list(),
    queryFn: ({ signal }) =>
      plansSafeFetch<PublicLearningPlan[]>("/api/plans", { signal }),
    staleTime: 30_000,
  });
}

/**
 * Read the active plan. 404 → `{kind: "missing"}` (no active plan yet).
 *
 * Post-CP10 hardening: dedicated `GET /api/plans/active`.
 */
export function useActivePlan() {
  return useQuery<ActivePlanQueryResult, BackendError>({
    queryKey: queryKeys.plans.active(),
    queryFn: async ({ signal }) => {
      try {
        const plan = await plansSafeFetch<PublicLearningPlan>("/api/plans/active", { signal });
        return { kind: "loaded", plan };
      } catch (err) {
        if (err instanceof BackendError && err.status === 404) return { kind: "missing" };
        throw err;
      }
    },
    staleTime: 30_000,
  });
}

/**
 * Read a single plan by id. 404 → `{kind: "missing"}`.
 *
 * Post-CP10 hardening: dedicated `GET /api/plans/[planId]`.
 */
export function usePlanDetail(planId: number | string | null) {
  return useQuery<PlanDetailQueryResult, BackendError>({
    queryKey: queryKeys.plans.detail(planId ?? ""),
    enabled: planId !== null && planId !== "",
    queryFn: async ({ signal }) => {
      try {
        const plan = await plansSafeFetch<PublicLearningPlan>(
          `/api/plans/${encodeURIComponent(String(planId))}`,
          { signal },
        );
        return { kind: "loaded", plan };
      } catch (err) {
        if (err instanceof BackendError && err.status === 404) return { kind: "missing" };
        throw err;
      }
    },
    staleTime: 30_000,
  });
}

/**
 * Create a plan from queued course items.
 */
export function useCreatePlan() {
  const queryClient = useQueryClient();
  return useMutation<PublicLearningPlan, BackendError, LearningPlanCreateRequest>({
    mutationFn: (input) => plansFetch<PublicLearningPlan>("/api/plans", { method: "POST", json: input }),
    onSuccess: (plan) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plans.queue() });
      queryClient.invalidateQueries({ queryKey: queryKeys.plans.list() });
      queryClient.invalidateQueries({ queryKey: queryKeys.plans.active() });
      queryClient.setQueryData(queryKeys.plans.detail(plan.id), { kind: "loaded", plan });
      queryClient.invalidateQueries({ queryKey: queryKeys.home.composition() });
    },
  });
}
