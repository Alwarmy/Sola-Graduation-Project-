import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ProgressPageClient } from "./ProgressPageClient";
import { makeQueryWrapper } from "@/test/react-query-wrapper";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={String(href)} {...rest}>
      {children}
    </a>
  ),
}));

const TOKEN_SENTINELS = [
  "access_token",
  "refresh_token",
  "session_id",
  "sola_access",
  "sola_refresh",
] as const;
const INTERNAL_LEAK = [
  "signal_value",
  "signal_metadata",
  "request_payload",
  "preview_payload",
  "result_payload",
  "used_context_summary",
  "context_snapshot",
  "message_metadata",
  "conversation_metadata",
  "topic_familiarity",
  "topic_families",
  "source_profile_snapshot",
  "source_event_summary",
  "profile_alignment",
  "event_payload",
  "provider_metadata",
  "quality_signals",
] as const;

function assertNoLeak(text: string) {
  for (const s of TOKEN_SENTINELS) expect(text).not.toContain(s);
  const lower = text.toLowerCase();
  for (const w of INTERNAL_LEAK) expect(lower).not.toContain(w);
  expect(text).not.toMatch(/\bnull\b/);
  expect(text).not.toMatch(/\bundefined\b/);
  expect(text).not.toMatch(/NaN/);
}

// ─── fetch stub helpers ──────────────────────────────────────────────────

type StubMap = Record<string, () => Response>;

