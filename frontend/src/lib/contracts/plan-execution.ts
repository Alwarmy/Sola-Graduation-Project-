import { z } from "zod";

/**
 * B1.CP8 — Schedule, Execution, and Recovery contracts.
 *
 * Mirrors the backend Pydantic schemas in
 *   - `app/schemas/learning_plan_item.py`
 *     (LearningPlanItemResponse, LearningPlanItemCompleteRequest,
 *      LearningPlanItemSkipRequest, PlanExecutionSummaryResponse,
 *      LearningPlanItemActionResultResponse, PlanScheduleGenerateRequest,
 *      PlanScheduleGenerateResponse)
 *   - `app/schemas/plan_recovery.py`
 *     (PlanRecoveryPreviewResponse, PlanRecoveryApplyRequest,
 *      PlanRecoveryApplyResponse)
 *
 * Concurrency surfaces (see the CP8 Revision/Conflict Contract Table in
 * the execution log):
 *   - schedule/generate: `expected_version` BODY + optional
 *     `expected_schedule_revision` BODY.
 *   - items/{id}/start:   `X-Expected-Version` HEADER.
 *   - items/{id}/complete: `expected_version` BODY.
 *   - items/{id}/skip:    `expected_version` BODY.
 *   - recover:            `expected_version` BODY + REQUIRED
 *     `expected_schedule_revision` BODY.
 *
 * Public view models are camelCase, raw-internal-stripped, and contain
 * only fields the learner UI should see. Raw `item_metadata`, full
 * `course` admin shape, `practical_signal`, `load_signal`, and similar
 * internal columns are NOT promoted to the public surface.
 */

// ─── Item status enum + safe labels ───────────────────────────────────────

export const PLAN_ITEM_STATUS_VALUES = [
  "pending",
  "in_progress",
  "completed",
  "skipped",
] as const;
export type PlanItemStatus = (typeof PLAN_ITEM_STATUS_VALUES)[number];

const PLAN_ITEM_STATUS_LABELS: Readonly<Record<string, string>> = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
  skipped: "Skipped",
};

function safeLabel(value: string, map: Readonly<Record<string, string>>): string {
  const direct = map[value];
  if (direct) return direct;
  return value
    .replace(/[_\-]+/g, " ")
    .toLowerCase()
    .replace(/(^|\s)\w/g, (m) => m.toUpperCase());
}

export function planItemStatusLabel(status: string): string {
  return safeLabel(status, PLAN_ITEM_STATUS_LABELS);
}

// ─── Time-window + drift + recovery-mode enums + safe labels ─────────────

const TIME_WINDOW_LABELS: Readonly<Record<string, string>> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
  flexible: "Flexible",
};
export function timeWindowLabel(value: string): string {
  return safeLabel(value, TIME_WINDOW_LABELS);
}

const DRIFT_LEVEL_LABELS: Readonly<Record<string, string>> = {
  on_track: "On track",
  minor_drift: "Slightly behind",
  moderate_drift: "Behind schedule",
  severe_drift: "Significantly behind",
};
export function driftLevelLabel(value: string): string {
  return safeLabel(value, DRIFT_LEVEL_LABELS);
}

const RECOVERY_MODE_LABELS: Readonly<Record<string, string>> = {
  rebalance: "Rebalance the schedule",
  recover_overdue_first: "Tackle overdue items first",
  lighten_load: "Lighten the load",
};
export function recoveryModeLabel(value: string): string {
  return safeLabel(value, RECOVERY_MODE_LABELS);
}

const RECOVERY_ACTION_LABELS: Readonly<Record<string, string>> = {
  stay_on_track: "Stay on track",
  rebuild: "Rebuild the schedule",
};
export function recoveryActionLabel(value: string): string {
  return safeLabel(value, RECOVERY_ACTION_LABELS);
}

// ─── LearningPlanItemResponse (backend) → PublicPlanItem ──────────────────

/**
 * The backend nests `course: CourseResponse` and `course_unit:
 * CourseUnitResponse` on every plan item. CourseResponse is the
 * richer admin/internal shape (not the curated CourseCardResponse).
 * We accept it as `.passthrough()` and pluck ONLY the safe fields we
 * surface to the UI.
 */
const planItemCourseSchema = z
  .object({
    id: z.number().int(),
    title: z.string(),
    provider: z.string().nullish(),
    provider_display_name: z.string().nullish(),
    language: z.string().nullish(),
    url: z.string().nullish(),
  })
  .passthrough();

const planItemCourseUnitSchema = z
  .object({
    id: z.number().int(),
    title: z.string(),
    estimated_minutes: z.number().int().nullish(),
    source_order_index: z.number().int().nullish(),
  })
  .passthrough();

