import { z } from "zod";

/**
 * B1.CP9 — Product Assistant contracts.
 *
 * Mirrors `backend/app/schemas/assistant.py`
 * (read-only). The backend treats the assistant as a contextual product
 * surface, not a generic chatbot, so the contract carries:
 *   - conversation status + lifecycle counts
 *   - rich message metadata (response_mode, governance, artifact_summary)
 *   - message exchange envelope with suggested_actions + memory_candidates
 *     + governance + grounded_entities + follow_up_questions
 *   - memory signal scope / status / confidence
 *   - action run status / action_type / failure_reason
 *
 * Public view models (Public*) strip every dict / internal payload
 * (`signal_value`, `signal_metadata`, `request_payload`, `preview_payload`,
 * `result_payload`, `used_context_summary`, raw entity `metadata`) and
 * humanize every enum through a label table with a safe fallback.
 *
 * NEVER:
 *   - synthesize assistant text (final answer is `assistant_message.content`)
 *   - render raw response_mode / governance / action_type strings as UI copy
 *   - leak signal_value / signal_metadata / preview_payload / result_payload
 */

// ─── Helpers ──────────────────────────────────────────────────────────────

function safeLabel(value: string, map: Readonly<Record<string, string>>): string {
  const direct = map[value];
  if (direct) return direct;
  return value
    .replace(/[_\-]+/g, " ")
    .toLowerCase()
    .replace(/(^|\s)\w/g, (m) => m.toUpperCase());
}

