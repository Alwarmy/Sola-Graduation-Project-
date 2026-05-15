"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/query-keys";
import { solaFetch } from "@/features/courses/api/client";
import {
  recommendationListResponseSchema,
  toPublicRecommendations,
  type PublicRecommendationList,
} from "@/lib/contracts/recommendations";
import type { BackendError } from "@/lib/errors/backend-error";

/**
 * Read backend recommendations. Authenticated route (401 without bearer).
 * `enabled` lets the caller gate the hook on session state, so an anonymous
 * visitor never causes a 401 round-trip.
 */
export function useRecommendations(options?: { limit?: number; enabled?: boolean }) {
  const limit = options?.limit ?? 6;
  return useQuery<PublicRecommendationList, BackendError>({
    queryKey: queryKeys.recommendations.list(),
    enabled: options?.enabled ?? true,
    queryFn: async ({ signal }) => {
      const raw = await solaFetch<unknown>(`/recommendations?limit=${limit}`, { signal });
      const parsed = recommendationListResponseSchema.parse(raw);
      return toPublicRecommendations(parsed);
    },
    staleTime: 30_000,
  });
}
