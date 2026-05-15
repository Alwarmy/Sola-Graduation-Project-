"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/query-keys";
import { progressDedicatedFetch } from "@/features/progress/api/client";
import type { PublicLearningState } from "@/lib/contracts/learning-state";
import { BackendError } from "@/lib/errors/backend-error";

export type LearningStateQueryResult =
  | { kind: "missing" }
  | { kind: "loaded"; state: PublicLearningState };

/**
 * Read the learner's current learning state. 404 → `{kind:"missing"}`
 * so the UI can show an honest "no learning state yet" empty state.
 * All other backend errors propagate as a `BackendError`.
 */
export function useLearningState(options?: { enabled?: boolean }) {
  return useQuery<LearningStateQueryResult, BackendError>({
    queryKey: queryKeys.learningState.current(),
    enabled: options?.enabled ?? true,
    queryFn: async ({ signal }) => {
      try {
        const state = await progressDedicatedFetch<PublicLearningState>(
          "/api/learning-state",
          { signal },
        );
        return { kind: "loaded", state };
      } catch (err) {
        if (err instanceof BackendError && err.status === 404) return { kind: "missing" };
        throw err;
      }
    },
    staleTime: 30_000,
  });
}
