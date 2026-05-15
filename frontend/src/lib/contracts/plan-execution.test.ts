import { describe, expect, test } from "vitest";

import {
  PLAN_ITEM_STATUS_VALUES,
  planItemStatusLabel,
  driftLevelLabel,
  recoveryModeLabel,
  recoveryActionLabel,
  timeWindowLabel,
  toPublicPlanItem,
  toPublicScheduleGenerationResult,
  toPublicExecutionSummary,
  toPublicPlanItemActionResult,
  toPublicRecoveryPreview,
  toPublicRecoveryResult,
} from "@/lib/contracts/plan-execution";

const rawItem = {
  id: 301,
  plan_id: 199,
  plan_course_id: 315,
  course_id: 2,
  course_unit_id: 41,
  title: "Lesson 1 — Variables",
  item_type: "video_segment",
  status: "pending",
  version: 1,
  schedule_order_index: 0,
  source_order_index: 0,
  scheduled_date: "2026-05-14",
  time_window: "evening",
  planned_minutes: 30,
  actual_started_at: null,
  actual_completed_at: null,
  actual_minutes: null,
  skipped_at: null,
  skip_reason: null,
  segment_index: 0,
  segment_start_second: 0,
  segment_end_second: 1800,
  practical_signal: "balanced",
  load_signal: "moderate",
  schedule_timezone_snapshot: "Asia/Riyadh",
  is_due_today: false,
  is_overdue: false,
  is_actionable: true,
  item_metadata: { internal_debug: "DO_NOT_LEAK_to_browser" },
  created_at: "2026-05-13T08:00:00Z",
  updated_at: "2026-05-13T08:00:00Z",
  course: {
    id: 2,
    title: "Python Tutorial 2026",
    provider: "youtube",
    provider_display_name: "YouTube",
    language: "en",
    url: "https://www.youtube.com/playlist?list=abc",
    provider_metadata: { api_key: "DO_NOT_LEAK_provider_api_key" },
  },
  course_unit: {
    id: 41,
    title: "Variables",
    estimated_minutes: 30,
    source_order_index: 0,
  },
};

const rawSummary = {
  plan_id: 199,
  plan_status: "active",
  schedule_timezone_snapshot: "Asia/Riyadh",
  total_items: 12,
  pending_items_count: 8,
  in_progress_items_count: 1,
  completed_items_count: 3,
  skipped_items_count: 0,
  overdue_items_count: 1,
  due_today_items_count: 2,
  completion_rate: 0.25,
  is_plan_finished: false,
  can_mark_completed: false,
  next_actionable_item_id: 302,
  next_actionable_scheduled_date: "2026-05-14",
  next_actionable_title: "Lesson 2",
};

const rawPreview = {
  plan_id: 199,
  plan_version: 5,
  plan_status: "active",
  schedule_timezone_snapshot: "Asia/Riyadh",
  schedule_revision: 2,
  missed_study_slots_count: 1,
  overdue_items_count: 1,
  overdue_minutes: 30,
  due_today_items_count: 2,
  remaining_pending_items_count: 8,
  remaining_pending_minutes: 240,
  in_progress_items_count: 1,
  available_capacity_next_7_study_slots_minutes: 420,
  recovery_pressure_ratio: 0.57,
  drift_level: "moderate_drift",
  needs_recovery: true,
  current_schedule_still_viable: false,
  can_recover_without_rebuild: true,
  should_offer_rebuild: false,
  recommended_action: "stay_on_track",
  recommended_recovery_mode: "rebalance",
  available_actions: ["stay_on_track", "rebuild"],
  available_recovery_modes: ["rebalance", "recover_overdue_first", "lighten_load"],
};

