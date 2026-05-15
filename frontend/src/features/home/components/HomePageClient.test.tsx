import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { HomePageClient } from "./HomePageClient";
import { makeQueryWrapper } from "@/test/react-query-wrapper";

// Mock next/link so JSDOM doesn't choke on the typed Route<...> generic.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={String(href)} {...rest}>
      {children}
    </a>
  ),
}));

// ─── Sentinels: NEVER allowed in the rendered DOM ────────────────────────

const TOKEN_LEAK_SENTINELS = [
  "access_token",
  "refresh_token",
  "session_id",
  "sola_access",
  "sola_refresh",
] as const;

const INTERNAL_LEAK_WORDS = [
  "signal_value",
  "signal_metadata",
  "request_payload",
  "preview_payload",
  "result_payload",
  "used_context_summary",
  "context_snapshot",
  "message_metadata",
  "conversation_metadata",
  "item_metadata",
  "practical_signal",
  "load_signal",
  "provider_metadata",
] as const;

function assertNoLeak(rootText: string) {
  for (const sentinel of TOKEN_LEAK_SENTINELS) {
    expect(rootText, `token-key leak: ${sentinel}`).not.toContain(sentinel);
  }
  const lower = rootText.toLowerCase();
  for (const word of INTERNAL_LEAK_WORDS) {
    expect(lower, `internal-payload leak: ${word}`).not.toContain(word);
  }
  expect(rootText).not.toMatch(/\bnull\b/);
  expect(rootText).not.toMatch(/\bundefined\b/);
  expect(rootText).not.toMatch(/NaN/);
}

// ─── Fixtures (already-adapted Public shapes from the dedicated handlers) ─

// Reference Public* shapes — kept inline next to the raw backend shapes
// emitted by the stubs to make adapter assumptions traceable in review.
const _publicReadinessReference = {
  kind: "loaded" as const,
  readiness: {
    planId: 203,
    version: 2,
    scheduleRevision: 1,
    status: "active",
    statusLabel: "Active",
    isOpenStatus: true,
    isActiveStatus: true,
    hasPreference: true,
    hasCourses: true,
    hasScheduleItems: true,
    activeCourseCount: 2,
    maxActiveCourses: 3,
    queuedBacklogCount: 0,
    baseBlockers: [],
    generationBlockers: [],
    executionBlockers: [],
    isReadyForScheduleGeneration: false,
    isReadyForForceRegeneration: true,
    isReadyForExecution: true,
    recommendedActionLabel: "Start studying",
    recommendedRecoveryModeLabel: null,
  },
};

const publicItems = [
  {
    id: 5001,
    planId: 203,
    courseId: 2,
    version: 1,
    title: "Variables",
    itemType: "video_segment",
    itemTypeLabel: "Video Segment",
    status: "pending",
    statusLabel: "Pending",
    scheduledDate: "2026-05-14",
    timeWindow: "evening",
    timeWindowLabel: "Evening",
    plannedMinutes: 30,
    actualMinutes: null,
    actualStartedAt: null,
    actualCompletedAt: null,
    skippedAt: null,
    skipReason: null,
    isDueToday: true,
    isOverdue: false,
    isActionable: true,
    scheduleOrderIndex: 0,
    course: {
      id: 2,
      title: "Python Tutorial 2026",
      providerDisplayName: "YouTube",
      language: "en",
      url: null,
    },
    courseUnit: { id: 41, title: "Variables", estimatedMinutes: 30 },
  },
];

/**
 * H-1 fixture: 1 completed of 101 total — backend returns completionRate
 * 0.99 / "99%" which is misleading. Home must surface counts clearly and
 * NOT headline "99%".
 */
const publicExecutionSummaryH1 = {
  planId: 203,
  planStatus: "active",
  planStatusLabel: "Active",
  totalItems: 101,
  pendingItemsCount: 100,
  inProgressItemsCount: 0,
  completedItemsCount: 1,
  skippedItemsCount: 0,
  overdueItemsCount: 0,
  dueTodayItemsCount: 5,
  completionRate: 0.99,
  completionRateLabel: "99%",
  isPlanFinished: false,
  canMarkCompleted: false,
  nextActionableItemId: 5001,
  nextActionableScheduledDate: "2026-05-14",
  nextActionableTitle: "Variables",
};

