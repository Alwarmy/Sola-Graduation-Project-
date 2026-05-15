"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/query-keys";
import { progressDedicatedFetch } from "@/features/progress/api/client";
import type { PublicLearningState } from "@/lib/contracts/learning-state";
import type { BackendError } from "@/lib/errors/backend-error";

/**
 * Mutation: explicit "Refresh learning state" user action. Backend
 * recomputes derived state from events / profile / etc and returns
 * the new shape. Must be triggered ONLY by a user click — no
 * useEffect / on-mount call (per directive §12 + addendum §C).
 *
 * On success, invalidates the learning state + events list + active
 * plan scope (since the backend recompute may have updated plan
 * derived signals).
 */
export function useRefreshLearningState() {
  const queryClient = useQueryClient();
  return useMutation<PublicLearningState, BackendError, void>({
    mutationFn: () =>
      progressDedicatedFetch<PublicLearningState>("/api/learning-state/refresh", {
        method: "POST",
      }),
    onSuccess: (next) => {
      // Prime the learning-state cache so the new shape renders immediately.
      queryClient.setQueryData(queryKeys.learningState.current(), {
        kind: "loaded",
        state: next,
      });
      // Refetch events, since the refresh consumed them to recompute state.
      queryClient.invalidateQueries({ queryKey: ["events", "list"] });
      // The backend recompute may have shifted plan derived signals.
      queryClient.invalidateQueries({ queryKey: queryKeys.plans.active() });
      queryClient.invalidateQueries({ queryKey: queryKeys.plans.list() });
      queryClient.invalidateQueries({ queryKey: ["plans", "detail"] });
      queryClient.invalidateQueries({ queryKey: ["plans", "readiness"] });
      queryClient.invalidateQueries({ queryKey: ["plans", "executionSummary"] });
      // Profile is independent and not affected by this refresh.
    },
  });
}
