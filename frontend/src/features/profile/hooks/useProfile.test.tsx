import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useProfile } from "./useProfile";
import { makeQueryWrapper } from "@/test/react-query-wrapper";

const sampleProfile = {
  id: 1,
  user_id: 266,
  background_track: "software_engineering",
  primary_track: "frontend",
  secondary_tracks: ["typescript", "testing"],
  target_role: "Frontend Engineer",
  experience_level: "mid",
  employment_status: "employed",
  is_student: false,
  education_major: "computer_science",
  weekly_hours: 10,
  goal: "Build production-ready apps.",
  preferred_language: "en",
  bio: null,
  timezone: "Asia/Riyadh",
  created_at: "2026-05-13T08:00:00Z",
  updated_at: "2026-05-13T08:00:00Z",
};

describe("useProfile", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  test("200 maps backend payload to PublicProfile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(sampleProfile), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const { result } = renderHook(() => useProfile(), { wrapper: makeQueryWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data!;
    expect(data.kind).toBe("loaded");
    if (data.kind !== "loaded") return;
    expect(data.profile.id).toBe(1);
    expect(data.profile.backgroundTrack).toBe("software_engineering");
    expect(data.profile.secondaryTracks).toEqual(["typescript", "testing"]);
    expect(data.profile.targetRole).toBe("Frontend Engineer");
    expect(data.profile.isStudent).toBe(false);
    expect(data.profile.weeklyHours).toBe(10);
  });

  test("404 returns the 'missing' sentinel and is NOT treated as an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ detail: "Profile not found", error_code: "not_found" }),
          { status: 404, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const { result } = renderHook(() => useProfile(), { wrapper: makeQueryWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.kind).toBe("missing");
  });

  test("401 propagates as a BackendError (auth required)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ detail: "Not authenticated" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const { result } = renderHook(() => useProfile(), { wrapper: makeQueryWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.status).toBe(401);
    expect(result.current.error?.intent).toBe("login");
  });

  test("response shape contains no token fields", async () => {
    let captured: string = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const res = new Response(JSON.stringify(sampleProfile), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
        captured = await res.clone().text();
        return res;
      }),
    );
    renderHook(() => useProfile(), { wrapper: makeQueryWrapper() });
    await waitFor(() => expect(captured.length).toBeGreaterThan(0));
    expect(captured).not.toContain("access_token");
    expect(captured).not.toContain("refresh_token");
    expect(captured).not.toContain("session_id");
  });
});
