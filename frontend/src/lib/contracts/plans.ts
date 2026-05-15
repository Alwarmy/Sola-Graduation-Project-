import { z } from "zod";

import {
  courseCardResponseSchema,
  toPublicCourseCard,
  type PublicCourseCard,
} from "@/lib/contracts/courses";

/**
 * Plans + Queue domain Zod schemas mirroring backend OpenAPI:
 *   - ScheduleQueueAddRequest / ScheduleQueueItemResponse
 *   - LearningPlanCreateRequest / LearningPlanResponse / LearningPlanCourseResponse
 *   - LearningPlanReadinessResponse
 *   - SchedulingPreferenceResponse / SchedulingPreferenceUpdateRequest
 *   - LearningPlanStatusUpdateRequest
 *
 * Concurrency fields preserved in the public view models:
 *   - `version` on every plan view model (needed by every version-controlled mutation).
 *   - `scheduleRevision` on plan + readiness (CP8 will consume it; CP7 only reads).
 *
 * CP8-tied readiness fields (schedule_total_items, completion_rate, in_progress_items_count,
 * recovery_pressure_ratio, etc.) are mapped into a separate `cp8Snapshot` group so CP7
 * code can ignore them while preserving them for CP8 if needed later.
 */

// ─── Queue ─────────────────────────────────────────────────────────────────

export const scheduleQueueAddRequestSchema = z.object({
  note: z.string().max(2000).nullish(),
});
export type ScheduleQueueAddRequest = z.infer<typeof scheduleQueueAddRequestSchema>;

export const scheduleQueueItemResponseSchema = z
  .object({
    id: z.number().int(),
    user_id: z.number().int(),
    course_id: z.number().int(),
    status: z.string(),
    note: z.string().nullish(),
    created_at: z.string(),
    updated_at: z.string(),
    course: courseCardResponseSchema,
  })
  .passthrough();
export type ScheduleQueueItemResponse = z.infer<typeof scheduleQueueItemResponseSchema>;

export type PublicQueueItem = {
  id: number;
  courseId: number;
  status: string;
  statusLabel: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  course: PublicCourseCard;
};

const QUEUE_STATUS_LABELS: Readonly<Record<string, string>> = {
  queued: "Queued",
  added: "Added to plan",
  pending: "Pending",
  scheduled: "Scheduled",
  removed: "Removed",
};

function labelize(value: string, map: Readonly<Record<string, string>>): string {
  const direct = map[value];
  if (direct) return direct;
  return value
    .replace(/[_\-]+/g, " ")
    .toLowerCase()
    .replace(/(^|\s)\w/g, (m) => m.toUpperCase());
}

export function toPublicQueueItem(q: ScheduleQueueItemResponse): PublicQueueItem {
  return {
    id: q.id,
    courseId: q.course_id,
    status: q.status,
    statusLabel: labelize(q.status, QUEUE_STATUS_LABELS),
    note: q.note ?? null,
    createdAt: q.created_at,
    updatedAt: q.updated_at,
    course: toPublicCourseCard(q.course),
  };
}

// ─── Plans (plan + plan course + preference) ────────────────────────────────

