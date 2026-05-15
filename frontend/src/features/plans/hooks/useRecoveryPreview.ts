"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/query-keys";
import type { PublicRecoveryPreview } from "@/lib/contracts/plan-execution";
import { BackendError } from "@/lib/errors/backend-error";

/**
 * useRecoveryPreview — CP8 read of `/api/plans/[planId]/recovery-preview`.
 *
 * The dedicated handler returns a `PublicRecoveryPreview` with safe
 * labels for drift level, recovery pressure, recommended action, and
 * available recovery modes.
 */
export function useRecoveryPreview(
  planId: number | string | null,
  options?: { enabled?: boolean },
) {
  return useQuery<PublicRecoveryPreview, BackendError>({
    queryKey: queryKeys.plans.recoveryPreview(planId ?? ""),
    enabled: (options?.enabled ?? true) && planId !== null && planId !== "",
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `/api/plans/${encodeURIComponent(String(planId))}/recovery-preview`,
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
      return body as PublicRecoveryPreview;
    },
    staleTime: 15_000,
  });
}