describe("plan-execution contracts (B1.CP8)", () => {
  test("PLAN_ITEM_STATUS_VALUES + planItemStatusLabel — safe labels for the four backend statuses", () => {
    expect(PLAN_ITEM_STATUS_VALUES).toEqual(["pending", "in_progress", "completed", "skipped"]);
    expect(planItemStatusLabel("pending")).toBe("Pending");
    expect(planItemStatusLabel("in_progress")).toBe("In progress");
    expect(planItemStatusLabel("completed")).toBe("Completed");
    expect(planItemStatusLabel("skipped")).toBe("Skipped");
    // Unknown status humanizes safely, never leaks raw.
    expect(planItemStatusLabel("some_future_status")).toBe("Some Future Status");
  });

  test("timeWindowLabel / driftLevelLabel / recoveryModeLabel / recoveryActionLabel are user-safe", () => {
    expect(timeWindowLabel("evening")).toBe("Evening");
    expect(driftLevelLabel("on_track")).toBe("On track");
    expect(driftLevelLabel("severe_drift")).toBe("Significantly behind");
    expect(recoveryModeLabel("rebalance")).toBe("Rebalance the schedule");
    expect(recoveryModeLabel("lighten_load")).toBe("Lighten the load");
    expect(recoveryActionLabel("stay_on_track")).toBe("Stay on track");
    expect(recoveryActionLabel("rebuild")).toBe("Rebuild the schedule");
  });

  test("toPublicPlanItem strips item_metadata and admin course fields", () => {
    const pub = toPublicPlanItem(rawItem);
    expect(pub.id).toBe(301);
    expect(pub.planId).toBe(199);
    expect(pub.version).toBe(1);
    expect(pub.title).toBe("Lesson 1 — Variables");
    expect(pub.statusLabel).toBe("Pending");
    expect(pub.timeWindowLabel).toBe("Evening");
    expect(pub.plannedMinutes).toBe(30);
    expect(pub.isActionable).toBe(true);
    expect(pub.course.id).toBe(2);
    expect(pub.course.providerDisplayName).toBe("YouTube");
    expect(pub.courseUnit.estimatedMinutes).toBe(30);

    const json = JSON.stringify(pub);
    // No raw internal fields, no `item_metadata`, no api_key leak.
    expect(json).not.toContain("item_metadata");
    expect(json).not.toContain("provider_metadata");
    expect(json).not.toContain("api_key");
    expect(json).not.toContain("DO_NOT_LEAK");
    expect(json).not.toContain("practical_signal");
    expect(json).not.toContain("load_signal");
    expect(json).not.toContain("plan_course_id");
  });

  test("toPublicScheduleGenerationResult preserves plan_version + schedule_revision and maps items", () => {
    const pub = toPublicScheduleGenerationResult({
      plan_id: 199,
      plan_version: 6,
      schedule_revision: 2,
      total_items: 1,
      total_minutes: 30,
      scheduled_start_date: "2026-05-14",
      scheduled_end_date: "2026-05-20",
      items: [rawItem],
    });
    expect(pub.planVersion).toBe(6);
    expect(pub.scheduleRevision).toBe(2);
    expect(pub.totalItems).toBe(1);
    expect(pub.items[0]?.id).toBe(301);
    expect(pub.scheduledStartDate).toBe("2026-05-14");
  });

  test("toPublicExecutionSummary formats completion_rate as a safe percent string", () => {
    const pub = toPublicExecutionSummary(rawSummary);
    expect(pub.totalItems).toBe(12);
    expect(pub.completedItemsCount).toBe(3);
    expect(pub.completionRate).toBeCloseTo(0.25);
    expect(pub.completionRateLabel).toBe("25%");
    expect(pub.planStatusLabel).toBe("Active");

    // Edge cases: NaN / out-of-range / 100% / fractional
    expect(toPublicExecutionSummary({ ...rawSummary, completion_rate: Number.NaN }).completionRateLabel).toBe("0%");
    expect(toPublicExecutionSummary({ ...rawSummary, completion_rate: 1.5 }).completionRateLabel).toBe("100%");
    expect(toPublicExecutionSummary({ ...rawSummary, completion_rate: 0.123 }).completionRateLabel).toBe("12.3%");
  });

  test("toPublicPlanItemActionResult returns { item, executionSummary } camelCase", () => {
    const pub = toPublicPlanItemActionResult({ item: rawItem, execution_summary: rawSummary });
    expect(pub.item.id).toBe(301);
    expect(pub.executionSummary.totalItems).toBe(12);
    expect(JSON.stringify(pub)).not.toContain("execution_summary");
  });

  test("toPublicRecoveryPreview maps drift level + recovery pressure + recommended labels", () => {
    const pub = toPublicRecoveryPreview(rawPreview);
    expect(pub.driftLevelLabel).toBe("Behind schedule");
    expect(pub.recoveryPressureLabel).toBe("57%");
    expect(pub.recommendedActionLabel).toBe("Stay on track");
    expect(pub.recommendedRecoveryModeLabel).toBe("Rebalance the schedule");
    expect(pub.availableRecoveryModeLabels).toEqual([
      "Rebalance the schedule",
      "Tackle overdue items first",
      "Lighten the load",
    ]);
    expect(pub.needsRecovery).toBe(true);
    // Backend keys not leaked.
    const json = JSON.stringify(pub);
    expect(json).not.toContain("recovery_pressure_ratio");
    expect(json).not.toContain("missed_study_slots_count");
    expect(json).not.toContain("available_recovery_modes");
  });

  test("toPublicRecoveryResult maps mode + preserved counts safely", () => {
    const pub = toPublicRecoveryResult({
      plan_id: 199,
      plan_version: 6,
      schedule_revision: 3,
      recovery_mode: "rebalance",
      recovery_note: "moved evening session to Friday",
      rebuilt_pending_items_count: 4,
      preserved_completed_items_count: 3,
      preserved_skipped_items_count: 0,
      preserved_in_progress_items_count: 1,
      new_scheduled_start_date: "2026-05-15",
      new_scheduled_end_date: "2026-05-22",
      recovery_preview_before: rawPreview,
      execution_summary_after: rawSummary,
    });
    expect(pub.recoveryMode).toBe("rebalance");
    expect(pub.recoveryModeLabel).toBe("Rebalance the schedule");
    expect(pub.rebuiltPendingItemsCount).toBe(4);
    expect(pub.scheduleRevision).toBe(3);
    // No raw nested admin shape in the public result.
    expect(JSON.stringify(pub)).not.toContain("recovery_preview_before");
    expect(JSON.stringify(pub)).not.toContain("execution_summary_after");
  });
});