const publicRecoveryPreviewOnTrack = {
  planId: 203,
  planVersion: 2,
  scheduleRevision: 1,
  planStatus: "active",
  planStatusLabel: "Active",
  missedStudySlotsCount: 0,
  overdueItemsCount: 0,
  overdueMinutes: 0,
  dueTodayItemsCount: 5,
  remainingPendingItemsCount: 100,
  remainingPendingMinutes: 3000,
  inProgressItemsCount: 0,
  availableCapacityNext7StudySlotsMinutes: 420,
  recoveryPressureRatio: 0,
  recoveryPressureLabel: "0%",
  driftLevel: "on_track",
  driftLevelLabel: "On track",
  needsRecovery: false,
  currentScheduleStillViable: true,
  canRecoverWithoutRebuild: false,
  shouldOfferRebuild: false,
  recommendedAction: "stay_on_track",
  recommendedActionLabel: "Stay on track",
  recommendedRecoveryMode: null,
  recommendedRecoveryModeLabel: null,
  availableActions: ["stay_on_track"],
  availableActionLabels: ["Stay on track"],
  availableRecoveryModes: [],
  availableRecoveryModeLabels: [],
};

const publicConversation = {
  id: 158,
  title: "Audit conversation",
  status: "active",
  statusLabel: "Active",
  lastUserMessageAt: "2026-05-14T09:30:00Z",
  lastAssistantMessageAt: "2026-05-14T09:30:05Z",
  createdAt: "2026-05-14T09:30:00Z",
  updatedAt: "2026-05-14T09:30:05Z",
};

// ─── fetch stub helpers ──────────────────────────────────────────────────

type StubMap = Record<string, () => Response>;

function stubByPath(
  map: StubMap,
  options: { defaultBody?: unknown; defaultStatus?: number } = {},
) {
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      // Find the longest matching key (so "/api/plans/203/readiness"
      // wins over "/api/sola/plans" when both are registered).
      const candidates = Object.keys(map)
        .filter((k) => url.includes(k))
        .sort((a, b) => b.length - a.length);
      if (candidates.length > 0) {
        return map[candidates[0]!]!();
      }
      return new Response(
        JSON.stringify(options.defaultBody ?? {}),
        {
          status: options.defaultStatus ?? 200,
          headers: { "content-type": "application/json" },
        },
      );
    }),
  );
  return calls;
}

function jsonResponse(body: unknown, status = 200) {
  return () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
}