export const learningPlanItemResponseSchema = z
  .object({
    id: z.number().int(),
    plan_id: z.number().int(),
    plan_course_id: z.number().int(),
    course_id: z.number().int(),
    course_unit_id: z.number().int(),
    title: z.string(),
    item_type: z.string(),
    status: z.string(),
    version: z.number().int(),
    schedule_order_index: z.number().int(),
    source_order_index: z.number().int(),
    scheduled_date: z.string(),
    time_window: z.string(),
    planned_minutes: z.number().int(),
    actual_started_at: z.string().nullish(),
    actual_completed_at: z.string().nullish(),
    actual_minutes: z.number().int().nullish(),
    skipped_at: z.string().nullish(),
    skip_reason: z.string().nullish(),
    segment_index: z.number().int().nullish(),
    segment_start_second: z.number().int().nullish(),
    segment_end_second: z.number().int().nullish(),
    practical_signal: z.string().nullish(),
    load_signal: z.string().nullish(),
    schedule_timezone_snapshot: z.string(),
    is_due_today: z.boolean(),
    is_overdue: z.boolean(),
    is_actionable: z.boolean(),
    item_metadata: z.unknown().optional(),
    created_at: z.string(),
    updated_at: z.string(),
    course: planItemCourseSchema,
    course_unit: planItemCourseUnitSchema,
  })
  .passthrough();
export type LearningPlanItemResponse = z.infer<typeof learningPlanItemResponseSchema>;

export type PublicPlanItem = {
  id: number;
  planId: number;
  courseId: number;
  /** Item-level optimistic concurrency token; sent on start/complete/skip. */
  version: number;
  title: string;
  itemType: string;
  itemTypeLabel: string;
  status: string;
  statusLabel: string;
  scheduledDate: string;
  timeWindow: string;
  timeWindowLabel: string;
  plannedMinutes: number;
  actualMinutes: number | null;
  actualStartedAt: string | null;
  actualCompletedAt: string | null;
  skippedAt: string | null;
  skipReason: string | null;
  isDueToday: boolean;
  isOverdue: boolean;
  isActionable: boolean;
  scheduleOrderIndex: number;
  course: {
    id: number;
    title: string;
    providerDisplayName: string | null;
    language: string | null;
    url: string | null;
  };
  courseUnit: {
    id: number;
    title: string;
    estimatedMinutes: number | null;
  };
};

export function toPublicPlanItem(i: LearningPlanItemResponse): PublicPlanItem {
  return {
    id: i.id,
    planId: i.plan_id,
    courseId: i.course_id,
    version: i.version,
    title: i.title,
    itemType: i.item_type,
    itemTypeLabel: safeLabel(i.item_type, {}),
    status: i.status,
    statusLabel: planItemStatusLabel(i.status),
    scheduledDate: i.scheduled_date,
    timeWindow: i.time_window,
    timeWindowLabel: timeWindowLabel(i.time_window),
    plannedMinutes: i.planned_minutes,
    actualMinutes: i.actual_minutes ?? null,
    actualStartedAt: i.actual_started_at ?? null,
    actualCompletedAt: i.actual_completed_at ?? null,
    skippedAt: i.skipped_at ?? null,
    skipReason: i.skip_reason ?? null,
    isDueToday: i.is_due_today,
    isOverdue: i.is_overdue,
    isActionable: i.is_actionable,
    scheduleOrderIndex: i.schedule_order_index,
    course: {
      id: i.course.id,
      title: i.course.title,
      providerDisplayName:
        (typeof i.course.provider_display_name === "string"
          ? i.course.provider_display_name
          : null) ??
        (typeof i.course.provider === "string" ? i.course.provider : null),
      language: i.course.language ?? null,
      url: i.course.url ?? null,
    },
    courseUnit: {
      id: i.course_unit.id,
      title: i.course_unit.title,
      estimatedMinutes: i.course_unit.estimated_minutes ?? null,
    },
  };
}

// ─── Schedule generation ──────────────────────────────────────────────────

export const planScheduleGenerateRequestSchema = z.object({
  force_rebuild: z.boolean().default(false),
  expected_version: z.number().int().min(1),
  expected_schedule_revision: z.number().int().min(1).nullish(),
});
export type PlanScheduleGenerateRequest = z.infer<typeof planScheduleGenerateRequestSchema>;

export const planScheduleGenerateResponseSchema = z
  .object({
    plan_id: z.number().int(),
    plan_version: z.number().int(),
    schedule_revision: z.number().int(),
    total_items: z.number().int(),
    total_minutes: z.number().int(),
    scheduled_start_date: z.string().nullish(),
    scheduled_end_date: z.string().nullish(),
    items: z.array(learningPlanItemResponseSchema),
  })
  .passthrough();
