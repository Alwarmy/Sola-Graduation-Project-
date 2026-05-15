import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ProfileForm } from "./ProfileForm";
import { BackendError } from "@/lib/errors/backend-error";

const TOKEN_SENTINELS = ["access_token", "refresh_token", "session_id"] as const;
const INTERNAL_WORDS = [
  "ingest",
  "raw scraped",
  "pipeline",
  "admin console",
  "api_key",
  "stack trace",
  "traceback",
] as const;

function assertNoLeak(text: string) {
  for (const t of TOKEN_SENTINELS) expect(text).not.toContain(t);
  const lower = text.toLowerCase();
  for (const w of INTERNAL_WORDS) expect(lower).not.toContain(w);
  // value-leak sentinels: must never render the literal words.
  expect(text).not.toMatch(/\bnull\b/);
  expect(text).not.toMatch(/\bundefined\b/);
  expect(text).not.toMatch(/NaN/);
}

function makeState() {
  return {
    mutate: vi.fn(),
    isPending: false,
    error: null as Error | null,
  };
}

describe("ProfileForm — create mode", () => {
  let state: ReturnType<typeof makeState>;
  beforeEach(() => (state = makeState()));
  afterEach(() => vi.unstubAllGlobals());

  test("renders required fields safely (no token/internal/raw leaks)", async () => {
    const { container } = render(<ProfileForm mode="create" state={state} />);
    expect(await screen.findByLabelText(/goal/i)).toBeInTheDocument();
    expect(await screen.findByLabelText(/background/i)).toBeInTheDocument();
    expect(await screen.findByLabelText(/employment status/i)).toBeInTheDocument();
    expect(await screen.findByLabelText(/weekly study hours/i)).toBeInTheDocument();
    expect(await screen.findByLabelText(/preferred language/i)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /save profile/i })).toBeInTheDocument();
    assertNoLeak(container.textContent ?? "");
  });

  test("client-side validation blocks empty required fields; no mutation fires", async () => {
    const user = userEvent.setup();
    render(<ProfileForm mode="create" state={state} />);
    // Clear the default weekly_hours so all required validators trip predictably.
    const weekly = (await screen.findByLabelText(/weekly study hours/i)) as HTMLInputElement;
    await user.clear(weekly);
    await user.click(await screen.findByRole("button", { name: /save profile/i }));
    expect(state.mutate).not.toHaveBeenCalled();
  });

  test("valid payload calls mutate with the expected snake_case shape", async () => {
    const user = userEvent.setup();
    render(<ProfileForm mode="create" state={state} />);
    // Enum fields default to the first valid backend option (see profile-options.ts);
    // a user can change them via Select but for the happy path defaults suffice.
    const weekly = (await screen.findByLabelText(/weekly study hours/i)) as HTMLInputElement;
    await user.clear(weekly);
    await user.type(weekly, "10");
    await user.click(await screen.findByRole("button", { name: /save profile/i }));

    expect(state.mutate).toHaveBeenCalledTimes(1);
    const [payload] = state.mutate.mock.calls[0]!;
    // Defaults come from the locked enum option arrays.
    expect(payload).toMatchObject({
      goal: "job",
      background_track: "software_engineering",
      employment_status: "employed",
      weekly_hours: 10,
      is_student: false,
      preferred_language: "en",
      secondary_tracks: [],
    });
    // All optional fields should be null or empty array, never undefined leaking.
    expect(payload.primary_track).toBeNull();
    expect(payload.target_role).toBeNull();
    expect(payload.bio).toBeNull();
  });

  test("422 backend validation renders SAFE summary, raw detail never leaks", async () => {
    state.error = new BackendError({
      status: 422,
      detail: "Request validation failed.",
      errorCode: "request_validation_error",
      requestId: "req-v",
      details: {
        errors: [
          { type: "value_error", loc: ["body", "weekly_hours"], msg: "Must be between 1 and 80" },
        ],
      },
    });
    const { container } = render(<ProfileForm mode="create" state={state} />);
    expect(await screen.findByText(/Weekly Hours: Must be between 1 and 80/)).toBeInTheDocument();
    // The raw backend `detail` string is not rendered.
    expect(screen.queryByText(/Request validation failed\./)).not.toBeInTheDocument();
    assertNoLeak(container.textContent ?? "");
  });

  test("backend 401 renders safe sign-in copy, never the raw detail", async () => {
    state.error = new BackendError({
      status: 401,
      detail: "Not authenticated",
      errorCode: "not_authenticated",
      requestId: "req-401",
    });
    const { container } = render(<ProfileForm mode="create" state={state} />);
    // Should render the locked FALLBACK.signInRequired safe copy.
    expect(await screen.findByText(/Please sign in/i)).toBeInTheDocument();
    expect(screen.queryByText(/Not authenticated/)).not.toBeInTheDocument();
    expect(screen.queryByText(/not_authenticated/)).not.toBeInTheDocument();
    assertNoLeak(container.textContent ?? "");
  });
});

describe("ProfileForm — update mode", () => {
  let state: ReturnType<typeof makeState>;
  beforeEach(() => (state = makeState()));

  test("pre-fills with provided profile and submits via mutate", async () => {
    // Use valid backend enum values so the form passes Zod gate without
    // changes. The point of this test is to verify pre-fill + submit.
    const initial = {
      id: 5,
      userId: 266,
      backgroundTrack: "software_engineering",
      primaryTrack: "software_engineering",
      secondaryTracks: ["data_science"],
      targetRole: "Senior Frontend Engineer",
      experienceLevel: "advanced",
      employmentStatus: "employed",
      isStudent: false,
      educationMajor: null,
      weeklyHours: 12,
      goal: "job",
      preferredLanguage: "en",
      bio: null,
      timezone: "Asia/Riyadh",
      createdAt: "2026-05-13T08:00:00Z",
      updatedAt: "2026-05-13T08:00:00Z",
    };
    const user = userEvent.setup();
    render(<ProfileForm mode="update" initial={initial} state={state} />);
    const goalSelect = (await screen.findByLabelText(/goal/i)) as HTMLSelectElement;
    expect(goalSelect.value).toBe("job");
    // Change goal to a different valid enum value.
    await user.selectOptions(goalSelect, "skill_growth");
    await user.click(await screen.findByRole("button", { name: /update profile/i }));
    expect(state.mutate).toHaveBeenCalled();
    const [payload] = state.mutate.mock.calls[0]!;
    expect(payload.goal).toBe("skill_growth");
    expect(payload.weekly_hours).toBe(12);
  });
});