export const schedulingPreferenceResponseSchema = z
  .object({
    id: z.number().int(),
    plan_id: z.number().int(),
    plan_version: z.number().int().nullish(),
    preferred_time_window: z.string(),
    pace_mode: z.string(),
    preferred_study_days: z.array(z.string()),
    max_daily_minutes: z.number().int(),
    session_cap_minutes: z.number().int(),
    temporary_note: z.string().nullish(),
    deadline_date: z.string().nullish(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .passthrough();
export type SchedulingPreferenceResponse = z.infer<typeof schedulingPreferenceResponseSchema>;

export type PublicSchedulingPreference = {
  id: number;
  planId: number;
  planVersion: number | null;
  preferredTimeWindow: string;
  preferredTimeWindowLabel: string;
  paceMode: string;
  paceModeLabel: string;
  preferredStudyDays: string[];
  preferredStudyDayLabels: string[];
  maxDailyMinutes: number;
  sessionCapMinutes: number;
  temporaryNote: string | null;
  deadlineDate: string | null;
  createdAt: string;
  updatedAt: string;
};

const TIME_WINDOW_LABELS: Readonly<Record<string, string>> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
  flexible: "Flexible",
};
const PACE_MODE_LABELS: Readonly<Record<string, string>> = {
  relaxed: "Relaxed",
  standard: "Standard",
  intensive: "Intensive",
  exam_prep: "Exam prep",
};
const STUDY_DAY_LABELS: Readonly<Record<string, string>> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export function toPublicSchedulingPreference(
  p: SchedulingPreferenceResponse,
): PublicSchedulingPreference {
  return {
    id: p.id,
    planId: p.plan_id,
    planVersion: p.plan_version ?? null,
    preferredTimeWindow: p.preferred_time_window,
    preferredTimeWindowLabel: labelize(p.preferred_time_window, TIME_WINDOW_LABELS),
    paceMode: p.pace_mode,
    paceModeLabel: labelize(p.pace_mode, PACE_MODE_LABELS),
    preferredStudyDays: p.preferred_study_days,
    preferredStudyDayLabels: p.preferred_study_days.map((d) => labelize(d, STUDY_DAY_LABELS)),
    maxDailyMinutes: p.max_daily_minutes,
    sessionCapMinutes: p.session_cap_minutes,
    temporaryNote: p.temporary_note ?? null,
    deadlineDate: p.deadline_date ?? null,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

export const learningPlanCourseResponseSchema = z
  .object({
    id: z.number().int(),
    plan_id: z.number().int(),
    course_id: z.number().int(),
    priority: z.number().int().nullish(),
    order_index: z.number().int().nullish(),
    status: z.string(),
    rationale: z.string().nullish(),
    created_at: z.string(),
    updated_at: z.string(),
    course: courseCardResponseSchema,
  })
  .passthrough();
export type LearningPlanCourseResponse = z.infer<typeof learningPlanCourseResponseSchema>;

export type PublicPlanCourse = {
  id: number;
  planId: number;
  courseId: number;
  status: string;
  statusLabel: string;
  priority: number | null;
  orderIndex: number | null;
  rationale: string | null;
  createdAt: string;
  updatedAt: string;
  course: PublicCourseCard;
};

const PLAN_COURSE_STATUS_LABELS: Readonly<Record<string, string>> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  removed: "Removed",
  pending: "Pending",
  proposed: "Proposed",
};

export function toPublicPlanCourse(c: LearningPlanCourseResponse): PublicPlanCourse {
  return {
    id: c.id,
    planId: c.plan_id,
    courseId: c.course_id,
    status: c.status,
    statusLabel: labelize(c.status, PLAN_COURSE_STATUS_LABELS),
    priority: c.priority ?? null,
    orderIndex: c.order_index ?? null,
    rationale: c.rationale ?? null,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    course: toPublicCourseCard(c.course),
  };
}

export const learningPlanResponseSchema = z
  .object({
    id: z.number().int(),
    user_id: z.number().int(),
    title: z.string(),
    goal: z.string(),
    status: z.string(),
    version: z.number().int(),
    schedule_revision: z.number().int(),
    current_focus_snapshot: z.string().nullish(),
    weekly_hours_snapshot: z.number().int(),
    schedule_timezone_snapshot: z.string(),
    source_learning_state_snapshot: z.unknown().optional(),
    plan_summary: z.unknown().optional(),
    created_at: z.string(),
    updated_at: z.string(),
    preference: schedulingPreferenceResponseSchema.nullish(),
    courses: z.array(learningPlanCourseResponseSchema).optional(),
  })
  .passthrough();
export type LearningPlanResponse = z.infer<typeof learningPlanResponseSchema>;

export type PublicLearningPlan = {
  id: number;
  title: string;
  goal: string;
  status: string;
  statusLabel: string;
  /** Concurrency token — required for every version-controlled mutation. */
  version: number;
  scheduleRevision: number;
  currentFocusSnapshot: string | null;
  weeklyHoursSnapshot: number;
  scheduleTimezoneSnapshot: string;
  createdAt: string;
  updatedAt: string;
  preference: PublicSchedulingPreference | null;
  courses: PublicPlanCourse[];
};

const PLAN_STATUS_LABELS: Readonly<Record<string, string>> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
  cancelled: "Cancelled",
};

export const PLAN_STATUS_OPTIONS = [
  "active",
  "paused",
  "completed",
  "archived",
] as const;
export type PlanStatusOption = (typeof PLAN_STATUS_OPTIONS)[number];

export function planStatusLabel(status: string): string {
  return labelize(status, PLAN_STATUS_LABELS);
}

export function toPublicLearningPlan(p: LearningPlanResponse): PublicLearningPlan {
  return {
    id: p.id,
    title: p.title,
    goal: p.goal,
    status: p.status,
    statusLabel: planStatusLabel(p.status),
    version: p.version,
    scheduleRevision: p.schedule_revision,
    currentFocusSnapshot: p.current_focus_snapshot ?? null,
    weeklyHoursSnapshot: p.weekly_hours_snapshot,
    scheduleTimezoneSnapshot: p.schedule_timezone_snapshot,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    preference: p.preference ? toPublicSchedulingPreference(p.preference) : null,
    courses: (p.courses ?? []).map(toPublicPlanCourse),
  };
}

// ─── Create plan request ────────────────────────────────────────────────────

export const learningPlanCreateRequestSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  goal: z.string().min(1, "Goal is required").max(2000),
  queue_item_ids: z
    .array(z.number().int().positive())
    .min(1, "Pick at least one queued course")
    .max(3, "A plan can include up to 3 queued courses"),
  preferred_time_window: z.string().nullish(),
  pace_mode: z.string().nullish(),
  preferred_study_days: z.array(z.string()).optional(),
  max_daily_minutes: z.number().int().min(1).max(720).nullish(),
  session_cap_minutes: z.number().int().min(1).max(360).nullish(),
  temporary_note: z.string().max(1000).nullish(),
  deadline_date: z.string().nullish(),
});
export type LearningPlanCreateRequest = z.infer<typeof learningPlanCreateRequestSchema>;

