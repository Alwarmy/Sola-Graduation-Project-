"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/query-keys";
import { assistantDedicatedFetch } from "@/features/assistant/api/client";
import type { PublicAssistantActionRun } from "@/lib/contracts/assistant";
import type { BackendError } from "@/lib/errors/backend-error";

export type AssistantActionRunsFilters = {
  conversationId?: number | string | null;
};

/**
 * CP9 closure-pass: read moved from `/api/sola/[...path]` to the
 * dedicated `/api/assistant/action-runs` GET handler. The dedicated
 * handler strips `request_payload`, `preview_payload`, `result_payload`
 * server-side.
 */
export function useAssistantActionRuns(
  filters: AssistantActionRunsFilters = {},
  options?: { enabled?: boolean },
) {
  const params: Record<string, string> = {};
  if (
    filters.conversationId !== null &&
    filters.conversationId !== undefined &&
    filters.conversationId !== ""
  ) {
    params.conversation_id = String(filters.conversationId);
  }
  const qs = new URLSearchParams(params).toString();
  return useQuery<PublicAssistantActionRun[], BackendError>({
    queryKey: queryKeys.assistant.actionRuns({
      conversationId: filters.conversationId ?? null,
    }),
    enabled: options?.enabled ?? true,
    queryFn: ({ signal }) =>
      assistantDedicatedFetch<PublicAssistantActionRun[]>(
        `/api/assistant/action-runs${qs ? `?${qs}` : ""}`,
        { method: "GET", signal },
      ),
    staleTime: 10_000,
  });
}