function stubByPath(map: StubMap) {
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      const candidates = Object.keys(map)
        .filter((k) => url.includes(k))
        .sort((a, b) => b.length - a.length);
      if (candidates.length > 0) return map[candidates[0]!]!();
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
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

// ─── Public-shape fixtures (what the dedicated handlers produce) ──────

const publicLearningState = {
  id: 1,
  dominantInterests: ["python", "data-science"],
  emergingInterests: ["typescript"],
  coveredTopicsCount: 12,
  coveredTopicsPreview: ["variables", "loops", "functions"],
  currentFocus: "python",
  preferredContentTypeLabel: "Video",
  preferredCourseLengthLabel: "Medium (1–4 hours)",
  preferredLanguageLabel: "English",
  engagementScore: 42,
  createdAt: "2026-05-14T09:00:00Z",
  updatedAt: "2026-05-14T09:00:00Z",
};

const publicEventsList = [
  {
    id: 100,
    eventType: "course_opened",
    eventTypeLabel: "Opened a course",
    isKnownEventType: true,
    createdAt: "2026-05-14T09:00:00Z",
  },
  {
    id: 101,
    eventType: "future_unknown_event",
    eventTypeLabel: "Learning activity",
    isKnownEventType: false,
    createdAt: "2026-05-14T08:30:00Z",
  },
];

const publicActivePlan = {
  id: 205,
  title: "Progress audit plan",
  goal: "Verify CP11 progress page",
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
};

const publicExecutionSummaryH1 = {
  planId: 205,
  planStatus: "active",
  planStatusLabel: "Active",
  totalItems: 81,
  pendingItemsCount: 80,
  inProgressItemsCount: 0,
  completedItemsCount: 1,
  skippedItemsCount: 0,
  overdueItemsCount: 0,
  dueTodayItemsCount: 4,
  completionRate: 1,
  completionRateLabel: "100%",
  isPlanFinished: false,
  canMarkCompleted: false,
  nextActionableItemId: null,
  nextActionableScheduledDate: null,
  nextActionableTitle: null,
};

const publicRecoveryOnTrack = {
  planId: 205,
  planVersion: 2,
  scheduleRevision: 1,
  planStatus: "active",
  planStatusLabel: "Active",
  missedStudySlotsCount: 0,
  overdueItemsCount: 0,
  overdueMinutes: 0,
  dueTodayItemsCount: 0,
  remainingPendingItemsCount: 80,
  remainingPendingMinutes: 2400,
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

describe("ProgressPageClient (CP11)", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  test("anonymous: ProtectedState with sign-in CTA; no learning-state/events/plan/assistant fetch", async () => {
    const calls = stubByPath({
      "/api/auth/session": jsonResponse({ user: null }),
    });
    const { container } = render(<ProgressPageClient />, { wrapper: makeQueryWrapper() });
    expect(await screen.findByText(/Sign in to view your progress\./)).toBeInTheDocument();
    expect(screen.getByText("Sign in").getAttribute("href")).toBe("/login");
    // Anonymous progress must NOT trigger any authed fetch.
    const authedCalls = calls.filter(
      (c) =>
        c.url.includes("/api/learning-state") ||
        c.url.includes("/api/events") ||
        c.url.includes("/api/plans") ||
        c.url.includes("/api/assistant/"),
    );
    expect(authedCalls).toEqual([]);
    assertNoLeak(container.textContent ?? "");
  });

  test("authed + no active plan: NextAction headlines Start a plan; Plan-progress card shows no-plan empty state; learning-state empty + Refresh button visible", async () => {
    stubByPath({
      "/api/auth/session": jsonResponse({
        user: { id: 9, email: "u@example.com", fullName: "U" },
      }),
      "/api/learning-state/refresh": jsonResponse(publicLearningState),
      "/api/learning-state": notFoundJson("Not found"),
      "/api/events": jsonResponse([]),
      "/api/plans/active": notFoundJson("No active plan"),
    });
    const { container } = render(<ProgressPageClient />, { wrapper: makeQueryWrapper() });
    expect(
      await screen.findByText("Start a plan to begin tracking progress."),
    ).toBeInTheDocument();
    // Learning state empty CTA is the Refresh button.
    expect(await screen.findByRole("button", { name: /Refresh learning state/ })).toBeInTheDocument();
    // Events empty
    expect(await screen.findByText(/No recent activity yet/)).toBeInTheDocument();
    // Plan progress card: no-plan empty state.
    expect(await screen.findByText(/No active plan yet/)).toBeInTheDocument();
    assertNoLeak(container.textContent ?? "");
  });

  test("authed + active plan + H-1 summary: counts visible; completionRateLabel NEVER rendered; events + learning state rendered safely", async () => {
    stubByPath({
      "/api/auth/session": jsonResponse({
        user: { id: 9, email: "u@example.com", fullName: "U" },
      }),
      "/api/learning-state/refresh": jsonResponse(publicLearningState),
      "/api/learning-state": jsonResponse(publicLearningState),
      "/api/events": jsonResponse(publicEventsList),
      "/api/plans/active": jsonResponse(publicActivePlan),
      "/api/plans/205/execution-summary": jsonResponse(publicExecutionSummaryH1),
      "/api/plans/205/recovery-preview": jsonResponse(publicRecoveryOnTrack),
    });
    const { container } = render(<ProgressPageClient />, { wrapper: makeQueryWrapper() });

    // Learning-state card
    expect(await screen.findByText(/Current focus: python/)).toBeInTheDocument();
    expect((await screen.findAllByText(/Video/)).length).toBeGreaterThan(0);
    expect(await screen.findByText(/Engagement 42/)).toBeInTheDocument();

    // Events: known + unknown
    expect(await screen.findByText("Opened a course")).toBeInTheDocument();
    expect(await screen.findByText("Learning activity")).toBeInTheDocument();

    // H-1 SAFE: counts visible; completionRateLabel ("100%") not in DOM.
    expect((await screen.findAllByText("81")).length).toBeGreaterThan(0); // total
    expect((await screen.findAllByText("80")).length).toBeGreaterThan(0); // pending
    expect((await screen.findAllByText("1")).length).toBeGreaterThan(0); // completed
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/100%/);
    expect(text).not.toMatch(/99%/);
    expect(text).not.toMatch(/Backend reports completion rate/);
    const h1Note = container.querySelector("[data-testid='progress-h1-safe-note']");
    expect(h1Note).not.toBeNull();
    expect(h1Note?.textContent ?? "").toContain("under review");

    // Recovery on track
    expect(await screen.findByText(/You're on track right now\./)).toBeInTheDocument();

    assertNoLeak(text);
  });

  test("Refresh learning state requires explicit click; no auto-call on mount; POSTs to /api/learning-state/refresh", async () => {
    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        calls.push({ url, method });
        if (url.endsWith("/api/auth/session")) {
          return new Response(
            JSON.stringify({ user: { id: 9, email: "u@example.com", fullName: "U" } }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes("/api/learning-state/refresh")) {
          return new Response(JSON.stringify(publicLearningState), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.endsWith("/api/learning-state")) {
          return new Response(
            JSON.stringify({ detail: "not found", error_code: "not_found" }),
            { status: 404, headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes("/api/events")) {
          return new Response("[]", {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("/api/plans/active")) {
          return new Response(
            JSON.stringify({ detail: "Not found", error_code: "not_found" }),
            { status: 404, headers: { "content-type": "application/json" } },
          );
        }
        return new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const user = userEvent.setup();
    render(<ProgressPageClient />, { wrapper: makeQueryWrapper() });
    const refreshBtn = await screen.findByRole("button", { name: /Refresh learning state/ });
    // No /refresh call before user clicks.
    expect(calls.some((c) => c.url.includes("/api/learning-state/refresh"))).toBe(false);
    await user.click(refreshBtn);
    await waitFor(() =>
      expect(
        calls.some((c) => c.url.includes("/api/learning-state/refresh") && c.method === "POST"),
      ).toBe(true),
    );
  });

  test("partial failure: events 500 keeps the rest of /progress rendered; raw backend detail not leaked", async () => {
    stubByPath({
      "/api/auth/session": jsonResponse({
        user: { id: 9, email: "u@example.com", fullName: "U" },
      }),
      "/api/learning-state": jsonResponse(publicLearningState),
      "/api/events": () =>
        new Response(
          JSON.stringify({
            detail: "Events read failed.",
            error_code: "internal_server_error",
            request_id: "req-e-500",
          }),
          { status: 500, headers: { "content-type": "application/json" } },
        ),
      "/api/plans/active": notFoundJson(),
    });
    const { container } = render(<ProgressPageClient />, { wrapper: makeQueryWrapper() });
    // Learning state still renders.
    expect(await screen.findByText(/Current focus: python/)).toBeInTheDocument();
    // No-plan card still renders.
    expect(await screen.findByText(/No active plan yet/)).toBeInTheDocument();
    // Events ErrorState — raw backend text not leaked.
    const text = container.textContent ?? "";
    expect(text).not.toContain("Events read failed.");
    expect(text).not.toContain("internal_server_error");
    // Ref: request-id is allowed as safe diagnostic.
    await waitFor(() =>
      expect(screen.getByText(/Ref: req-e-500/)).toBeInTheDocument(),
    );
    assertNoLeak(text);
  });

  test("unknown event types render as 'Learning activity'; raw event_type not shown", async () => {
    stubByPath({
      "/api/auth/session": jsonResponse({
        user: { id: 9, email: "u@example.com", fullName: "U" },
      }),
      "/api/learning-state": notFoundJson(),
      "/api/events": jsonResponse([
        {
          id: 200,
          eventType: "totally_new_action",
          eventTypeLabel: "Learning activity",
          isKnownEventType: false,
          createdAt: "2026-05-14T09:00:00Z",
        },
      ]),
      "/api/plans/active": notFoundJson(),
    });
    const { container } = render(<ProgressPageClient />, { wrapper: makeQueryWrapper() });
    expect(await screen.findByText("Learning activity")).toBeInTheDocument();
    // Raw snake_case event type must not appear in the DOM.
    const text = container.textContent ?? "";
    expect(text).not.toContain("totally_new_action");
    assertNoLeak(text);
  });
});