function notFoundJson(detail = "Not found") {
  return () =>
    new Response(
      JSON.stringify({ detail, error_code: "not_found" }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("HomePageClient (CP10)", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  test("anonymous: renders Sign in / Register / Discover; no personalized data; no fetches to /api/sola/* or /api/assistant", async () => {
    const calls = stubByPath({
      "/api/auth/session": jsonResponse({ user: null }),
    });
    const { container } = render(<HomePageClient />, { wrapper: makeQueryWrapper() });
    // Wait for the anon home to fully render — the AnonymousHome subtitle
    // is unique to the anonymous state, so use it as the readiness probe.
    expect(
      await screen.findByText(/A focused learning assistant/),
    ).toBeInTheDocument();
    expect(screen.getByText("Sign in")).toBeInTheDocument();
    expect(screen.getByText("Create account")).toBeInTheDocument();
    expect(screen.getAllByText(/Discover courses/).length).toBeGreaterThan(0);
    // Anonymous home must NOT trigger authed fetches.
    const authedFetches = calls.filter(
      (c) =>
        c.url.includes("/api/sola/") ||
        c.url.includes("/api/assistant/") ||
        c.url.includes("/api/plans/"),
    );
    expect(authedFetches).toEqual([]);
    assertNoLeak(container.textContent ?? "");
  });

  test("authed + complete state: Welcome + Profile-ready + Active plan + Queue + Schedule readiness + Next item + Counts (H-1 SAFE) + On-track recovery + Assistant", async () => {
    stubByPath({
      "/api/auth/session": jsonResponse({
        user: { id: 9, email: "u@example.com", fullName: "Test User" },
      }),
      "/api/sola/profile": jsonResponse({
        // Server response is the raw backend snake_case shape (useProfile
        // adapts it to PublicProfile via Zod + toPublicProfile).
        id: 1,
        user_id: 9,
        background_track: "software_engineering",
        primary_track: "software_engineering",
        secondary_tracks: [],
        target_role: null,
        experience_level: "intermediate",
        employment_status: "employed",
        is_student: false,
        education_major: null,
        weekly_hours: 10,
        goal: "job",
        preferred_language: "en",
        bio: null,
        timezone: "Asia/Riyadh",
        created_at: "2026-05-14T09:00:00Z",
        updated_at: "2026-05-14T09:00:00Z",
      }),
      // Post-CP10 hardening: dedicated plan GET handlers now adapt
      // server-side, so the browser receives the already-adapted Public
      // camelCase shape. The stubs here return that adapted shape.
      "/api/plans/active": jsonResponse({
        id: 203,
        title: "Audit plan",
        goal: "Verify the schedule + execution + recovery flow end-to-end.",
        status: "active",
        statusLabel: "Active",
        version: 2,
        scheduleRevision: 1,
        currentFocusSnapshot: null,
        weeklyHoursSnapshot: 10,
        scheduleTimezoneSnapshot: "Asia/Riyadh",
        createdAt: "2026-05-14T09:00:00Z",
        updatedAt: "2026-05-14T09:00:00Z",
        preference: null,
        courses: [],
      }),
      "/api/plans/queue": jsonResponse([
        {
          id: 100,
          courseId: 2,
          status: "queued",
          statusLabel: "Queued",
          note: null,
          createdAt: "2026-05-14T09:00:00Z",
          updatedAt: "2026-05-14T09:00:00Z",
          course: {
            id: 2,
            title: "Python Tutorial 2026",
            source: "youtube",
            providerDisplayName: "YouTube",
            contentFormatLabel: "Video",
            difficultyLabel: null,
            durationLabel: null,
            pricingLabel: null,
            instructorDisplayName: "Telusko",
            language: null,
            topicTagLabels: [],
            progressionLabel: null,
            qualityTier: null,
            cardSummary: "Video",
            shortDescription: null,
            description: null,
            url: null,
            thumbnailUrl: null,
            badges: [],
          },
        },
      ]),
      "/api/plans": jsonResponse([
        {
          id: 203,
          title: "Audit plan",
          goal: "x",
          status: "active",
          statusLabel: "Active",
          version: 2,
          scheduleRevision: 1,
          currentFocusSnapshot: null,
          weeklyHoursSnapshot: 10,
          scheduleTimezoneSnapshot: "Asia/Riyadh",
          createdAt: "x",
          updatedAt: "x",
          preference: null,
          courses: [],
        },
      ]),
      "/api/plans/203/readiness": jsonResponse({
        planId: 203,
        version: 2,
        scheduleRevision: 1,
        status: "active",
        statusLabel: "Active",
        isOpenStatus: true,
        isActiveStatus: true,
        hasPreference: true,
        hasCourses: true,
        hasScheduleItems: true,
        activeCourseCount: 2,
        maxActiveCourses: 3,
        queuedBacklogCount: 0,
        baseBlockers: [],
        generationBlockers: [],
        executionBlockers: [],
        isReadyForScheduleGeneration: false,
        isReadyForForceRegeneration: true,
        isReadyForExecution: true,
        recommendedActionLabel: "Start studying",
        recommendedRecoveryModeLabel: null,
      }),
      "/api/plans/203/items": jsonResponse(publicItems),
      "/api/plans/203/execution-summary": jsonResponse(publicExecutionSummaryH1),
      "/api/plans/203/recovery-preview": jsonResponse(publicRecoveryPreviewOnTrack),
      "/api/assistant/conversations": jsonResponse([publicConversation]),
    });

    const { container } = render(<HomePageClient />, { wrapper: makeQueryWrapper() });

    expect(await screen.findByText(/Welcome, Test User/)).toBeInTheDocument();
    // Profile ready badge
    expect(await screen.findByText("Profile ready")).toBeInTheDocument();
    // Active plan title appears (multiple places: header, NextItem card, etc.)
    expect((await screen.findAllByText(/Audit plan/)).length).toBeGreaterThan(0);
    // Queue surfaces course title (appears in queue + next-item; just confirm at-least-one match)
    expect((await screen.findAllByText(/Python Tutorial 2026/)).length).toBeGreaterThan(0);
    // Readiness chips
    expect((await screen.findAllByText(/Schedule:/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Execution:/)).length).toBeGreaterThan(0);
    // Next scheduled item — title "Variables" + Due today badge
    expect((await screen.findAllByText("Variables")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Due today/)).length).toBeGreaterThan(0);
    // Recovery on-track
    expect(await screen.findByText(/You're on track right now\./)).toBeInTheDocument();
    // Assistant card surfaces conversation count + title
    expect(await screen.findByText("Audit conversation")).toBeInTheDocument();

    // ─── H-1 HARDENED display assertions (post-CP10 hardening pass) ──
    // Counts must be visible (these are the reliable surface).
    expect((await screen.findAllByText("101")).length).toBeGreaterThan(0); // total
    expect((await screen.findAllByText("100")).length).toBeGreaterThan(0); // pending
    expect((await screen.findAllByText("1")).length).toBeGreaterThan(0); // completed
    // The backend percent label MUST NOT appear ANYWHERE in the DOM
    // while NOTE-CP9-CP10-H1-EXECUTION-SUMMARY-001 is open. The
    // hardening pass replaced the secondary line with safe "under
    // review" copy that contains no percent at all.
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/99%/);
    expect(text).not.toMatch(/100%/);
    expect(text).not.toMatch(/Backend reports completion rate/);
    const rateLine = container.querySelector(
      "[data-testid='execution-completion-rate-line']",
    );
    expect(rateLine).not.toBeNull();
    expect(rateLine?.textContent ?? "").toMatch(/under review/);
    expect(rateLine?.textContent ?? "").not.toMatch(/99%/);
    expect(rateLine?.textContent ?? "").not.toMatch(/100%/);

    assertNoLeak(text);
  });

  test("authed but missing profile: NextAction headlines profile + Profile card shows CTA", async () => {
    stubByPath({
      "/api/auth/session": jsonResponse({
        user: { id: 9, email: "u@example.com", fullName: "U" },
      }),
      "/api/sola/profile": notFoundJson("Profile not found"),
      "/api/plans/active": notFoundJson("No active plan"),
      "/api/plans/queue": jsonResponse([]),
      "/api/plans": jsonResponse([]),
      "/api/assistant/conversations": jsonResponse([]),
    });

    const { container } = render(<HomePageClient />, { wrapper: makeQueryWrapper() });
    // Next-action card: "Complete your profile."
    expect(await screen.findByText("Complete your profile.")).toBeInTheDocument();
    // Profile card: "Tell us about you." CTA
    expect(await screen.findByText("Tell us about you.")).toBeInTheDocument();
    assertNoLeak(container.textContent ?? "");
  });

  test("authed + no plan + empty queue: NextAction headlines Discover", async () => {
    stubByPath({
      "/api/auth/session": jsonResponse({
        user: { id: 9, email: "u@example.com", fullName: "U" },
      }),
      "/api/sola/profile": jsonResponse({
        id: 1,
        user_id: 9,
        background_track: "software_engineering",
        primary_track: null,
        secondary_tracks: [],
        target_role: null,
        experience_level: null,
        employment_status: "employed",
        is_student: false,
        education_major: null,
        weekly_hours: 5,
        goal: "job",
        preferred_language: "en",
        bio: null,
        timezone: "Asia/Riyadh",
        created_at: "x",
        updated_at: "x",
      }),
      "/api/plans/active": notFoundJson(),
      "/api/plans/queue": jsonResponse([]),
      "/api/plans": jsonResponse([]),
      "/api/assistant/conversations": jsonResponse([]),
    });
    const { container } = render(<HomePageClient />, { wrapper: makeQueryWrapper() });
    expect(await screen.findByText("Find courses to study.")).toBeInTheDocument();
    // No active plan card shows hint
    expect(await screen.findByText(/No active plan yet\./)).toBeInTheDocument();
    // Queue card empty
    expect(await screen.findByText(/Your queue is empty\./)).toBeInTheDocument();
    assertNoLeak(container.textContent ?? "");
  });

  test("authed + queue with no active plan: NextAction headlines Create a plan", async () => {
    stubByPath({
      "/api/auth/session": jsonResponse({
        user: { id: 9, email: "u@example.com", fullName: "U" },
      }),
      "/api/sola/profile": jsonResponse({
        id: 1,
        user_id: 9,
        background_track: "software_engineering",
        primary_track: null,
        secondary_tracks: [],
        target_role: null,
        experience_level: null,
        employment_status: "employed",
        is_student: false,
        education_major: null,
        weekly_hours: 5,
        goal: "job",
        preferred_language: "en",
        bio: null,
        timezone: "Asia/Riyadh",
        created_at: "x",
        updated_at: "x",
      }),
      "/api/plans/active": notFoundJson(),
      "/api/plans/queue": jsonResponse([
        {
          id: 100,
          courseId: 2,
          status: "queued",
          statusLabel: "Queued",
          note: null,
          createdAt: "x",
          updatedAt: "x",
          course: {
            id: 2,
            title: "Python Tutorial 2026",
            source: "youtube",
            providerDisplayName: "YouTube",
            contentFormatLabel: "Video",
            difficultyLabel: null,
            durationLabel: null,
            pricingLabel: null,
            instructorDisplayName: "Telusko",
            language: null,
            topicTagLabels: [],
            progressionLabel: null,
            qualityTier: null,
            cardSummary: "Video",
            shortDescription: null,
            description: null,
            url: null,
            thumbnailUrl: null,
            badges: [],
          },
        },
      ]),
      "/api/plans": jsonResponse([]),
      "/api/assistant/conversations": jsonResponse([]),
    });
    const { container } = render(<HomePageClient />, { wrapper: makeQueryWrapper() });
    expect(await screen.findByText("You have courses queued.")).toBeInTheDocument();
    assertNoLeak(container.textContent ?? "");
  });

  test("partial failure: queue 500 keeps the rest of Home rendered with a per-card ErrorState", async () => {
    stubByPath({
      "/api/auth/session": jsonResponse({
        user: { id: 9, email: "u@example.com", fullName: "U" },
      }),
      "/api/sola/profile": jsonResponse({
        id: 1,
        user_id: 9,
        background_track: "software_engineering",
        primary_track: null,
        secondary_tracks: [],
        target_role: null,
        experience_level: null,
        employment_status: "employed",
        is_student: false,
        education_major: null,
        weekly_hours: 5,
        goal: "job",
        preferred_language: "en",
        bio: null,
        timezone: "Asia/Riyadh",
        created_at: "x",
        updated_at: "x",
      }),
      "/api/plans/active": notFoundJson(),
      "/api/plans/queue": () =>
        new Response(
          JSON.stringify({
            detail: "Queue read failed.",
            error_code: "internal_server_error",
            request_id: "req-queue-500",
          }),
          { status: 500, headers: { "content-type": "application/json" } },
        ),
      "/api/plans": jsonResponse([]),
      "/api/assistant/conversations": jsonResponse([]),
    });
    const { container } = render(<HomePageClient />, { wrapper: makeQueryWrapper() });
    // Profile card still renders Profile ready badge.
    expect(await screen.findByText("Profile ready")).toBeInTheDocument();
    // No-active-plan card still renders.
    expect(await screen.findByText(/No active plan yet\./)).toBeInTheDocument();
    // Assistant card still renders empty state.
    expect(await screen.findByText(/No assistant conversations yet/)).toBeInTheDocument();
    // Queue card shows a safe ErrorState — should not show raw backend text.
    const text = container.textContent ?? "";
    expect(text).not.toContain("Queue read failed.");
    expect(text).not.toContain("internal_server_error");
    // The "Ref: req-queue-500" diagnostic is safe to surface.
    await waitFor(() =>
      expect(screen.getByText(/Ref: req-queue-500/)).toBeInTheDocument(),
    );
    assertNoLeak(text);
  });

  test("does NOT consume CP11 routes (learning-state / events) — confirms boundary", async () => {
    const calls = stubByPath({
      "/api/auth/session": jsonResponse({
        user: { id: 9, email: "u@example.com", fullName: "U" },
      }),
      "/api/sola/profile": notFoundJson(),
      "/api/plans/active": notFoundJson(),
      "/api/plans/queue": jsonResponse([]),
      "/api/plans": jsonResponse([]),
      "/api/assistant/conversations": jsonResponse([]),
    });
    render(<HomePageClient />, { wrapper: makeQueryWrapper() });
    // Wait for the Home tree to settle. With profile=missing, the next-action
    // headline is "Complete your profile." (per the priority order).
    await screen.findByText("Complete your profile.");
    const cp11Calls = calls.filter(
      (c) => c.url.includes("/learning-state") || c.url.includes("/events"),
    );
    expect(cp11Calls).toEqual([]);
  });
});
