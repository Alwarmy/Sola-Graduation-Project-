import { describe, expect, test } from "vitest";

import {
  KNOWN_ACTION_TYPES,
  assistantActionFailureReasonLabel,
  assistantActionStatusLabel,
  assistantActionTypeLabel,
  assistantConversationStatusLabel,
  assistantGovernanceReasonLabel,
  assistantGovernanceStatusLabel,
  assistantMemoryScopeLabel,
  assistantMemoryStatusLabel,
  assistantMessageRoleLabel,
  assistantResponseModeLabel,
  isKnownAssistantActionType,
  toPublicAssistantActionRun,
  toPublicAssistantConversation,
  toPublicAssistantConversationDetail,
  toPublicAssistantExchange,
  toPublicAssistantMemorySignal,
  toPublicAssistantMessage,
} from "@/lib/contracts/assistant";

const rawConversation = {
  id: 11,
  user_id: 270,
  title: "Help with Python",
  status: "active",
  conversation_metadata: { last_detected_intent: "schedule_support" },
  last_user_message_at: "2026-05-13T10:00:00Z",
  last_assistant_message_at: "2026-05-13T10:00:05Z",
  created_at: "2026-05-13T09:30:00Z",
  updated_at: "2026-05-13T10:00:05Z",
};

const rawGovernance = {
  status: "ready",
  intent: "schedule_support",
  answer_strategy: "schedule_guidance_with_action",
  blocking_reason: null,
  requires_clarification: false,
  can_extract_memory: true,
  can_suggest_actions: true,
  has_active_plan: true,
  has_recovery_preview: true,
  has_recommendations: false,
  has_next_actionable_item: true,
  concept_label: null,
};

const rawUserMessage = {
  id: 41,
  conversation_id: 11,
  user_id: 270,
  role: "user",
  content: "I prefer evening study slots.",
  message_intent: "schedule_support",
  message_metadata: { internal_only: "DO_NOT_LEAK_meta" },
  context_snapshot: { internal_only: "DO_NOT_LEAK_snapshot" },
  created_at: "2026-05-13T10:00:00Z",
};

const rawAssistantMessage = {
  ...rawUserMessage,
  id: 42,
  role: "assistant",
  content: "Got it — I'll keep evenings as your preferred window.",
  response_mode: "schedule_guidance",
  governance: rawGovernance,
  artifact_summary: {
    grounded_entity_count: 1,
    suggested_action_count: 1,
    memory_candidate_count: 1,
    follow_up_question_count: 1,
  },
  sequence_number: 2,
  is_latest_in_conversation: true,
  has_structured_artifacts: true,
};

const rawSuggestedAction = {
  action_run_id: 71,
  action_type: "review_active_plan_adjustment_options",
  title: "Review plan adjustment options",
  summary: "Open the plan adjustment review flow.",
  requires_confirmation: true,
  preview_payload: { internal_only: "DO_NOT_LEAK_preview" },
};

const rawMemorySignal = {
  id: 91,
  user_id: 270,
  conversation_id: 11,
  source_message_id: 41,
  signal_type: "schedule_preference",
  signal_key: "preferred_time_window",
  signal_summary: "Prefers evening study slots.",
  signal_value: { value: "evening", DO_NOT_LEAK: "internal" },
  signal_metadata: { source: "user_explicit", DO_NOT_LEAK: "internal" },
  scope: "durable_preference",
  confidence_score: 0.92,
  status: "proposed",
  effective_from: null,
  expires_at: null,
  created_at: "2026-05-13T10:00:05Z",
  updated_at: "2026-05-13T10:00:05Z",
};

const rawActionRun = {
  id: 71,
  user_id: 270,
  conversation_id: 11,
  source_message_id: 42,
  action_type: "pause_active_plan",
  status: "proposed",
  request_payload: { internal_only: "DO_NOT_LEAK_request" },
  preview_payload: { internal_only: "DO_NOT_LEAK_preview" },
  result_payload: { internal_only: "DO_NOT_LEAK_result" },
  failure_reason: null,
  created_at: "2026-05-13T10:00:05Z",
  updated_at: "2026-05-13T10:00:05Z",
};

