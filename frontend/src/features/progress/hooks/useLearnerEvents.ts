"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/query-keys";
import { progressDedicatedFetch } from "@/features/progress/api/client";
import type { PublicLearnerEvent } from "@/lib/contracts/events";
import type { BackendError } from "@/lib/errors/backend-error";

export type LearnerEventsFilters = {
  eventType?: string | null;
  limit?: number | null;
  offset?: number | null;
};

/**
 * Read the learner's recent events. Backed by the dedicated CP11 GET
 * handler at `/api/events`, which strips raw `event_payload` server-side.
 */
export function useLearnerEvents(
  filters: LearnerEventsFilters = {},
  options?: { enabled?: boolean },
) {
  const params: Record<string, string> = {};
  if (typeof filters.eventType === "string" && filters.eventType.length > 0) {
    params.event_type = filters.eventType;
  }
  if (typeof filters.limit === "number" && Number.isFinite(filters.limit) && filters.limit > 0) {
    params.limit = String(Math.min(100, Math.max(1, Math.floor(filters.limit))));
  }
  if (typeof filters.offset === "number" && Number.isFinite(filters.offset) && filters.offset >= 0) {
    params.offset = String(Math.floor(filters.offset));
  }
  const qs = new URLSearchParams(params).toString();
  return useQuery<PublicLearnerEvent[], BackendError>({
    queryKey: queryKeys.events.list({
      eventType: filters.eventType ?? null,
      limit: params.limit ?? null,
      offset: params.offset ?? null,
    }),
    enabled: options?.enabled ?? true,
    queryFn: ({ signal }) =>
      progressDedicatedFetch<PublicLearnerEvent[]>(
        `/api/events${qs ? `?${qs}` : ""}`,
        { signal },
      ),
    staleTime: 15_000,
  });
}
