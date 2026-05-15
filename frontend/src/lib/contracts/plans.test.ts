import { describe, expect, test } from "vitest";

import {
  toPublicQueueItem,
  toPublicLearningPlan,
  toPublicPlanReadiness,
  toPublicSchedulingPreference,
  planStatusLabel,
  PLAN_STATUS_OPTIONS,
} from "@/lib/contracts/plans";

const rawCourse = {
  id: 5,
  source: "youtube",
  external_id: "ext",
  content_type: "video",
  content_format_label: "Video course",
  title: "Sample",
  provider: "youtube",
  provider_display_name: "YouTube",
  difficulty_label: "Beginner",
  duration_label: "30 min",
  pricing_label: "Free",
  topic_tag_labels: ["python"],
  card_summary: "Video course • Beginner",
  badges: [],
};

const rawQueueItem = {
  id: 11,
  user_id: 266,
  course_id: 5,
  status: "queued",
  note: null,
  created_at: "2026-05-13T08:00:00Z",
  updated_at: "2026-05-13T08:00:00Z",
  course: rawCourse,
};

const rawPlan = {
  id: 9,
  user_id: 266,
  title: "Master Python",
  goal: "Land a Python job",
  status: "active",
  version: 7,
  schedule_revision: 0,
  current_focus_snapshot: "python",
  weekly_hours_snapshot: 10,
  schedule_timezone_snapshot: "Asia/Riyadh",
  source_learning_state_snapshot: {},
  plan_summary: {},
  created_at: "2026-05-13T08:00:00Z",
  updated_at: "2026-05-13T08:10:00Z",
  preference: null,
  courses: [],
};

const rawReadiness = {
  plan_id: 9,
  version: 7,
  status: "active",
  schedule_revision: 0,
  is_open_status: true,
  is_active_status: true,
  has_preference: false,
  has_courses: true,
  has_schedule_items: false,
  active_course_count: 1,
  max_active_courses: 3,
  queued_backlog_count: 0,
  base_blockers: ["no_preference"],
  generation_blockers: [],
  execution_blockers: [],
  is_ready_for_schedule_generation: false,
  is_ready_for_force_regeneration: false,
  is_ready_for_execution: false,
  recommended_action: "set_preferences",
  recommended_recovery_mode: null,
};

const rawPref = {
  id: 1,
  plan_id: 9,
  plan_version: 7,
  preferred_time_window: "evening",
  pace_mode: "standard",
  preferred_study_days: ["monday", "wednesday"],
  max_daily_minutes: 60,
  session_cap_minutes: 45,
  temporary_note: null,
  deadline_date: null,
  created_at: "2026-05-13T08:00:00Z",
  updated_at: "2026-05-13T08:00:00Z",
};

describe("plans contracts", () => {
  test("toPublicQueueItem maps backend snake_case and labels status", () => {
    const pub = toPublicQueueItem(rawQueueItem);
    expect(pub.id).toBe(11);
    expect(pub.courseId).toBe(5);
    expect(pub.status).toBe("queued");
    expect(pub.statusLabel).toBe("Queued");
    expect(pub.course.title).toBe("Sample");
    // No raw user_id leak into the public view model.
    expect(JSON.stringify(pub)).not.toContain("user_id");
  });

  test("toPublicLearningPlan preserves version + schedule_revision", () => {
    const pub = toPublicLearningPlan(rawPlan);
    expect(pub.id).toBe(9);
    expect(pub.title).toBe("Master Python");
    expect(pub.status).toBe("active");
    expect(pub.statusLabel).toBe("Active");
    expect(pub.version).toBe(7);
    expect(pub.scheduleRevision).toBe(0);
    expect(pub.weeklyHoursSnapshot).toBe(10);
    expect(pub.courses).toEqual([]);
    expect(pub.preference).toBeNull();
  });

  test("toPublicPlanReadiness maps blockers + recommended action to safe labels", () => {
    const pub = toPublicPlanReadiness(rawReadiness);
    expect(pub.hasCourses).toBe(true);
    expect(pub.hasPreference).toBe(false);
    expect(pub.baseBlockers).toHaveLength(1);
    expect(pub.baseBlockers[0]?.code).toBe("no_preference");
    expect(pub.baseBlockers[0]?.label).toContain("preferences");
    expect(pub.recommendedActionLabel).toBe("Set your preferences");
    expect(pub.statusLabel).toBe("Active");
    // CP8 fields not exposed:
    expect(JSON.stringify(pub)).not.toContain("schedule_total_items");
    expect(JSON.stringify(pub)).not.toContain("completion_rate");
    expect(JSON.stringify(pub)).not.toContain("execution_blockers");
  });

  test("toPublicSchedulingPreference returns camelCase + labels", () => {
    const pub = toPublicSchedulingPreference(rawPref);
    expect(pub.preferredTimeWindow).toBe("evening");
    expect(pub.preferredTimeWindowLabel).toBe("Evening");
    expect(pub.paceModeLabel).toBe("Standard");
    expect(pub.preferredStudyDayLabels).toEqual(["Monday", "Wednesday"]);
  });

  test("planStatusLabel humanizes unknown statuses safely", () => {
    expect(planStatusLabel("paused")).toBe("Paused");
    expect(planStatusLabel("some_new_status")).toBe("Some New Status");
    // No null/undefined leakage.
    expect(planStatusLabel("")).not.toContain("undefined");
  });

  test("PLAN_STATUS_OPTIONS is a closed allow-list", () => {
    expect(PLAN_STATUS_OPTIONS).toContain("active");
    expect(PLAN_STATUS_OPTIONS).toContain("paused");
    expect(PLAN_STATUS_OPTIONS).toContain("completed");
    expect(PLAN_STATUS_OPTIONS).toContain("archived");
  });
});
