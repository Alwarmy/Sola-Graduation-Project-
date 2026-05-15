"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/query-keys";
import { assistantDedicatedFetch } from "@/features/assistant/api/client";
import type { PublicAssistantMemorySignal } from "@/lib/contracts/assistant";
import type { BackendError } from "@/lib/errors/backend-error";

export type AssistantMemorySignalsFilters = {
  conversationId?: number | string | null;
  effectiveOnly?: boolean;
  statusFilter?: string | null;
};

/**
 * CP9 closure-pass: read moved from `/api/sola/[...path]` to the
 * dedicated `/api/assistant/memory-signals` GET handler. The dedicated
 * handler strips `signal_value` and `signal_metadata` server-side and
 * forwards `status_filter` / `effective_only` / `conversation_id` query
 * params verbatim.
 */
export function useAssistantMemorySignals(
  filters: AssistantMemorySignalsFilters = {},
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
  if (filters.effectiveOnly === true) params.effective_only = "true";
  if (typeof filters.statusFilter === "string" && filters.statusFilter.length > 0) {
    params.status_filter = filters.statusFilter;
  }
  const qs = new URLSearchParams(params).toString();
  return useQuery<PublicAssistantMemorySignal[], BackendError>({
    queryKey: queryKeys.assistant.memorySignals({
      conversationId: filters.conversationId ?? null,
      effectiveOnly: filters.effectiveOnly ?? false,
      statusFilter: filters.statusFilter ?? null,
    }),
    enabled: options?.enabled ?? true,
    queryFn: ({ signal }) =>
      assistantDedicatedFetch<PublicAssistantMemorySignal[]>(
        `/api/assistant/memory-signals${qs ? `?${qs}` : ""}`,
        { method: "GET", signal },
      ),
    staleTime: 10_000,
  });
}
