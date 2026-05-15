"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/query-keys";
import { assistantDedicatedFetch } from "@/features/assistant/api/client";
import type { PublicAssistantMessage } from "@/lib/contracts/assistant";
import type { BackendError } from "@/lib/errors/backend-error";

/**
 * CP9 closure-pass: read moved from `/api/sola/[...path]` to the
 * dedicated `/api/assistant/conversations/[id]/messages` GET handler.
 * The dedicated handler strips `message_metadata` + `context_snapshot`
 * server-side so the response body never carries them.
 */
export function useAssistantMessages(
  conversationId: number | string | null,
  options?: { enabled?: boolean },
) {
  return useQuery<PublicAssistantMessage[], BackendError>({
    queryKey: queryKeys.assistant.messages(conversationId ?? ""),
    enabled:
      (options?.enabled ?? true) && conversationId !== null && conversationId !== "",
    queryFn: ({ signal }) =>
      assistantDedicatedFetch<PublicAssistantMessage[]>(
        `/api/assistant/conversations/${encodeURIComponent(String(conversationId))}/messages`,
        { method: "GET", signal },
      ),
    staleTime: 10_000,
  });
}