export type PlanScheduleGenerateResponse = z.infer<typeof planScheduleGenerateResponseSchema>;

export type PublicScheduleGenerationResult = {
  planId: number;
  planVersion: number;
  scheduleRevision: number;
  totalItems: number;
  totalMinutes: number;
  scheduledStartDate: string | null;
  scheduledEndDate: string | null;
  items: PublicPlanItem[];
};

export function toPublicScheduleGenerationResult(
  r: PlanScheduleGenerateResponse,
): PublicScheduleGenerationResult {
  return {
    planId: r.plan_id,
    planVersion: r.plan_version,
    scheduleRevision: r.schedule_revision,
    totalItems: r.total_items,
    totalMinutes: r.total_minutes,
    scheduledStartDate: r.scheduled_start_date ?? null,
    scheduledEndDate: r.scheduled_end_date ?? null,
    items: r.items.map(toPublicPlanItem),
  };
}

// ─── Item action requests ────────────────────────────────────────────────

export const learningPlanItemCompleteRequestSchema = z.object({
  actual_minutes: z.number().int().min(1).max(720).nullish(),
  expected_version: z.number().int().min(1),
});
export type LearningPlanItemCompleteRequest = z.infer<
  typeof learningPlanItemCompleteRequestSchema
>;

export const learningPlanItemSkipRequestSchema = z.object({
  skip_reason: z.string().min(1).max(300).nullish(),
  expected_version: z.number().int().min(1),
});
export type LearningPlanItemSkipRequest = z.infer<typeof learningPlanItemSkipRequestSchema>;

// ─── Execution summary ────────────────────────────────────────────────────

export const planExecutionSummaryResponseSchema = z
  .object({
    plan_id: z.number().int(),
    plan_status: z.string(),
    schedule_timezone_snapshot: z.string(),
    total_items: z.number().int(),
    pending_items_count: z.number().int(),
    in_progress_items_count: z.number().int(),
    completed_items_count: z.number().int(),
    skipped_items_count: z.number().int(),
    overdue_items_count: z.number().int(),
    due_today_items_count: z.number().int(),
    completion_rate: z.number(),
    is_plan_finished: z.boolean(),
    can_mark_completed: z.boolean(),
    next_actionable_item_id: z.number().int().nullish(),
    next_actionable_scheduled_date: z.string().nullish(),
    next_actionable_title: z.string().nullish(),
  })
  .passthrough();
export type PlanExecutionSummaryResponse = z.infer<typeof planExecutionSummaryResponseSchema>;

export type PublicExecutionSummary = {
  planId: number;
  planStatus: string;
  planStatusLabel: string;
  totalItems: number;
  pendingItemsCount: number;
  inProgressItemsCount: number;
  completedItemsCount: number;
  skippedItemsCount: number;
  overdueItemsCount: number;
  dueTodayItemsCount: number;
  /** Backend value is a fraction in [0, 1]. Frontend keeps the raw number AND
   *  the rendered percent string (one decimal) for safe display. */
  completionRate: number;
  completionRateLabel: string;
  isPlanFinished: boolean;
  canMarkCompleted: boolean;
  nextActionableItemId: number | null;
  nextActionableScheduledDate: string | null;
  nextActionableTitle: string | null;
};

const PLAN_STATUS_LABELS: Readonly<Record<string, string>> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
  cancelled: "Cancelled",
};

export function toPublicExecutionSummary(
  s: PlanExecutionSummaryResponse,
): PublicExecutionSummary {
  const pct = clampPercent(s.completion_rate);
  return {
    planId: s.plan_id,
    planStatus: s.plan_status,
    planStatusLabel: safeLabel(s.plan_status, PLAN_STATUS_LABELS),
    totalItems: s.total_items,
    pendingItemsCount: s.pending_items_count,
    inProgressItemsCount: s.in_progress_items_count,
    completedItemsCount: s.completed_items_count,
    skippedItemsCount: s.skipped_items_count,
    overdueItemsCount: s.overdue_items_count,
    dueTodayItemsCount: s.due_today_items_count,
    completionRate: pct.fraction,
    completionRateLabel: pct.label,
    isPlanFinished: s.is_plan_finished,
    canMarkCompleted: s.can_mark_completed,
    nextActionableItemId: s.next_actionable_item_id ?? null,
    nextActionableScheduledDate: s.next_actionable_scheduled_date ?? null,
    nextActionableTitle: s.next_actionable_title ?? null,
  };
}

