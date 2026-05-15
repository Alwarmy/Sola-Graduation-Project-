/**
 * Backend route capability registry.
 *
 * Encodes the 53 backend operations confirmed in CP1
 * (`docs/runtime/B1_CP1_openapi_routes_summary.json`) so the frontend
 * always knows which checkpoint owns which route and what the runtime
 * auth/state of each route is.
 *
 * The count is locked: 47 Level 3 learner-facing + 4 Level 1 admin-internal
 * + 2 Level 0 system = 53. Authority gate `AUTH-006` (Build Gate) stops
 * work if this count drifts.
 *
 * IMPORTANT:
 *   - "requiresBearer" reflects RUNTIME observation when CP1 exercised it.
 *     For routes CP1 did not exercise, the value reflects the OpenAPI
 *     security declaration.
 *   - The `/courses/search` row has BOTH the OpenAPI declaration and the
 *     runtime mismatch encoded (`runtimeOptionalAuth: true`). CP6 must
 *     re-verify before locking gateway behavior.
 *   - "ownerCheckpoint" is the checkpoint that introduces the learner UI
 *     for that route. CP2 itself does not implement any UI; it only
 *     records the ledger.
 *   - "status" in CP2 is always `not_implemented`. Each owning checkpoint
 *     updates its rows when its features land.
 */

export type RouteLevel = "L0" | "L1" | "L3";
export type RouteStatus =
  | "not_implemented"
  | "foundation_only"
  | "partial"
  | "implemented";

export type RouteCapability = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  level: RouteLevel;
  domain: string;
  /** OpenAPI declared bearer requirement (true) or none (false). */
  declaredBearer: boolean;
  /** Runtime accepts no-token even though OpenAPI declares bearer. */
  runtimeOptionalAuth?: true;
  /** Which checkpoint introduces the learner surface for this route. */
  ownerCheckpoint:
    | "B1.CP4"
    | "B1.CP5"
    | "B1.CP6"
    | "B1.CP7"
    | "B1.CP8"
    | "B1.CP9"
    | "B1.CP10"
    | "B1.CP11"
    | "deferred"
    | "system";
  /** Frontend implementation status as of the last log entry. */
  status: RouteStatus;
  notes?: string;
};

