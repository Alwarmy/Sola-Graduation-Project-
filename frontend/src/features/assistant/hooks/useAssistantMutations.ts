"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/query-keys";
import { assistantDedicatedFetch } from "@/features/assistant/api/client";
import {
  type PublicAssistantActionRun,
  type PublicAssistantConversation,
  type PublicAssistantExchange,
  type PublicAssistantMemorySignal,
} from "@/lib/contracts/assistant";
import type { BackendError } from "@/lib/errors/backend-error";

/**
 * CP9 mutations: create conversation, send message, confirm memory signal,
 * confirm action run. All routes go through the dedicated handlers under
 * `/api/assistant/...` so internal payloads (signal_value, signal_metadata,
 * request_payload, preview_payload, result_payload, used_context_summary)
 * never reach the browser.
 *
 * `mutations.retry: false` (CP3 default) — no silent retry.
 *
 * Cross-domain refetch map after confirmed action runs (per directive §9
 * "Action Run Contract Lock"):
 *   - pause_active_plan / resume_active_plan / apply_recommended_recovery:
 *     full plan scope + plans.list + plans.active.
 *   - queue_top_recommendation: plans.queue + plans.list + plans.active +
 *     recommendations.list.
 *   - review_* (review-only): assistant scope only.
 *   - unknown action_type: safe broad refetch (assistant + plans scope) +
 *     ledger note (NOTE-CP9-UNKNOWN-ACTION-TYPE-001 if hit at runtime).
 */

function invalidateAssistantScope(
  qc: ReturnType<typeof useQueryClient>,
  conversationId?: number | string | null,
) {
  qc.invalidateQueries({ queryKey: queryKeys.assistant.conversations() });
  if (conversationId !== undefined && conversationId !== null && conversationId !== "") {
    qc.invalidateQueries({ queryKey: queryKeys.assistant.conversation(conversationId) });
    qc.invalidateQueries({ queryKey: queryKeys.assistant.messages(conversationId) });
  }
  // Broad memory + action runs invalidations (filters object: invalidate all
  // memorySignals/actionRuns under the namespace by passing the prefix).
  qc.invalidateQueries({ queryKey: ["assistant", "memorySignals"] });
  qc.invalidateQueries({ queryKey: ["assistant", "actionRuns"] });
}

function invalidatePlanScope(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: queryKeys.plans.list() });
  qc.invalidateQueries({ queryKey: queryKeys.plans.active() });
  // All plan.detail / readiness / items / executionSummary / recoveryPreview
  // entries — invalidate by prefix.
  qc.invalidateQueries({ queryKey: ["plans", "detail"] });
  qc.invalidateQueries({ queryKey: ["plans", "readiness"] });
  qc.invalidateQueries({ queryKey: ["plans", "items"] });
  qc.invalidateQueries({ queryKey: ["plans", "executionSummary"] });
  qc.invalidateQueries({ queryKey: ["plans", "recoveryPreview"] });
}

function invalidateQueueScope(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: queryKeys.plans.queue() });
  qc.invalidateQueries({ queryKey: queryKeys.plans.list() });
  qc.invalidateQueries({ queryKey: queryKeys.plans.active() });
}

function invalidateRecommendations(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: queryKeys.recommendations.list() });
}

function invalidateProfileAndLearningState(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: queryKeys.profile.me() });
  qc.invalidateQueries({ queryKey: queryKeys.learningState.current() });
}

export function useCreateAssistantConversation() {
  const qc = useQueryClient();
  return useMutation<PublicAssistantConversation, BackendError, { title?: string | null }>({
    mutationFn: (input) =>
      assistantDedicatedFetch<PublicAssistantConversation>("/api/assistant/conversations", {
        method: "POST",
        json: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.assistant.conversations() });
    },
  });
}

export function useSendAssistantMessage() {
  const qc = useQueryClient();
  return useMutation<
    PublicAssistantExchange,
    BackendError,
    { conversationId: number | string; content: string }
  >({
    mutationFn: ({ conversationId, content }) =>
      assistantDedicatedFetch<PublicAssistantExchange>(
        `/api/assistant/conversations/${encodeURIComponent(String(conversationId))}/messages`,
        { method: "POST", json: { content } },
      ),
    onSuccess: (_exchange, vars) => invalidateAssistantScope(qc, vars.conversationId),
  });
}

export function useConfirmAssistantMemorySignal() {
  const qc = useQueryClient();
  return useMutation<
    PublicAssistantMemorySignal,
    BackendError,
    { signalId: number | string; conversationId?: number | string | null }
  >({
    mutationFn: ({ signalId }) =>
      assistantDedicatedFetch<PublicAssistantMemorySignal>(
        `/api/assistant/memory-signals/${encodeURIComponent(String(signalId))}/confirm`,
        { method: "POST" },
      ),
    onSuccess: (signal, vars) => {
      invalidateAssistantScope(qc, vars.conversationId ?? signal.conversationId);
      // Durable preference confirmations can shift profile preferences /
      // learning state — refetch defensively per NOTE-CP8-CP9-LEARNING-STATE-001.
      if (signal.scope === "durable_preference") {
        invalidateProfileAndLearningState(qc);
      }
    },
  });
}

/**
 * Confirm an assistant action run. The frontend does NOT call any
 * plan/course/profile mutation directly here — backend owns the side
 * effects. We just refetch the affected domain based on the returned
 * `action_type`.
 */
export function useConfirmAssistantActionRun() {
  const qc = useQueryClient();
  return useMutation<
    PublicAssistantActionRun,
    BackendError,
    { actionRunId: number | string; conversationId?: number | string | null }
  >({
    mutationFn: ({ actionRunId }) =>
      assistantDedicatedFetch<PublicAssistantActionRun>(
        `/api/assistant/action-runs/${encodeURIComponent(String(actionRunId))}/confirm`,
        { method: "POST" },
      ),
    onSuccess: (run, vars) => {
      // Assistant scope always.
      invalidateAssistantScope(qc, vars.conversationId ?? run.conversationId);

      // Cross-domain by action_type.
      switch (run.actionType) {
        case "pause_active_plan":
        case "resume_active_plan":
        case "apply_recommended_recovery":
          invalidatePlanScope(qc);
          break;
        case "queue_top_recommendation":
          invalidateQueueScope(qc);
          invalidateRecommendations(qc);
          break;
        case "review_active_plan_adjustment_options":
        case "review_plan_recovery_options":
          // Review-only — backend may not mutate plan state. Assistant
          // scope already invalidated above.
          break;
        default:
          // Unknown action types — safe broad refetch (assistant + plans),
          // but do NOT touch profile/learning-state without explicit signal.
          invalidatePlanScope(qc);
          invalidateQueueScope(qc);
          break;
      }
    },
  });
}