function clampPercent(raw: unknown): { fraction: number; label: string } {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return { fraction: 0, label: "0%" };
  }
  const fraction = Math.max(0, Math.min(1, raw));
  // Round to 0.1% to dodge FP epsilon (0.57 * 100 = 57.00000000000001).
  const rounded = Math.round(fraction * 1000) / 10;
  const label = `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
  return { fraction, label };
}

// ─── Item action result (start / complete / skip) ─────────────────────────

export const learningPlanItemActionResultResponseSchema = z
  .object({
    item: learningPlanItemResponseSchema,
    execution_summary: planExecutionSummaryResponseSchema,
  })
  .passthrough();
export type LearningPlanItemActionResultResponse = z.infer<
  typeof learningPlanItemActionResultResponseSchema
>;

export type PublicPlanItemActionResult = {
  item: PublicPlanItem;
  executionSummary: PublicExecutionSummary;
};

export function toPublicPlanItemActionResult(
  r: LearningPlanItemActionResultResponse,
): PublicPlanItemActionResult {
  return {
    item: toPublicPlanItem(r.item),
    executionSummary: toPublicExecutionSummary(r.execution_summary),
  };
}

// ─── Recovery preview ────────────────────────────────────────────────────

export const planRecoveryPreviewResponseSchema = z
  .object({
    plan_id: z.number().int(),
    plan_version: z.number().int(),
    plan_status: z.string(),
    schedule_timezone_snapshot: z.string(),
    schedule_revision: z.number().int(),
    missed_study_slots_count: z.number().int(),
    overdue_items_count: z.number().int(),
    overdue_minutes: z.number().int(),
    due_today_items_count: z.number().int(),
    remaining_pending_items_count: z.number().int(),
    remaining_pending_minutes: z.number().int(),
    in_progress_items_count: z.number().int(),
    available_capacity_next_7_study_slots_minutes: z.number().int(),
    recovery_pressure_ratio: z.number(),
    drift_level: z.string(),
    needs_recovery: z.boolean(),
    current_schedule_still_viable: z.boolean(),
    can_recover_without_rebuild: z.boolean(),
    should_offer_rebuild: z.boolean(),
    recommended_action: z.string(),
    recommended_recovery_mode: z.string().nullish(),
    available_actions: z.array(z.string()).optional(),
    available_recovery_modes: z.array(z.string()).optional(),
  })
  .passthrough();
export type PlanRecoveryPreviewResponse = z.infer<typeof planRecoveryPreviewResponseSchema>;

export type PublicRecoveryPreview = {
  planId: number;
  planVersion: number;
  scheduleRevision: number;
  planStatus: string;
  planStatusLabel: string;
  missedStudySlotsCount: number;
  overdueItemsCount: number;
  overdueMinutes: number;
  dueTodayItemsCount: number;
  remainingPendingItemsCount: number;
  remainingPendingMinutes: number;
  inProgressItemsCount: number;
  availableCapacityNext7StudySlotsMinutes: number;
  /** Backend value is a fraction (can exceed 1.0 when severely overloaded). */
  recoveryPressureRatio: number;
  recoveryPressureLabel: string;
  driftLevel: string;
  driftLevelLabel: string;
  needsRecovery: boolean;
  currentScheduleStillViable: boolean;
  canRecoverWithoutRebuild: boolean;
  shouldOfferRebuild: boolean;
  recommendedAction: string;
  recommendedActionLabel: string;
  recommendedRecoveryMode: string | null;
  recommendedRecoveryModeLabel: string | null;
  availableActions: string[];
  availableActionLabels: string[];
  availableRecoveryModes: string[];
  availableRecoveryModeLabels: string[];
};

export function toPublicRecoveryPreview(
  r: PlanRecoveryPreviewResponse,
): PublicRecoveryPreview {
  const pressureFraction =
    typeof r.recovery_pressure_ratio === "number" &&
    Number.isFinite(r.recovery_pressure_ratio)
      ? r.recovery_pressure_ratio
      : 0;
  // Same FP-safe rounding as completion rate (recovery pressure can exceed
  // 1.0 when severely overloaded; we don't clamp it but we DO round to 0.1%).
  const pressureRounded = Math.round(pressureFraction * 1000) / 10;
  const pressureLabel = `${pressureRounded % 1 === 0 ? pressureRounded.toFixed(0) : pressureRounded.toFixed(1)}%`;
  const actions = r.available_actions ?? [];
  const modes = r.available_recovery_modes ?? [];
  return {
    planId: r.plan_id,
    planVersion: r.plan_version,
    scheduleRevision: r.schedule_revision,
    planStatus: r.plan_status,
    planStatusLabel: safeLabel(r.plan_status, PLAN_STATUS_LABELS),
    missedStudySlotsCount: r.missed_study_slots_count,
    overdueItemsCount: r.overdue_items_count,
    overdueMinutes: r.overdue_minutes,
    dueTodayItemsCount: r.due_today_items_count,
    remainingPendingItemsCount: r.remaining_pending_items_count,
    remainingPendingMinutes: r.remaining_pending_minutes,
    inProgressItemsCount: r.in_progress_items_count,
    availableCapacityNext7StudySlotsMinutes: r.available_capacity_next_7_study_slots_minutes,
    recoveryPressureRatio: pressureFraction,
    recoveryPressureLabel: pressureLabel,
    driftLevel: r.drift_level,
    driftLevelLabel: driftLevelLabel(r.drift_level),
    needsRecovery: r.needs_recovery,
    currentScheduleStillViable: r.current_schedule_still_viable,
    canRecoverWithoutRebuild: r.can_recover_without_rebuild,
    shouldOfferRebuild: r.should_offer_rebuild,
    recommendedAction: r.recommended_action,
    recommendedActionLabel: recoveryActionLabel(r.recommended_action),
    recommendedRecoveryMode: r.recommended_recovery_mode ?? null,
    recommendedRecoveryModeLabel: r.recommended_recovery_mode
      ? recoveryModeLabel(r.recommended_recovery_mode)
      : null,
    availableActions: actions,
    availableActionLabels: actions.map(recoveryActionLabel),
    availableRecoveryModes: modes,
    availableRecoveryModeLabels: modes.map(recoveryModeLabel),
  };
}

// ─── Recovery apply ──────────────────────────────────────────────────────

export const planRecoveryApplyRequestSchema = z.object({
  mode: z.string().min(1),
  expected_version: z.number().int().min(1),
  expected_schedule_revision: z.number().int().min(1),
  preferred_time_window: z.string().nullish(),
  pace_mode: z.string().nullish(),
  preferred_study_days: z.array(z.string()).optional(),
  max_daily_minutes: z.number().int().min(1).max(720).nullish(),
  session_cap_minutes: z.number().int().min(1).max(360).nullish(),
  temporary_note: z.string().max(1000).nullish(),
  recovery_note: z.string().min(1).max(300).nullish(),
});
export type PlanRecoveryApplyRequest = z.infer<typeof planRecoveryApplyRequestSchema>;

export const planRecoveryApplyResponseSchema = z
  .object({
    plan_id: z.number().int(),
    plan_version: z.number().int(),
    schedule_revision: z.number().int(),
    recovery_mode: z.string(),
    recovery_note: z.string().nullish(),
    rebuilt_pending_items_count: z.number().int(),
    preserved_completed_items_count: z.number().int(),
    preserved_skipped_items_count: z.number().int(),
    preserved_in_progress_items_count: z.number().int(),
    new_scheduled_start_date: z.string().nullish(),
    new_scheduled_end_date: z.string().nullish(),
    recovery_preview_before: planRecoveryPreviewResponseSchema,
    execution_summary_after: z.unknown(),
  })
  .passthrough();
export type PlanRecoveryApplyResponse = z.infer<typeof planRecoveryApplyResponseSchema>;

export type PublicRecoveryResult = {
  planId: number;
  planVersion: number;
  scheduleRevision: number;
  recoveryMode: string;
  recoveryModeLabel: string;
  recoveryNote: string | null;
  rebuiltPendingItemsCount: number;
  preservedCompletedItemsCount: number;
  preservedSkippedItemsCount: number;
  preservedInProgressItemsCount: number;
  newScheduledStartDate: string | null;
  newScheduledEndDate: string | null;
};

export function toPublicRecoveryResult(r: PlanRecoveryApplyResponse): PublicRecoveryResult {
  return {
    planId: r.plan_id,
    planVersion: r.plan_version,
    scheduleRevision: r.schedule_revision,
    recoveryMode: r.recovery_mode,
    recoveryModeLabel: recoveryModeLabel(r.recovery_mode),
    recoveryNote: r.recovery_note ?? null,
    rebuiltPendingItemsCount: r.rebuilt_pending_items_count,
    preservedCompletedItemsCount: r.preserved_completed_items_count,
    preservedSkippedItemsCount: r.preserved_skipped_items_count,
    preservedInProgressItemsCount: r.preserved_in_progress_items_count,
    newScheduledStartDate: r.new_scheduled_start_date ?? null,
    newScheduledEndDate: r.new_scheduled_end_date ?? null,
  };
}
