import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StatusControl } from "./StatusControl";
import { makeQueryWrapper } from "@/test/react-query-wrapper";
import type { PublicLearningPlan } from "@/lib/contracts/plans";

const basePlan: PublicLearningPlan = {
  id: 199,
  title: "Master Python",
  goal: "Land a job",
  status: "active",
  statusLabel: "Active",
  version: 4,
  scheduleRevision: 1,
  currentFocusSnapshot: null,
  weeklyHoursSnapshot: 10,
  scheduleTimezoneSnapshot: "Asia/Riyadh",
  createdAt: "2026-05-13T08:00:00Z",
  updatedAt: "2026-05-13T08:30:00Z",
  preference: null,
  courses: [],
};

const TOKEN_LEAK_SENTINELS = ["access_token", "refresh_token", "session_id", "sola_access"] as const;
const RAW_BACKEND_WORDS = [
  "learning_plan version is stale",
  "expected_version_mismatch",
  "precondition_failed",
  "stale_version",
] as const;

function assertNoTokenOrRawLeak(rootText: string) {
  for (const sentinel of TOKEN_LEAK_SENTINELS) {
    expect(rootText).not.toContain(sentinel);
  }
  for (const word of RAW_BACKEND_WORDS) {
    expect(rootText.toLowerCase()).not.toContain(word.toLowerCase());
  }
}

describe("StatusControl (Pre-CP8 hardening D-9 — status conflict UX)", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  test("renders status select + Update button; no token/raw leak", async () => {
    const onRefresh = vi.fn();
    const { container } = render(
      <StatusControl plan={basePlan} onRefresh={onRefresh} />,
      { wrapper: makeQueryWrapper() },
    );
    expect(await screen.findByRole("button", { name: /update status/i })).toBeDisabled();
    assertNoTokenOrRawLeak(container.textContent ?? "");
  });

  test("412 stale-version response shows ConflictPanel, preserves request-id, and disables Update until Refresh", async () => {
    const onRefresh = vi.fn();
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("/api/plans/199/status");
      return new Response(
        JSON.stringify({
          detail: "learning_plan version is stale.",
          error_code: "precondition_failed",
          request_id: "req-stale-status-1",
          details: {
            resource: "learning_plan",
            reason: "stale_version",
            expected_version: 1,
            current_version: 4,
          },
        }),
        {
          status: 412,
          headers: {
            "content-type": "application/json",
            "x-request-id": "req-stale-status-1",
          },
        },
      );
    });
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();
    const { container } = render(
      <StatusControl plan={basePlan} onRefresh={onRefresh} />,
      { wrapper: makeQueryWrapper() },
    );

    // Change the select away from "active" so the Update button enables.
    await user.selectOptions(await screen.findByLabelText(/plan status/i), "paused");
    expect(screen.getByRole("button", { name: /update status/i })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /update status/i }));

    // ConflictPanel renders the safe "stale-refresh" copy + a Refresh button.
    expect(await screen.findByRole("button", { name: /refresh and try again/i })).toBeInTheDocument();
    // request-id surfaces safely (Ref:) for support diagnostics.
    expect(screen.getByText(/Ref: req-stale-status-1/)).toBeInTheDocument();

    // The Update button is now DISABLED while in conflict state so the
    // user can't keep submitting the same stale version.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /update status/i })).toBeDisabled(),
    );

    // No raw backend wording leaked.
    assertNoTokenOrRawLeak(container.textContent ?? "");
    // No silent retry: exactly one mutation call.
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Clicking Refresh triggers the parent invalidator AND clears mutation
    // error state — the Update button re-enables for the (refetched) plan.
    await user.click(screen.getByRole("button", { name: /refresh and try again/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /update status/i })).toBeEnabled(),
    );
  });

  test("409 conflict is also recognized", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          detail: "Plan changed.",
          error_code: "conflict",
          request_id: "req-stale-status-2",
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();
    render(<StatusControl plan={basePlan} onRefresh={() => {}} />, {
      wrapper: makeQueryWrapper(),
    });
    await user.selectOptions(await screen.findByLabelText(/plan status/i), "paused");
    await user.click(screen.getByRole("button", { name: /update status/i }));
    expect(await screen.findByRole("button", { name: /refresh and try again/i })).toBeInTheDocument();
  });

  test("non-conflict 422 routes through ErrorState, not ConflictPanel", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          detail: "Request validation failed.",
          error_code: "request_validation_error",
          request_id: "req-422",
          details: { errors: [{ type: "value_error", loc: ["body", "status"], msg: "bad" }] },
        }),
        { status: 422, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();
    render(<StatusControl plan={basePlan} onRefresh={() => {}} />, {
      wrapper: makeQueryWrapper(),
    });
    await user.selectOptions(await screen.findByLabelText(/plan status/i), "paused");
    await user.click(screen.getByRole("button", { name: /update status/i }));
    // No conflict panel for non-stale errors.
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /refresh and try again/i })).not.toBeInTheDocument();
  });
});
