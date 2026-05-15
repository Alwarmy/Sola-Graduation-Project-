"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/query-keys";
import { plansSafeFetch } from "@/features/plans/api/safe-reads";
import type { PublicPlanReadiness } from "@/lib/contracts/plans";
import { BackendError } from "@/lib/errors/backend-error";

export type PlanReadinessQueryResult =
  | { kind: "missing" }
  | { kind: "loaded"; readiness: PublicPlanReadiness };

/**
 * Read plan readiness. 404 → `{kind: "missing"}` (the plan may not yet
 * have readiness computed). Other backend errors propagate as a
 * `BackendError` for the caller to render.
 *
 * Post-CP10 hardening: dedicated `GET /api/plans/[planId]/readiness`
 * handler runs `toPublicPlanReadiness` server-side
 * (NOTE-CP10-CP11-PLANS-PASSTHROUGH-001). Net effect on the readiness
 * payload is small (it doesn't nest courses), but the move keeps the
 * plans-domain reads consistent and off the raw `/api/sola` passthrough.
 */
export function usePlanReadiness(planId: number | string | null, options?: { enabled?: boolean }) {
  return useQuery<PlanReadinessQueryResult, BackendError>({
    queryKey: queryKeys.plans.readiness(planId ?? ""),
    enabled: (options?.enabled ?? true) && planId !== null && planId !== "",
    queryFn: async ({ signal }) => {
      try {
        const readiness = await plansSafeFetch<PublicPlanReadiness>(
          `/api/plans/${encodeURIComponent(String(planId))}/readiness`,
          { signal },
        );
        return { kind: "loaded", readiness };
      } catch (err) {
        if (err instanceof BackendError && err.status === 404) return { kind: "missing" };
        throw err;
      }
    },
    staleTime: 15_000,
  });
}