// ─── Preferences update ────────────────────────────────────────────────────

export const schedulingPreferenceUpdateRequestSchema = z.object({
  expected_version: z.number().int().min(1),
  preferred_time_window: z.string().nullish(),
  pace_mode: z.string().nullish(),
  preferred_study_days: z.array(z.string()).optional(),
  max_daily_minutes: z.number().int().min(1).max(720).nullish(),
  session_cap_minutes: z.number().int().min(1).max(360).nullish(),
  temporary_note: z.string().max(1000).nullish(),
  deadline_date: z.string().nullish(),
});
export type SchedulingPreferenceUpdateRequest = z.infer<
  typeof schedulingPreferenceUpdateRequestSchema
>;

// ─── Status update ──────────────────────────────────────────────────────────

export const learningPlanStatusUpdateRequestSchema = z.object({
  status: z.string().min(1),
  expected_version: z.number().int().min(1),
});
export type LearningPlanStatusUpdateRequest = z.infer<
  typeof learningPlanStatusUpdateRequestSchema
>;

// ─── Readiness ──────────────────────────────────────────────────────────────

export const learningPlanReadinessResponseSchema = z
  .object({
    plan_id: z.number().int(),
    version: z.number().int(),
    status: z.string(),
    schedule_revision: z.number().int(),
    is_open_status: z.boolean(),
    is_active_status: z.boolean(),
    has_preference: z.boolean(),
    has_courses: z.boolean(),
    has_schedule_items: z.boolean(),
    active_course_count: z.number().int(),
    max_active_courses: z.number().int(),
    queued_backlog_count: z.number().int(),
    base_blockers: z.array(z.string()).nullish(),
    generation_blockers: z.array(z.string()).nullish(),
    execution_blockers: z.array(z.string()).nullish(),
    is_ready_for_schedule_generation: z.boolean(),
    is_ready_for_force_regeneration: z.boolean(),
    is_ready_for_execution: z.boolean(),
    recommended_action: z.string().nullish(),
    recommended_recovery_mode: z.string().nullish(),
  })
  .passthrough();
export type LearningPlanReadinessResponse = z.infer<typeof learningPlanReadinessResponseSchema>;

