"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { queryKeys } from "@/lib/query/query-keys";
import type { PublicPlanItem } from "@/lib/contracts/plan-execution";
import { BackendError } from "@/lib/errors/backend-error";

/**
 * usePlanItems — CP8 read of `/api/plans/[planId]/items`.
 *
 * The dedicated route handler already adapts each backend
 * `LearningPlanItemResponse` to the safe `PublicPlanItem` shape.
 * This hook validates only the outer array shape + minimal item id
 * to defend against a future contract drift, then forwards as-is.
 */

const publicItemArraySchema = z.array(
  z
    .object({
      id: z.number().int(),
      planId: z.number().int(),
      version: z.number().int(),
      title: z.string(),
      status: z.string(),
      statusLabel: z.string(),
    })
    .passthrough(),
);

export function usePlanItems(planId: number | string | null, options?: { enabled?: boolean }) {
  return useQuery<PublicPlanItem[], BackendError>({
    queryKey: queryKeys.plans.items(planId ?? ""),
    enabled: (options?.enabled ?? true) && planId !== null && planId !== "",
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `/api/plans/${encodeURIComponent(String(planId))}/items`,
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
      // Light validation — the dedicated handler is the source of truth.
      publicItemArraySchema.parse(body);
      return body as PublicPlanItem[];
    },
    staleTime: 15_000,
  });
}