export const routeCapabilities: readonly RouteCapability[] = [
  // ─── infra (Level 0) ───────────────────────────────────────────────────
  { method: "GET", path: "/", level: "L0", domain: "infra", declaredBearer: false, ownerCheckpoint: "system", status: "not_implemented", notes: "Root liveness. Consumed only by runtime handshake." },
  { method: "GET", path: "/health/db", level: "L0", domain: "infra", declaredBearer: false, ownerCheckpoint: "system", status: "not_implemented", notes: "DB liveness. Consumed only by runtime handshake." },

  // ─── auth (Level 3 × 5) ────────────────────────────────────────────────
  // All five implemented in CP4 + hardening patch (NOTE-CP2-AUTH-001 / NOTE-CP1-AUTH-001 resolved).
  // Browser sees only PublicSession; tokens are HttpOnly server-side.
  // Verified by: handler tests + security test + 9 form tests + 7-step runtime evidence.
  { method: "POST", path: "/auth/register", level: "L3", domain: "auth", declaredBearer: false, ownerCheckpoint: "B1.CP4", status: "implemented", notes: "Returns UserResponse (not Token). Register success → /login (no auto-login)." },
  { method: "POST", path: "/auth/login", level: "L3", domain: "auth", declaredBearer: false, ownerCheckpoint: "B1.CP4", status: "implemented", notes: "Returns Token; Auth Gateway stores in HttpOnly cookies; response body is PublicSession only." },
  { method: "POST", path: "/auth/refresh", level: "L3", domain: "auth", declaredBearer: false, ownerCheckpoint: "B1.CP4", status: "implemented", notes: "Refresh token read from HttpOnly cookie server-side, forwarded in JSON body. Rotates cookies; clears on 401." },
  { method: "POST", path: "/auth/logout", level: "L3", domain: "auth", declaredBearer: false, ownerCheckpoint: "B1.CP4", status: "implemented", notes: "Refresh token read from HttpOnly cookie server-side, forwarded in JSON body. Cookies cleared even if backend logout fails." },
  { method: "GET", path: "/auth/me", level: "L3", domain: "auth", declaredBearer: true, ownerCheckpoint: "B1.CP4", status: "implemented", notes: "Consumed by /api/auth/session and /api/auth/login (post-login lookup). 401 → anonymous." },

  // ─── profile (Level 3 × 3) ─────────────────────────────────────────────
  // All three implemented in CP5. Surface: /profile page with create/edit
  // forms using CP3 primitives. Routed through /api/sola/[...path]. The
  // backend enforces enum constraints beyond OpenAPI; `lib/labels/profile-options.ts`
  // mirrors backend reference §enums and drives the form's Select dropdowns.
  { method: "GET", path: "/profile", level: "L3", domain: "profile", declaredBearer: true, ownerCheckpoint: "B1.CP5", status: "implemented", notes: "404 → 'missing' sentinel (no profile yet); 200 → PublicProfile. Verified end-to-end." },
  { method: "POST", path: "/profile", level: "L3", domain: "profile", declaredBearer: true, ownerCheckpoint: "B1.CP5", status: "implemented", notes: "Creates initial profile. Backend enforces enum constraints (400 validation_error)." },
  { method: "PUT", path: "/profile", level: "L3", domain: "profile", declaredBearer: true, ownerCheckpoint: "B1.CP5", status: "implemented", notes: "Updates profile. Invalidates profile/recommendations/learning-state/home cache per backend reference §5." },

  // ─── courses (Level 3 × 3 + Level 1 × 3) ───────────────────────────────
  // CP6: GET /courses (catalog), GET /courses/search (pipeline output),
  // GET /courses/{id} (detail). Re-verified optional-auth at runtime.
  // POST /courses/ingest = HIDDEN ORCHESTRATION via /api/courses/search.
  // CP6 Hardening Patch: dedicated optional-auth handlers at
  // app/api/courses/route.ts and app/api/courses/[courseId]/route.ts so
  // anonymous browsing works (NOTE-CP6-OPTIONAL-AUTH-001 resolved).
  { method: "GET", path: "/courses", level: "L3", domain: "courses", declaredBearer: true, runtimeOptionalAuth: true, ownerCheckpoint: "B1.CP6", status: "implemented", notes: "Discover catalog. Dedicated optional-auth handler at app/api/courses/route.ts. Anonymous + authenticated verified (B1_CP6_optional_auth_hardening_evidence.md steps 1+4). PublicCourseCard[] view model strips provider_metadata/quality_signals/personalization/discovery." },
  { method: "GET", path: "/courses/search", level: "L3", domain: "courses", declaredBearer: true, runtimeOptionalAuth: true, ownerCheckpoint: "B1.CP6", status: "implemented", notes: "Pipeline output. Server-side /api/courses/search orchestrator: best-effort POST /courses/ingest (authed) then GET /courses/search; browser sees only PublicCourseSearch. Search-orchestrator regression verified in hardening (sourceStatus: 'fresh', no ingest fields, no token leak)." },
  { method: "GET", path: "/courses/{course_id}", level: "L3", domain: "courses", declaredBearer: true, runtimeOptionalAuth: true, ownerCheckpoint: "B1.CP6", status: "implemented", notes: "/courses/[courseId] page renders PublicCourseCard via CourseDetailView. Dedicated optional-auth handler at app/api/courses/[courseId]/route.ts. Anonymous + authenticated verified (hardening steps 2+5). 404 → 'missing' sentinel." },
  { method: "POST", path: "/courses/ingest", level: "L1", domain: "courses", declaredBearer: true, ownerCheckpoint: "B1.CP6", status: "foundation_only", notes: "HIDDEN ORCHESTRATION only — server-side /api/courses/search. CP6 verified end-to-end (NOTE-CP1-RUNTIME-001 resolved): authed ingest moved DB total 84 → 88. No learner UI; response body NEVER reaches browser." },
  { method: "GET", path: "/courses/ingestions", level: "L1", domain: "courses", declaredBearer: true, ownerCheckpoint: "deferred", status: "not_implemented", notes: "Admin-internal. No learner UI in Block 1." },
  { method: "GET", path: "/courses/raw", level: "L1", domain: "courses", declaredBearer: true, ownerCheckpoint: "deferred", status: "not_implemented", notes: "Admin-internal. No learner UI in Block 1." },

  // ─── course-structures (Level 3 × 2 + Level 1 × 1) ─────────────────────
  { method: "GET", path: "/course-structures/{course_id}", level: "L3", domain: "course-structures", declaredBearer: true, ownerCheckpoint: "B1.CP6", status: "implemented", notes: "Course detail page section. 404 → safe EmptyState ('Structure not built yet'). Authenticated only; anonymous shows ProtectedState." },
  { method: "GET", path: "/course-structures/{course_id}/units", level: "L3", domain: "course-structures", declaredBearer: true, ownerCheckpoint: "B1.CP6", status: "implemented", notes: "Units list under course detail. Ordered by source_order_index. Safe display fields only." },
  { method: "POST", path: "/course-structures/{course_id}/build", level: "L1", domain: "course-structures", declaredBearer: true, ownerCheckpoint: "deferred", status: "not_implemented", notes: "Admin-internal." },

  // ─── recommendations (Level 3 × 1) ─────────────────────────────────────
  { method: "GET", path: "/recommendations", level: "L3", domain: "recommendations", declaredBearer: true, ownerCheckpoint: "B1.CP6", status: "implemented", notes: "RecommendationsPanel on Discover page. Authenticated only; anonymous shows ProtectedState. Empty list → honest EmptyState (no fake fallback)." },

  // ─── plans (Level 3 × 12) ──────────────────────────────────────────────
  { method: "GET", path: "/plans", level: "L3", domain: "plans", declaredBearer: true, ownerCheckpoint: "B1.CP7", status: "implemented", notes: "PlanList on /plans page. Post-CP10 hardening: dedicated safe GET handler at /api/plans runs toPublicLearningPlan server-side (no provider_metadata / quality_signals leak). Hook: usePlans (plansSafeFetch). 200 [] honest empty state." },
  { method: "POST", path: "/plans", level: "L3", domain: "plans", declaredBearer: true, ownerCheckpoint: "B1.CP7", status: "implemented", notes: "CP7-dedicated handler at /api/plans (POST). Body validated by learningPlanCreateRequestSchema; queue_item_ids capped 1–3 per backend." },
  { method: "GET", path: "/plans/active", level: "L3", domain: "plans", declaredBearer: true, ownerCheckpoint: "B1.CP7", status: "implemented", notes: "ActivePlanSummary section. Post-CP10 hardening: dedicated safe GET handler at /api/plans/active runs toPublicLearningPlan server-side. Hook: useActivePlan. 404 mapped to {kind:'missing'} sentinel — empty state, not an error." },
  { method: "GET", path: "/plans/queue", level: "L3", domain: "plans", declaredBearer: true, ownerCheckpoint: "B1.CP7", status: "implemented", notes: "QueuePanel section + CourseCard add-to-queue feedback. Post-CP10 hardening: dedicated safe GET handler at /api/plans/queue runs toPublicQueueItem (→ toPublicCourseCard) server-side; provider_metadata + quality_signals stripped before browser sees response. Hook: usePlanQueue (plansSafeFetch). Safe empty array on no queue." },
  { method: "POST", path: "/plans/queue/{course_id}", level: "L3", domain: "plans", declaredBearer: true, ownerCheckpoint: "B1.CP7", status: "implemented", notes: "CP7-dedicated handler at /api/plans/queue/[id] (POST). AddToQueueButton on CourseCard + CourseDetailView. 409 surfaced as 'Already in your plan queue.'" },
  { method: "DELETE", path: "/plans/queue/{queue_item_id}", level: "L3", domain: "plans", declaredBearer: true, ownerCheckpoint: "B1.CP7", status: "implemented", notes: "CP7-dedicated handler at /api/plans/queue/[id] (DELETE). Remove action in QueuePanel." },
  { method: "GET", path: "/plans/{plan_id}", level: "L3", domain: "plans", declaredBearer: true, ownerCheckpoint: "B1.CP7", status: "implemented", notes: "PlanDetailClient at /plans/[planId]. Post-CP10 hardening: dedicated safe GET handler at /api/plans/[planId] runs toPublicLearningPlan server-side. Hook: usePlanDetail (plansSafeFetch). 404 mapped to {kind:'missing'}." },
  { method: "GET", path: "/plans/{plan_id}/readiness", level: "L3", domain: "plans", declaredBearer: true, ownerCheckpoint: "B1.CP7", status: "implemented", notes: "ReadinessPanel on plan detail. Post-CP10 hardening: dedicated safe GET handler at /api/plans/[planId]/readiness runs toPublicPlanReadiness server-side. Hook: usePlanReadiness (plansSafeFetch). CP7 surfaces base blockers + recommended action label only; CP8 fields (schedule/execution counts) intentionally not displayed." },
  { method: "PUT", path: "/plans/{plan_id}/preferences", level: "L3", domain: "plans", declaredBearer: true, ownerCheckpoint: "B1.CP7", status: "implemented", notes: "CP7-dedicated handler at /api/plans/[planId]/preferences. Concurrency via expected_version in BODY (PROTO-005 alt). Stale → 412 + ConflictPanel." },
  { method: "PUT", path: "/plans/{plan_id}/status", level: "L3", domain: "plans", declaredBearer: true, ownerCheckpoint: "B1.CP7", status: "implemented", notes: "CP7-dedicated handler at /api/plans/[planId]/status. Concurrency via expected_version in BODY. StatusControl on plan detail." },
  { method: "POST", path: "/plans/{plan_id}/courses/queue-items/{queue_item_id}", level: "L3", domain: "plans", declaredBearer: true, ownerCheckpoint: "B1.CP7", status: "implemented", notes: "CP7-dedicated handler at /api/plans/[planId]/courses/queue-items/[queueItemId]. Concurrency via X-Expected-Version HEADER (PROTO-005). Stale → 412 + ConflictPanel." },
  { method: "DELETE", path: "/plans/{plan_id}/courses/{plan_course_id}", level: "L3", domain: "plans", declaredBearer: true, ownerCheckpoint: "B1.CP7", status: "implemented", notes: "CP7-dedicated handler at /api/plans/[planId]/courses/[planCourseId]. Concurrency via X-Expected-Version HEADER. Remove action in PlanCoursesList." },

  // ─── schedule (Level 3 × 2) ────────────────────────────────────────────
  { method: "POST", path: "/plans/{plan_id}/schedule/generate", level: "L3", domain: "schedule", declaredBearer: true, ownerCheckpoint: "B1.CP8", status: "implemented", notes: "CP8-dedicated handler at /api/plans/[planId]/schedule/generate. Concurrency: `expected_version` BODY (required) + `expected_schedule_revision` BODY (optional). Hook: useGenerateSchedule. UI: SchedulePanel inside PlanDetailClient. Adapter: toPublicScheduleGenerationResult." },
  { method: "GET", path: "/plans/{plan_id}/items", level: "L3", domain: "schedule", declaredBearer: true, ownerCheckpoint: "B1.CP8", status: "implemented", notes: "CP8-dedicated handler at /api/plans/[planId]/items. Adapter: toPublicPlanItem strips item_metadata, practical_signal, load_signal, admin course shape. Hook: usePlanItems. UI: PlanItemsList + PlanItemRow." },

  // ─── execution (Level 3 × 4) ───────────────────────────────────────────
  { method: "POST", path: "/plans/{plan_id}/items/{item_id}/start", level: "L3", domain: "execution", declaredBearer: true, ownerCheckpoint: "B1.CP8", status: "implemented", notes: "CP8-dedicated handler at /api/plans/[planId]/items/[itemId]/start. Concurrency: X-Expected-Version HEADER (required). Hook: useStartPlanItem. UI: PlanItemRow Start button. Adapter: toPublicPlanItemActionResult." },
  { method: "POST", path: "/plans/{plan_id}/items/{item_id}/complete", level: "L3", domain: "execution", declaredBearer: true, ownerCheckpoint: "B1.CP8", status: "implemented", notes: "CP8-dedicated handler at /api/plans/[planId]/items/[itemId]/complete. Concurrency: `expected_version` BODY (required), optional `actual_minutes` BODY. Hook: useCompletePlanItem. UI: PlanItemRow Complete button + inline minutes input." },
  { method: "POST", path: "/plans/{plan_id}/items/{item_id}/skip", level: "L3", domain: "execution", declaredBearer: true, ownerCheckpoint: "B1.CP8", status: "implemented", notes: "CP8-dedicated handler at /api/plans/[planId]/items/[itemId]/skip. Concurrency: `expected_version` BODY (required), optional `skip_reason` BODY. Hook: useSkipPlanItem. UI: PlanItemRow Skip button + reason textarea." },
  { method: "GET", path: "/plans/{plan_id}/execution-summary", level: "L3", domain: "execution", declaredBearer: true, ownerCheckpoint: "B1.CP8", status: "implemented", notes: "CP8-dedicated handler at /api/plans/[planId]/execution-summary. Adapter: toPublicExecutionSummary clamps completion_rate to [0,1] and formats as percent. Hook: useExecutionSummary. UI: ExecutionSummaryPanel." },

  // ─── recovery (Level 3 × 2) ────────────────────────────────────────────
  { method: "GET", path: "/plans/{plan_id}/recovery-preview", level: "L3", domain: "recovery", declaredBearer: true, ownerCheckpoint: "B1.CP8", status: "implemented", notes: "CP8-dedicated handler at /api/plans/[planId]/recovery-preview. Adapter: toPublicRecoveryPreview maps drift level, recovery pressure, recommended action/mode to safe labels. Hook: useRecoveryPreview. UI: RecoveryPanel." },
  { method: "POST", path: "/plans/{plan_id}/recover", level: "L3", domain: "recovery", declaredBearer: true, ownerCheckpoint: "B1.CP8", status: "implemented", notes: "CP8-dedicated handler at /api/plans/[planId]/recover. Concurrency: BOTH `expected_version` AND `expected_schedule_revision` BODY (both required, ≥1). Hook: useApplyRecovery. UI: RecoveryPanel Apply button — disabled when either revision is unknown (per addendum §D). Invalidates plan.list + plan.active in addition to the standard CP8 scope." },

  // ─── assistant (Level 3 × 9) ───────────────────────────────────────────
  { method: "GET", path: "/assistant/conversations", level: "L3", domain: "assistant", declaredBearer: true, ownerCheckpoint: "B1.CP9", status: "implemented", notes: "CP9 closure-pass dedicated handler at /api/assistant/conversations (GET) — moved off /api/sola to strip conversation_metadata server-side. Hook: useAssistantConversations. UI: ConversationList." },
  { method: "POST", path: "/assistant/conversations", level: "L3", domain: "assistant", declaredBearer: true, ownerCheckpoint: "B1.CP9", status: "implemented", notes: "CP9-dedicated handler at /api/assistant/conversations. Hook: useCreateAssistantConversation. UI: CreateConversationForm. Validates optional title via Zod." },
  { method: "GET", path: "/assistant/conversations/{conversation_id}", level: "L3", domain: "assistant", declaredBearer: true, ownerCheckpoint: "B1.CP9", status: "implemented", notes: "CP9 closure-pass dedicated handler at /api/assistant/conversations/[conversationId] (GET) — strips nested message_metadata, context_snapshot, signal_value, signal_metadata, request_payload, preview_payload, result_payload, contract_summary, lifecycle_summary server-side. Hook: useAssistantConversation." },
  { method: "GET", path: "/assistant/conversations/{conversation_id}/messages", level: "L3", domain: "assistant", declaredBearer: true, ownerCheckpoint: "B1.CP9", status: "implemented", notes: "CP9 closure-pass dedicated handler at /api/assistant/conversations/[conversationId]/messages (GET) — strips message_metadata + context_snapshot server-side. Hook: useAssistantMessages. UI: ConversationThread + MessageBubble." },
  { method: "POST", path: "/assistant/conversations/{conversation_id}/messages", level: "L3", domain: "assistant", declaredBearer: true, ownerCheckpoint: "B1.CP9", status: "implemented", notes: "CP9-dedicated handler at /api/assistant/conversations/[conversationId]/messages. Validates content 1..4000 via Zod. Adapter strips used_context_summary + raw payloads. Hook: useSendAssistantMessage. UI: MessageComposer. Invalidates conversations/conversation/messages/memorySignals/actionRuns." },
  { method: "GET", path: "/assistant/action-runs", level: "L3", domain: "assistant", declaredBearer: true, ownerCheckpoint: "B1.CP9", status: "implemented", notes: "CP9 closure-pass dedicated handler at /api/assistant/action-runs (GET) — strips request_payload/preview_payload/result_payload server-side. Hook: useAssistantActionRuns. UI: ActionRunsPanel. Unknown action_type renders safely with disabled Confirm." },
  { method: "POST", path: "/assistant/action-runs/{action_run_id}/confirm", level: "L3", domain: "assistant", declaredBearer: true, ownerCheckpoint: "B1.CP9", status: "implemented", notes: "CP9-dedicated handler at /api/assistant/action-runs/[actionRunId]/confirm. Empty body. Hook: useConfirmAssistantActionRun runs action-type-scoped cross-domain refetch (pause/resume/recover → plan scope; queue_top_recommendation → queue + recommendations; review-only → assistant scope; unknown → broad-safe). Explicit user click required." },
  { method: "GET", path: "/assistant/memory-signals", level: "L3", domain: "assistant", declaredBearer: true, ownerCheckpoint: "B1.CP9", status: "implemented", notes: "CP9 closure-pass dedicated handler at /api/assistant/memory-signals (GET) — strips signal_value + signal_metadata server-side; forwards status_filter / effective_only / conversation_id query params. Hook: useAssistantMemorySignals. UI: MemorySignalsPanel." },
  { method: "POST", path: "/assistant/memory-signals/{signal_id}/confirm", level: "L3", domain: "assistant", declaredBearer: true, ownerCheckpoint: "B1.CP9", status: "implemented", notes: "CP9-dedicated handler at /api/assistant/memory-signals/[signalId]/confirm. Empty body. Hook: useConfirmAssistantMemorySignal invalidates memory + active conversation + messages; on durable_preference also invalidates profile + learning-state. Explicit user click required." },

  // ─── learning-state (Level 3 × 2) ──────────────────────────────────────
  { method: "GET", path: "/learning-state", level: "L3", domain: "learning-state", declaredBearer: true, ownerCheckpoint: "B1.CP11", status: "implemented", notes: "CP11-dedicated handler at /api/learning-state. Adapts to PublicLearningState server-side; strips topic_familiarity, topic_families, source_profile_snapshot, source_event_summary, profile_alignment, user_id. Hook: useLearningState. UI: LearningStateCard on /progress. 404 → {kind:'missing'} → honest empty state." },
  { method: "POST", path: "/learning-state/refresh", level: "L3", domain: "learning-state", declaredBearer: true, ownerCheckpoint: "B1.CP11", status: "implemented", notes: "CP11-dedicated handler at /api/learning-state/refresh. Empty body. Adapts response to PublicLearningState. Hook: useRefreshLearningState — explicit user-click only (NO auto-run on mount); on success invalidates events + plan scope. UI: explicit Refresh button on /progress LearningStateCard." },

  // ─── events (Level 3 × 2) ──────────────────────────────────────────────
  { method: "GET", path: "/events", level: "L3", domain: "events", declaredBearer: true, ownerCheckpoint: "B1.CP11", status: "implemented", notes: "CP11-dedicated handler at /api/events. Adapts via toPublicLearnerEvent server-side; strips event_payload + user_id; unknown event_type → 'Learning activity' safe fallback. Forwards event_type / limit (1..100) / offset (>=0) query params with validation. Hook: useLearnerEvents. UI: ActivityCard on /progress." },
  { method: "POST", path: "/events", level: "L3", domain: "events", declaredBearer: true, ownerCheckpoint: "B1.CP11", status: "not_implemented", notes: "Backend accepts free-form event_type + open event_payload dict — unsafe for a free-form learner UI per CP11 directive addendum §B. Deferred to a future CP that introduces a curated approved-action surface (e.g. 'Mark reflection completed'). No frontend handler / hook / UI exists." },
];

/** Locked totals. CP1 confirmed; build gate AUTH-006 stops work on drift. */
export const ROUTE_COUNTS = {
  total: 53,
  level3: 47,
  level1: 4,
  level0: 2,
} as const;

// Runtime sanity: the registry length matches the locked total.
// Throws at module import time so any drift fails fast before render.
if (routeCapabilities.length !== ROUTE_COUNTS.total) {
  throw new Error(
    `routeCapabilities length ${routeCapabilities.length} does not match ROUTE_COUNTS.total ${ROUTE_COUNTS.total}. ` +
      "Backend route inventory may have drifted — re-run CP1 handshake and update both before continuing.",
  );
}

export function getCapability(
  method: RouteCapability["method"],
  path: string,
): RouteCapability | undefined {
  return routeCapabilities.find((r) => r.method === method && r.path === path);
}
