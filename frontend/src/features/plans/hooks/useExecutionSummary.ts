"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/query-keys";
import type { PublicExecutionSummary } from "@/lib/contracts/plan-execution";
import { BackendError } from "@/lib/errors/backend-error";

/**
 * useExecutionSummary — CP8 read of `/api/plans/[planId]/execution-summary`.
 *
 * The dedicated handler returns a `PublicExecutionSummary` already.
 * 404 propagates as a `BackendError` for the caller's `<ErrorState>`.
 */
export function useExecutionSummary(
  planId: number | string | null,
  options?: { enabled?: boolean },
) {
  return useQuery<PublicExecutionSummary, BackendError>({
    queryKey: queryKeys.plans.executionSummary(planId ?? ""),
    enabled: (options?.enabled ?? true) && planId !== null && planId !== "",
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `/api/plans/${encodeURIComponent(String(planId))}/execution-summary`,
        {
          method: "GET",
          credentials: "same-origin",
          headers: { accept: "application/json" },
          cache: "no-store",
          signal,
        },
      );
      const body = await response.json().catch(() => undefined);
      if (!response.ok) {
        const obj = (body ?? {}) as Record<string, unknown>;
        throw new BackendError({
          status: response.status,
          detail:
            typeof obj.detail === "string" ? obj.detail : `Request failed (${response.status})`,
          errorCode: typeof obj.error_code === "string" ? obj.error_code : undefined,
          requestId:
            typeof obj.request_id === "string"
              ? obj.request_id
              : (response.headers.get("x-request-id") ?? undefined),
        });
      }
      return body as PublicExecutionSummary;
    },
    staleTime: 15_000,
  });
}