const rawExchange = {
  contract_version: "assistant_v1",
  conversation: rawConversation,
  user_message: rawUserMessage,
  assistant_message: rawAssistantMessage,
  response_mode: "schedule_guidance",
  grounded_entities: [
    {
      entity_type: "learning_plan",
      entity_id: 201,
      label: "Master Python",
      metadata: { DO_NOT_LEAK: "internal_metadata" },
    },
  ],
  used_context_summary: { DO_NOT_LEAK: "internal_context" },
  suggested_actions: [rawSuggestedAction],
  memory_candidates: [rawMemorySignal],
  follow_up_questions: ["Want me to update your weekly cap too?"],
  governance: rawGovernance,
};

describe("assistant contracts (B1.CP9)", () => {
  test("status / role / response-mode / governance label helpers map safely", () => {
    expect(assistantConversationStatusLabel("active")).toBe("Active");
    expect(assistantConversationStatusLabel("archived")).toBe("Archived");
    expect(assistantConversationStatusLabel("future_unknown")).toBe("Future Unknown");

    expect(assistantMessageRoleLabel("user")).toBe("You");
    expect(assistantMessageRoleLabel("assistant")).toBe("Assistant");
    expect(assistantMessageRoleLabel("system")).toBe("System");

    expect(assistantResponseModeLabel(null)).toBeNull();
    expect(assistantResponseModeLabel("")).toBeNull();
    expect(assistantResponseModeLabel("schedule_guidance")).toBe("Schedule guidance");
    expect(assistantResponseModeLabel("assistant_out_of_scope")).toBe("Outside SOLA scope");
    expect(assistantResponseModeLabel("brand_new_mode")).toBe("Brand New Mode");

    expect(assistantGovernanceStatusLabel("ready")).toBe("Ready");
    expect(assistantGovernanceStatusLabel("blocked")).toBe("I can't help with this here.");
    expect(assistantGovernanceStatusLabel("bounded")).toBe("Some answers held back");

    expect(assistantGovernanceReasonLabel("unsupported_sensitive_request")).toBe(
      "This topic isn't supported in SOLA.",
    );
    expect(assistantGovernanceReasonLabel(null)).toBeNull();
  });

  test("memory + action enum helpers map safely", () => {
    expect(assistantMemoryScopeLabel("durable_preference")).toBe("Long-term preference");
    expect(assistantMemoryStatusLabel("proposed")).toBe("Proposed");

    expect(assistantActionStatusLabel("executed")).toBe("Completed");
    expect(assistantActionStatusLabel("failed")).toBe("Failed");

    expect(assistantActionTypeLabel("pause_active_plan")).toBe("Pause active plan");
    expect(assistantActionTypeLabel("queue_top_recommendation")).toBe(
      "Queue the top recommendation",
    );
    // Unknown action type still renders safely via humanize.
    expect(assistantActionTypeLabel("magical_new_action_type")).toBe("Magical New Action Type");

    expect(isKnownAssistantActionType("pause_active_plan")).toBe(true);
    expect(isKnownAssistantActionType("magical_new_action_type")).toBe(false);
    expect(KNOWN_ACTION_TYPES.length).toBe(6);

    expect(assistantActionFailureReasonLabel("plan_not_found")).toBe("Plan not available.");
    expect(assistantActionFailureReasonLabel("never_seen_reason")).toBe(
      "The action could not complete.",
    );
    expect(assistantActionFailureReasonLabel(null)).toBeNull();
  });

  test("toPublicAssistantConversation: snake → camel, no metadata leak", () => {
    const pub = toPublicAssistantConversation(rawConversation);
    expect(pub.id).toBe(11);
    expect(pub.title).toBe("Help with Python");
    expect(pub.statusLabel).toBe("Active");
    expect(pub.lastAssistantMessageAt).toBe("2026-05-13T10:00:05Z");
    const json = JSON.stringify(pub);
    expect(json).not.toContain("conversation_metadata");
    expect(json).not.toContain("user_id");
  });

  test("toPublicAssistantMessage strips internal metadata / context_snapshot", () => {
    const pub = toPublicAssistantMessage(rawAssistantMessage);
    expect(pub.id).toBe(42);
    expect(pub.roleLabel).toBe("Assistant");
    expect(pub.content).toBe("Got it — I'll keep evenings as your preferred window.");
    expect(pub.responseModeLabel).toBe("Schedule guidance");
    expect(pub.governance?.statusLabel).toBe("Ready");
    expect(pub.isLatestInConversation).toBe(true);
    expect(pub.hasStructuredArtifacts).toBe(true);
    const json = JSON.stringify(pub);
    expect(json).not.toContain("message_metadata");
    expect(json).not.toContain("context_snapshot");
    expect(json).not.toContain("DO_NOT_LEAK");
    expect(json).not.toContain("artifact_summary");
  });

  test("toPublicAssistantMemorySignal strips signal_value/metadata; label-maps scope/status/type/key", () => {
    const pub = toPublicAssistantMemorySignal(rawMemorySignal);
    expect(pub.scopeLabel).toBe("Long-term preference");
    expect(pub.statusLabel).toBe("Proposed");
    expect(pub.signalTypeLabel).toBe("Schedule preference");
    expect(pub.signalKeyLabel).toBe("Preferred study window");
    expect(pub.confidenceLabel).toBe("92%");
    expect(pub.signalSummary).toBe("Prefers evening study slots.");
    const json = JSON.stringify(pub);
    expect(json).not.toContain("signal_value");
    expect(json).not.toContain("signal_metadata");
    expect(json).not.toContain("DO_NOT_LEAK");
    expect(json).not.toContain("user_id");
  });

  test("toPublicAssistantActionRun strips all *_payload dicts and unknown-known classification works", () => {
    const knownPub = toPublicAssistantActionRun(rawActionRun);
    expect(knownPub.actionType).toBe("pause_active_plan");
    expect(knownPub.actionTypeLabel).toBe("Pause active plan");
    expect(knownPub.isKnownActionType).toBe(true);
    expect(knownPub.statusLabel).toBe("Proposed");
    expect(knownPub.failureReasonLabel).toBeNull();

    const unknownPub = toPublicAssistantActionRun({
      ...rawActionRun,
      id: 72,
      action_type: "future_unknown_action",
      status: "failed",
      failure_reason: "completely_new_reason",
    });
    expect(unknownPub.actionTypeLabel).toBe("Future Unknown Action");
    expect(unknownPub.isKnownActionType).toBe(false);
    expect(unknownPub.statusLabel).toBe("Failed");
    expect(unknownPub.failureReasonLabel).toBe("The action could not complete.");

    const json = JSON.stringify([knownPub, unknownPub]);
    expect(json).not.toContain("request_payload");
    expect(json).not.toContain("preview_payload");
    expect(json).not.toContain("result_payload");
    expect(json).not.toContain("DO_NOT_LEAK");
  });

  test("toPublicAssistantExchange wires message + suggested actions + memory candidates + governance safely", () => {
    const pub = toPublicAssistantExchange(rawExchange);
    expect(pub.assistantMessage.content).toBe(
      "Got it — I'll keep evenings as your preferred window.",
    );
    expect(pub.responseModeLabel).toBe("Schedule guidance");
    expect(pub.governance?.statusLabel).toBe("Ready");
    expect(pub.groundedEntities[0]?.entityTypeLabel).toBe("Plan");
    expect(pub.groundedEntities[0]?.label).toBe("Master Python");
    expect(pub.suggestedActions).toHaveLength(1);
    expect(pub.suggestedActions[0]?.actionRunId).toBe(71);
    expect(pub.suggestedActions[0]?.actionTypeLabel).toBe("Review plan adjustment options");
    expect(pub.memoryCandidates).toHaveLength(1);
    expect(pub.memoryCandidates[0]?.statusLabel).toBe("Proposed");
    expect(pub.followUpQuestions[0]).toBe("Want me to update your weekly cap too?");

    const json = JSON.stringify(pub);
    expect(json).not.toContain("used_context_summary");
    expect(json).not.toContain("preview_payload");
    expect(json).not.toContain("signal_value");
    expect(json).not.toContain("signal_metadata");
    expect(json).not.toContain("DO_NOT_LEAK");
  });

  test("toPublicAssistantConversationDetail includes counts + nested lists safely", () => {
    const pub = toPublicAssistantConversationDetail({
      ...rawConversation,
      contract_version: "assistant_v1",
      message_count: 2,
      active_memory_signal_count: 1,
      pending_action_count: 1,
      messages: [rawUserMessage, rawAssistantMessage],
      recent_action_runs: [rawActionRun],
      effective_memory_signals: [{ ...rawMemorySignal, status: "active" }],
    });
    expect(pub.messageCount).toBe(2);
    expect(pub.activeMemorySignalCount).toBe(1);
    expect(pub.pendingActionCount).toBe(1);
    expect(pub.messages).toHaveLength(2);
    expect(pub.recentActionRuns).toHaveLength(1);
    expect(pub.effectiveMemorySignals[0]?.statusLabel).toBe("Active");
  });
});