const READINESS_ACTION_LABELS: Readonly<Record<string, string>> = {
  generate_schedule: "Generate your schedule",
  add_courses: "Add courses",
  set_preferences: "Set your preferences",
  start_execution: "Start studying",
  pause_plan: "Pause plan",
  recover_plan: "Recover plan",
  complete_plan: "Mark plan complete",
  none: "Nothing to do right now",
};

const READINESS_BLOCKER_LABELS: Readonly<Record<string, string>> = {
  no_courses: "Add at least one course to this plan.",
  no_preference: "Set your study preferences.",
  status_not_open: "This plan is no longer open.",
  status_not_active: "This plan is not active.",
  not_enough_active_courses: "Pick the courses you want to study.",
  max_active_courses_reached: "You have reached the maximum active courses.",
};

const RECOVERY_MODE_LABELS: Readonly<Record<string, string>> = {
  rebalance: "Rebalance the schedule",
  recover_overdue_first: "Tackle overdue items first",
  lighten_load: "Lighten the load",
};

export type PublicPlanReadiness = {
  planId: number;
  version: number;
  scheduleRevision: number;
  status: string;
  statusLabel: string;
  isOpenStatus: boolean;
  isActiveStatus: boolean;
  hasPreference: boolean;
  hasCourses: boolean;
  hasScheduleItems: boolean;
  activeCourseCount: number;
  maxActiveCourses: number;
  queuedBacklogCount: number;
  baseBlockers: { code: string; label: string }[];
  /** CP8: blockers preventing schedule generation. */
  generationBlockers: { code: string; label: string }[];
  /** CP8: blockers preventing execution (start/complete/skip). */
  executionBlockers: { code: string; label: string }[];
  /** CP7 surface — was the plan readied for schedule generation? Read-only signal. */
  isReadyForScheduleGeneration: boolean;
  /** CP8: ready to force-regenerate (rebuild) the schedule? */
  isReadyForForceRegeneration: boolean;
  /** CP8: ready for execution actions? */
  isReadyForExecution: boolean;
  /** CP7 surface — recommended next action label, safe. CP8 will act on it. */
  recommendedActionLabel: string | null;
  /** CP8: recommended recovery mode (safe label). */
  recommendedRecoveryModeLabel: string | null;
};

export function toPublicPlanReadiness(r: LearningPlanReadinessResponse): PublicPlanReadiness {
  return {
    planId: r.plan_id,
    version: r.version,
    scheduleRevision: r.schedule_revision,
    status: r.status,
    statusLabel: planStatusLabel(r.status),
    isOpenStatus: r.is_open_status,
    isActiveStatus: r.is_active_status,
    hasPreference: r.has_preference,
    hasCourses: r.has_courses,
    hasScheduleItems: r.has_schedule_items,
    activeCourseCount: r.active_course_count,
    maxActiveCourses: r.max_active_courses,
    queuedBacklogCount: r.queued_backlog_count,
    baseBlockers: (r.base_blockers ?? []).map((code) => ({
      code,
      label: READINESS_BLOCKER_LABELS[code] ?? labelize(code, {}),
    })),
    generationBlockers: (r.generation_blockers ?? []).map((code) => ({
      code,
      label: READINESS_BLOCKER_LABELS[code] ?? labelize(code, {}),
    })),
    executionBlockers: (r.execution_blockers ?? []).map((code) => ({
      code,
      label: READINESS_BLOCKER_LABELS[code] ?? labelize(code, {}),
    })),
    isReadyForScheduleGeneration: r.is_ready_for_schedule_generation,
    isReadyForForceRegeneration: r.is_ready_for_force_regeneration,
    isReadyForExecution: r.is_ready_for_execution,
    recommendedActionLabel: r.recommended_action
      ? (READINESS_ACTION_LABELS[r.recommended_action] ?? labelize(r.recommended_action, {}))
      : null,
    recommendedRecoveryModeLabel: r.recommended_recovery_mode
      ? (RECOVERY_MODE_LABELS[r.recommended_recovery_mode] ??
        labelize(r.recommended_recovery_mode, {}))
      : null,
  };
}