function clampPercent(raw: unknown): { fraction: number; label: string } {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return { fraction: 0, label: "0%" };
  }
  const fraction = Math.max(0, Math.min(1, raw));
  const rounded = Math.round(fraction * 1000) / 10;
  const label = `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
  return { fraction, label };
}

// ─── Enum / label tables ──────────────────────────────────────────────────

export const ASSISTANT_CONTRACT_VERSION = "assistant_v1";

const CONVERSATION_STATUS_LABELS: Readonly<Record<string, string>> = {
  active: "Active",
  archived: "Archived",
};
export function assistantConversationStatusLabel(value: string): string {
  return safeLabel(value, CONVERSATION_STATUS_LABELS);
}

const MESSAGE_ROLE_LABELS: Readonly<Record<string, string>> = {
  user: "You",
  assistant: "Assistant",
  system: "System",
};
export function assistantMessageRoleLabel(value: string): string {
  return safeLabel(value, MESSAGE_ROLE_LABELS);
}

const RESPONSE_MODE_LABELS: Readonly<Record<string, string>> = {
  general_chat: "General",
  schedule_guidance: "Schedule guidance",
  schedule_support: "Schedule support",
  recovery_guidance_actionable: "Recovery guidance",
  recovery_guidance: "Recovery guidance",
  progress_reflection: "Progress reflection",
  next_course_guidance: "Next-course guidance",
  course_comparison: "Course comparison",
  recommendation_explanation: "Recommendation explanation",
  study_concept_help: "Concept help",
  general_guidance: "Guidance",
  assistant_boundaries: "Outside assistant scope",
  assistant_out_of_scope: "Outside SOLA scope",
  no_active_plan: "No active plan",
};
export function assistantResponseModeLabel(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return safeLabel(value.trim(), RESPONSE_MODE_LABELS);
}

const GOVERNANCE_STATUS_LABELS: Readonly<Record<string, string>> = {
  ready: "Ready",
  bounded: "Some answers held back",
  blocked: "I can't help with this here.",
};
export function assistantGovernanceStatusLabel(value: string | null | undefined): string {
  if (typeof value !== "string" || value.trim().length === 0) return "Ready";
  return safeLabel(value.trim(), GOVERNANCE_STATUS_LABELS);
}

const GOVERNANCE_REASON_LABELS: Readonly<Record<string, string>> = {
  unsupported_sensitive_request: "This topic isn't supported in SOLA.",
  out_of_scope_request: "This is outside the learning scope.",
  no_active_plan: "You don't have an active plan yet.",
  requires_clarification: "I need a bit more information to help.",
};
export function assistantGovernanceReasonLabel(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return safeLabel(value.trim(), GOVERNANCE_REASON_LABELS);
}

const MEMORY_SCOPE_LABELS: Readonly<Record<string, string>> = {
  durable_preference: "Long-term preference",
  temporary_constraint: "Temporary constraint",
  learning_signal: "Learning signal",
};
export function assistantMemoryScopeLabel(value: string): string {
  return safeLabel(value, MEMORY_SCOPE_LABELS);
}

const MEMORY_STATUS_LABELS: Readonly<Record<string, string>> = {
  proposed: "Proposed",
  confirmed: "Confirmed",
  active: "Active",
  dismissed: "Dismissed",
  expired: "Expired",
};
export function assistantMemoryStatusLabel(value: string): string {
  return safeLabel(value, MEMORY_STATUS_LABELS);
}

const MEMORY_SIGNAL_TYPE_LABELS: Readonly<Record<string, string>> = {
  schedule_preference: "Schedule preference",
  pace_preference: "Pace preference",
  topic_focus: "Topic focus",
  blocked_window: "Blocked time window",
  available_window: "Available time window",
};

const MEMORY_SIGNAL_KEY_LABELS: Readonly<Record<string, string>> = {
  preferred_time_window: "Preferred study window",
  avoided_time_window: "Avoided study window",
  preferred_pace: "Preferred pace",
  weekly_hours: "Weekly study hours",
  focus_topic: "Focus topic",
};

export const ACTION_STATUS_LABELS: Readonly<Record<string, string>> = {
  proposed: "Proposed",
  confirmed: "Confirmed",
  executed: "Completed",
  failed: "Failed",
  dismissed: "Dismissed",
};
export function assistantActionStatusLabel(value: string): string {
  return safeLabel(value, ACTION_STATUS_LABELS);
}

export const KNOWN_ACTION_TYPES = [
  "review_active_plan_adjustment_options",
  "review_plan_recovery_options",
  "apply_recommended_recovery",
  "pause_active_plan",
  "resume_active_plan",
  "queue_top_recommendation",
] as const;
export type AssistantActionType = (typeof KNOWN_ACTION_TYPES)[number];

const ACTION_TYPE_LABELS: Readonly<Record<string, string>> = {
  review_active_plan_adjustment_options: "Review plan adjustment options",
  review_plan_recovery_options: "Review recovery options",
  apply_recommended_recovery: "Apply recommended recovery",
  pause_active_plan: "Pause active plan",
  resume_active_plan: "Resume plan",
  queue_top_recommendation: "Queue the top recommendation",
};
export function assistantActionTypeLabel(value: string): string {
  return safeLabel(value, ACTION_TYPE_LABELS);
}

export function isKnownAssistantActionType(value: string): value is AssistantActionType {
  return (KNOWN_ACTION_TYPES as readonly string[]).includes(value);
}

const ACTION_FAILURE_REASON_LABELS: Readonly<Record<string, string>> = {
  plan_not_found: "Plan not available.",
  plan_already_paused: "The plan is already paused.",
  plan_already_active: "The plan is already active.",
  no_recovery_needed: "No recovery is needed right now.",
  queue_full: "Your queue is full.",
  conflict: "This action conflicts with the current plan state.",
};
export function assistantActionFailureReasonLabel(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const direct = ACTION_FAILURE_REASON_LABELS[value.trim()];
  if (direct) return direct;
  return "The action could not complete.";
}

// ─── AssistantConversationResponse ────────────────────────────────────────

export const assistantConversationResponseSchema = z
  .object({
    id: z.number().int(),
    user_id: z.number().int(),
    title: z.string(),
    status: z.string(),
    conversation_metadata: z.unknown().optional(),
    last_user_message_at: z.string().nullish(),
    last_assistant_message_at: z.string().nullish(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .passthrough();
export type AssistantConversationResponse = z.infer<typeof assistantConversationResponseSchema>;

export type PublicAssistantConversation = {
  id: number;
  title: string;
  status: string;
  statusLabel: string;
  lastUserMessageAt: string | null;
  lastAssistantMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function toPublicAssistantConversation(
  c: AssistantConversationResponse,
): PublicAssistantConversation {
  return {
    id: c.id,
    title: c.title,
    status: c.status,
    statusLabel: assistantConversationStatusLabel(c.status),
    lastUserMessageAt: c.last_user_message_at ?? null,
    lastAssistantMessageAt: c.last_assistant_message_at ?? null,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

export const assistantConversationCreateRequestSchema = z.object({
  title: z.string().min(1, "Give the conversation a short title.").max(200).nullish(),
});
export type AssistantConversationCreateRequest = z.infer<
  typeof assistantConversationCreateRequestSchema
>;

// ─── AssistantGovernanceResponse ─────────────────────────────────────────

export const assistantGovernanceResponseSchema = z
  .object({
    status: z.string(),
    intent: z.string(),
    answer_strategy: z.string(),
    blocking_reason: z.string().nullish(),
    requires_clarification: z.boolean().default(false),
    can_extract_memory: z.boolean().default(true),
    can_suggest_actions: z.boolean().default(false),
    has_active_plan: z.boolean().default(false),
    has_recovery_preview: z.boolean().default(false),
    has_recommendations: z.boolean().default(false),
    has_next_actionable_item: z.boolean().default(false),
    concept_label: z.string().nullish(),
  })
  .passthrough();
export type AssistantGovernanceResponse = z.infer<typeof assistantGovernanceResponseSchema>;

export type PublicAssistantGovernance = {
  status: string;
  statusLabel: string;
  blockingReasonLabel: string | null;
  requiresClarification: boolean;
  canSuggestActions: boolean;
};

export function toPublicAssistantGovernance(
  g: AssistantGovernanceResponse | null | undefined,
): PublicAssistantGovernance | null {
  if (!g) return null;
  return {
    status: g.status,
    statusLabel: assistantGovernanceStatusLabel(g.status),
    blockingReasonLabel: assistantGovernanceReasonLabel(g.blocking_reason ?? null),
    requiresClarification: g.requires_clarification ?? false,
    canSuggestActions: g.can_suggest_actions ?? false,
  };
}

// ─── AssistantMessageResponse ─────────────────────────────────────────────

const assistantArtifactSummarySchema = z
  .object({
    grounded_entity_count: z.number().int().optional(),
    suggested_action_count: z.number().int().optional(),
    memory_candidate_count: z.number().int().optional(),
    follow_up_question_count: z.number().int().optional(),
  })
  .passthrough();

export const assistantMessageResponseSchema = z
  .object({
    id: z.number().int(),
    conversation_id: z.number().int(),
    user_id: z.number().int(),
    role: z.string(),
    content: z.string(),
    message_intent: z.string().nullish(),
    message_metadata: z.unknown().optional(),
    context_snapshot: z.unknown().optional(),
    created_at: z.string(),
    response_mode: z.string().nullish(),
    governance: assistantGovernanceResponseSchema.nullish(),
    artifact_summary: assistantArtifactSummarySchema.optional(),
    sequence_number: z.number().int().nullish(),
    is_latest_in_conversation: z.boolean().optional(),
    has_structured_artifacts: z.boolean().optional(),
  })
  .passthrough();
export type AssistantMessageResponse = z.infer<typeof assistantMessageResponseSchema>;

export type PublicAssistantMessage = {
  id: number;
  conversationId: number;
  role: string;
  roleLabel: string;
  content: string;
  responseModeLabel: string | null;
  governance: PublicAssistantGovernance | null;
  hasStructuredArtifacts: boolean;
  sequenceNumber: number | null;
  isLatestInConversation: boolean;
  createdAt: string;
};

export function toPublicAssistantMessage(m: AssistantMessageResponse): PublicAssistantMessage {
  return {
    id: m.id,
    conversationId: m.conversation_id,
    role: m.role,
    roleLabel: assistantMessageRoleLabel(m.role),
    content: m.content,
    responseModeLabel: assistantResponseModeLabel(m.response_mode ?? null),
    governance: toPublicAssistantGovernance(m.governance ?? null),
    hasStructuredArtifacts: m.has_structured_artifacts ?? false,
    sequenceNumber: m.sequence_number ?? null,
    isLatestInConversation: m.is_latest_in_conversation ?? false,
    createdAt: m.created_at,
  };
}

export const assistantMessageCreateRequestSchema = z.object({
  content: z.string().min(1, "Type your message.").max(4000, "Message is too long."),
});
export type AssistantMessageCreateRequest = z.infer<typeof assistantMessageCreateRequestSchema>;

// ─── AssistantMemorySignalResponse ────────────────────────────────────────

export const assistantMemorySignalResponseSchema = z
  .object({
    id: z.number().int(),
    user_id: z.number().int(),
    conversation_id: z.number().int().nullish(),
    source_message_id: z.number().int().nullish(),
    signal_type: z.string(),
    signal_key: z.string(),
    signal_summary: z.string(),
    signal_value: z.unknown().optional(),
    signal_metadata: z.unknown().optional(),
    scope: z.string(),
    confidence_score: z.number(),
    status: z.string(),
    effective_from: z.string().nullish(),
    expires_at: z.string().nullish(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .passthrough();
export type AssistantMemorySignalResponse = z.infer<
  typeof assistantMemorySignalResponseSchema
>;

export type PublicAssistantMemorySignal = {
  id: number;
  conversationId: number | null;
  sourceMessageId: number | null;
  signalType: string;
  signalTypeLabel: string;
  signalKey: string;
  signalKeyLabel: string;
  signalSummary: string;
  scope: string;
  scopeLabel: string;
  status: string;
  statusLabel: string;
  confidenceScore: number;
  confidenceLabel: string;
  effectiveFrom: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function toPublicAssistantMemorySignal(
  s: AssistantMemorySignalResponse,
): PublicAssistantMemorySignal {
  const conf = clampPercent(s.confidence_score);
  return {
    id: s.id,
    conversationId: s.conversation_id ?? null,
    sourceMessageId: s.source_message_id ?? null,
    signalType: s.signal_type,
    signalTypeLabel: safeLabel(s.signal_type, MEMORY_SIGNAL_TYPE_LABELS),
    signalKey: s.signal_key,
    signalKeyLabel: safeLabel(s.signal_key, MEMORY_SIGNAL_KEY_LABELS),
    signalSummary: s.signal_summary,
    scope: s.scope,
    scopeLabel: assistantMemoryScopeLabel(s.scope),
    status: s.status,
    statusLabel: assistantMemoryStatusLabel(s.status),
    confidenceScore: conf.fraction,
    confidenceLabel: conf.label,
    effectiveFrom: s.effective_from ?? null,
    expiresAt: s.expires_at ?? null,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}

// ─── AssistantActionRunResponse ───────────────────────────────────────────

export const assistantActionRunResponseSchema = z
  .object({
    id: z.number().int(),
    user_id: z.number().int(),
    conversation_id: z.number().int(),
    source_message_id: z.number().int().nullish(),
    action_type: z.string(),
    status: z.string(),
    request_payload: z.unknown().optional(),
    preview_payload: z.unknown().optional(),
    result_payload: z.unknown().optional(),
    failure_reason: z.string().nullish(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .passthrough();
export type AssistantActionRunResponse = z.infer<typeof assistantActionRunResponseSchema>;

export type PublicAssistantActionRun = {
  id: number;
  conversationId: number;
  sourceMessageId: number | null;
  actionType: string;
  actionTypeLabel: string;
  isKnownActionType: boolean;
  status: string;
  statusLabel: string;
  failureReasonLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

export function toPublicAssistantActionRun(
  r: AssistantActionRunResponse,
): PublicAssistantActionRun {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    sourceMessageId: r.source_message_id ?? null,
    actionType: r.action_type,
    actionTypeLabel: assistantActionTypeLabel(r.action_type),
    isKnownActionType: isKnownAssistantActionType(r.action_type),
    status: r.status,
    statusLabel: assistantActionStatusLabel(r.status),
    failureReasonLabel:
      r.status === "failed" ? assistantActionFailureReasonLabel(r.failure_reason ?? null) : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ─── AssistantGroundedEntity ──────────────────────────────────────────────

const assistantGroundedEntitySchema = z
  .object({
    entity_type: z.string(),
    entity_id: z.number().int().nullish(),
    label: z.string(),
    metadata: z.unknown().optional(),
  })
  .passthrough();
export type AssistantGroundedEntity = z.infer<typeof assistantGroundedEntitySchema>;

export type PublicAssistantGroundedEntity = {
  entityType: string;
  entityTypeLabel: string;
  entityId: number | null;
  label: string;
};

const GROUNDED_ENTITY_TYPE_LABELS: Readonly<Record<string, string>> = {
  learning_plan: "Plan",
  plan_item: "Schedule item",
  course: "Course",
  recommendation: "Recommendation",
  recovery_preview: "Recovery preview",
  active_plan: "Active plan",
};

export function toPublicAssistantGroundedEntity(
  e: AssistantGroundedEntity,
): PublicAssistantGroundedEntity {
  return {
    entityType: e.entity_type,
    entityTypeLabel: safeLabel(e.entity_type, GROUNDED_ENTITY_TYPE_LABELS),
    entityId: e.entity_id ?? null,
    label: e.label,
  };
}

// ─── AssistantSuggestedAction ─────────────────────────────────────────────

const assistantSuggestedActionSchema = z
  .object({
    action_run_id: z.number().int(),
    action_type: z.string(),
    title: z.string(),
    summary: z.string(),
    requires_confirmation: z.boolean().default(true),
    preview_payload: z.unknown().optional(),
  })
  .passthrough();
export type AssistantSuggestedAction = z.infer<typeof assistantSuggestedActionSchema>;

export type PublicAssistantSuggestedAction = {
  actionRunId: number;
  actionType: string;
  actionTypeLabel: string;
  isKnownActionType: boolean;
  title: string;
  summary: string;
  requiresConfirmation: boolean;
};

export function toPublicAssistantSuggestedAction(
  a: AssistantSuggestedAction,
): PublicAssistantSuggestedAction {
  return {
    actionRunId: a.action_run_id,
    actionType: a.action_type,
    actionTypeLabel: assistantActionTypeLabel(a.action_type),
    isKnownActionType: isKnownAssistantActionType(a.action_type),
    title: a.title,
    summary: a.summary,
    requiresConfirmation: a.requires_confirmation ?? true,
  };
}

// ─── AssistantMessageExchangeResponse ─────────────────────────────────────

export const assistantMessageExchangeResponseSchema = z
  .object({
    contract_version: z.string().default(ASSISTANT_CONTRACT_VERSION),
    conversation: assistantConversationResponseSchema,
    user_message: assistantMessageResponseSchema,
    assistant_message: assistantMessageResponseSchema,
    response_mode: z.string(),
    grounded_entities: z.array(assistantGroundedEntitySchema).optional(),
    used_context_summary: z.unknown().optional(),
    suggested_actions: z.array(assistantSuggestedActionSchema).optional(),
    memory_candidates: z.array(assistantMemorySignalResponseSchema).optional(),
    follow_up_questions: z.array(z.string()).optional(),
    governance: assistantGovernanceResponseSchema,
  })
  .passthrough();
export type AssistantMessageExchangeResponse = z.infer<
  typeof assistantMessageExchangeResponseSchema
>;

export type PublicAssistantExchange = {
  conversation: PublicAssistantConversation;
  userMessage: PublicAssistantMessage;
  assistantMessage: PublicAssistantMessage;
  responseModeLabel: string | null;
  governance: PublicAssistantGovernance | null;
  groundedEntities: PublicAssistantGroundedEntity[];
  suggestedActions: PublicAssistantSuggestedAction[];
  memoryCandidates: PublicAssistantMemorySignal[];
  followUpQuestions: string[];
};

export function toPublicAssistantExchange(
  r: AssistantMessageExchangeResponse,
): PublicAssistantExchange {
  return {
    conversation: toPublicAssistantConversation(r.conversation),
    userMessage: toPublicAssistantMessage(r.user_message),
    assistantMessage: toPublicAssistantMessage(r.assistant_message),
    responseModeLabel: assistantResponseModeLabel(r.response_mode),
    governance: toPublicAssistantGovernance(r.governance),
    groundedEntities: (r.grounded_entities ?? []).map(toPublicAssistantGroundedEntity),
    suggestedActions: (r.suggested_actions ?? []).map(toPublicAssistantSuggestedAction),
    memoryCandidates: (r.memory_candidates ?? []).map(toPublicAssistantMemorySignal),
    followUpQuestions: r.follow_up_questions ?? [],
  };
}

// ─── AssistantConversationDetailResponse ─────────────────────────────────

export const assistantConversationDetailResponseSchema =
  assistantConversationResponseSchema.extend({
    contract_version: z.string().default(ASSISTANT_CONTRACT_VERSION),
    message_count: z.number().int(),
    active_memory_signal_count: z.number().int(),
    pending_action_count: z.number().int(),
    messages: z.array(assistantMessageResponseSchema).optional(),
    recent_action_runs: z.array(assistantActionRunResponseSchema).optional(),
    effective_memory_signals: z.array(assistantMemorySignalResponseSchema).optional(),
    contract_summary: z.unknown().optional(),
    lifecycle_summary: z.unknown().optional(),
  });
export type AssistantConversationDetailResponse = z.infer<
  typeof assistantConversationDetailResponseSchema
>;

export type PublicAssistantConversationDetail = PublicAssistantConversation & {
  messageCount: number;
  activeMemorySignalCount: number;
  pendingActionCount: number;
  messages: PublicAssistantMessage[];
  recentActionRuns: PublicAssistantActionRun[];
  effectiveMemorySignals: PublicAssistantMemorySignal[];
};

export function toPublicAssistantConversationDetail(
  d: AssistantConversationDetailResponse,
): PublicAssistantConversationDetail {
  return {
    ...toPublicAssistantConversation(d),
    messageCount: d.message_count,
    activeMemorySignalCount: d.active_memory_signal_count,
    pendingActionCount: d.pending_action_count,
    messages: (d.messages ?? []).map(toPublicAssistantMessage),
    recentActionRuns: (d.recent_action_runs ?? []).map(toPublicAssistantActionRun),
    effectiveMemorySignals: (d.effective_memory_signals ?? []).map(toPublicAssistantMemorySignal),
  };
}
