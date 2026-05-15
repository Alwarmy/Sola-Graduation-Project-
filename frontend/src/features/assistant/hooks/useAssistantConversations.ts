"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/query-keys";
import { assistantDedicatedFetch } from "@/features/assistant/api/client";
import type {
  PublicAssistantConversation,
  PublicAssistantConversationDetail,
} from "@/lib/contracts/assistant";
import type { BackendError } from "@/lib/errors/backend-error";

/**
 * CP9 closure-pass: reads moved from `/api/sola/[...path]` (transparent
 * passthrough — leaked raw `conversation_metadata` to the network tab)
 * to the dedicated CP9 GET handler at `/api/assistant/conversations`
 * (server-side adapter; only `PublicAssistantConversation` reaches the
 * browser).
 */
export function useAssistantConversations(options?: { enabled?: boolean }) {
  return useQuery<PublicAssistantConversation[], BackendError>({
    queryKey: queryKeys.assistant.conversations(),
    enabled: options?.enabled ?? true,
    queryFn: ({ signal }) =>
      assistantDedicatedFetch<PublicAssistantConversation[]>("/api/assistant/conversations", {
        method: "GET",
        signal,
      }),
    staleTime: 15_000,
  });
}

export function useAssistantConversation(
  conversationId: number | string | null,
  options?: { enabled?: boolean },
) {
  return useQuery<PublicAssistantConversationDetail, BackendError>({
    queryKey: queryKeys.assistant.conversation(conversationId ?? ""),
    enabled:
      (options?.enabled ?? true) && conversationId !== null && conversationId !== "",
    queryFn: ({ signal }) =>
      assistantDedicatedFetch<PublicAssistantConversationDetail>(
        `/api/assistant/conversations/${encodeURIComponent(String(conversationId))}`,
        { method: "GET", signal },
      ),
    staleTime: 15_000,
  });
}
