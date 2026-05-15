import { describe, expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useProfile } from "./hooks/useProfile";
import { makeQueryWrapper } from "@/test/react-query-wrapper";

const TOKEN_KEYS = ["access_token", "refresh_token", "session_id"] as const;
const TOKEN_VALUE_SAMPLES = [
  "eyJhbGciOiJIUzI1NiI", // start of a JWT
  "REF_test_redacted",
];

/**
 * Cross-cutting profile-side guard: the response shape returned by the
 * profile fetch must never include token keys or sample token values,
 * even if the backend (or someone in the chain) accidentally smuggled
 * them. Backend-side guarantee + Auth Gateway HttpOnly cookie boundary
 * already prevent this; this test is the defense-in-depth check.
 */
describe("profile fetch — token leak guard", () => {
  test("a backend response with stray token-looking values surfaces no tokens to consumers", async () => {
    const payloadWithStrayFields = {
      id: 1,
      user_id: 1,
      background_track: "software_engineering",
      employment_status: "employed",
      is_student: false,
      weekly_hours: 5,
      goal: "g",
      preferred_language: "en",
      timezone: "Asia/Riyadh",
      created_at: "2026-05-13T08:00:00Z",
      updated_at: "2026-05-13T08:00:00Z",
      // Strays that should be ignored by our schema (`.parse` strips them).
      access_token: TOKEN_VALUE_SAMPLES[0],
      refresh_token: TOKEN_VALUE_SAMPLES[1],
      session_id: "sid_X",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(payloadWithStrayFields), {
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
    const stringified = JSON.stringify(data.profile);
    for (const key of TOKEN_KEYS) {
      expect(stringified, `profile leaked key ${key}`).not.toContain(key);
    }
    for (const value of TOKEN_VALUE_SAMPLES) {
      expect(stringified, `profile leaked value ${value}`).not.toContain(value);
    }
    vi.unstubAllGlobals();
  });
});
