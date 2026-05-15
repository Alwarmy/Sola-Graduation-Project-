import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProfileSummary } from "./ProfileSummary";
import type { PublicProfile } from "@/lib/contracts/profile";

const fullProfile: PublicProfile = {
  id: 1,
  userId: 266,
  backgroundTrack: "software_engineering",
  primaryTrack: "frontend",
  secondaryTracks: ["typescript", "testing"],
  targetRole: "Senior Frontend Engineer",
  experienceLevel: "senior",
  employmentStatus: "employed",
  isStudent: false,
  educationMajor: "computer_science",
  weeklyHours: 12,
  goal: "Build production apps.",
  preferredLanguage: "en",
  bio: null,
  timezone: "Asia/Riyadh",
  createdAt: "2026-05-13T08:00:00Z",
  updatedAt: "2026-05-13T08:30:00Z",
};

describe("ProfileSummary", () => {
  test("renders backend values humanized; no raw snake_case in rendered text", async () => {
    const { container } = render(<ProfileSummary profile={fullProfile} />);
    // Pre-CP8 hardening D-2: prefers safe sentence-case TRACK_LABELS over
    // naïve humanize Title-Case.
    expect(await screen.findByText(/Software engineering/)).toBeInTheDocument();
    // Secondary tracks: unknown values still humanize (no map entry for
    // "typescript"/"testing"), but the join formatting and safe rendering
    // are preserved.
    expect(await screen.findByText(/Typescript, Testing/)).toBeInTheDocument();
    // Backend-provided "senior" humanized to "Senior" (exact match, not the
    // longer "Senior Frontend Engineer" target_role text).
    expect(await screen.findByText(/^Senior$/)).toBeInTheDocument();
    // Weekly hours formatted with locale + "h" suffix.
    expect(await screen.findByText(/12 h/)).toBeInTheDocument();
    // No raw snake_case anywhere in the rendered text.
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/software_engineering/);
    expect(text).not.toMatch(/computer_science/);
  });

  test("missing optional fields render 'Not available' instead of raw null/undefined", async () => {
    const minimal: PublicProfile = {
      ...fullProfile,
      primaryTrack: null,
      secondaryTracks: [],
      targetRole: null,
      experienceLevel: null,
      educationMajor: null,
      bio: null,
    };
    const { container } = render(<ProfileSummary profile={minimal} />);
    // Multiple "Not available" labels are expected.
    const matches = screen.getAllByText(/Not available/);
    expect(matches.length).toBeGreaterThan(0);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\bnull\b/);
    expect(text).not.toMatch(/\bundefined\b/);
    expect(text).not.toMatch(/NaN/);
  });

  test("Pre-CP8 hardening D-2: goal 'job' renders as 'Job', preferredLanguage 'en' renders as 'English'", async () => {
    const profile: PublicProfile = {
      ...fullProfile,
      goal: "job",
      preferredLanguage: "en",
    };
    const { container } = render(<ProfileSummary profile={profile} />);
    // Title-cased / human-readable labels — NOT raw enum keys.
    expect(await screen.findByText("Job")).toBeInTheDocument();
    expect(await screen.findByText("English")).toBeInTheDocument();
    const text = container.textContent ?? "";
    // Tightened: the literal short codes must not appear standalone in the
    // rendered text (allowing them inside longer words such as "En" inside
    // "Engineer" is fine; we assert the raw enum surface "En " or " En" doesn't render).
    expect(text).not.toMatch(/(^|[\s>])En([\s<.,]|$)/);
  });

  test("Pre-CP8 hardening D-3: ai_ml track renders as 'AI / ML', not 'Ai Ml'", async () => {
    const profile: PublicProfile = {
      ...fullProfile,
      backgroundTrack: "ai_ml",
      primaryTrack: "ai_ml",
      secondaryTracks: ["ai_ml"],
    };
    const { container } = render(<ProfileSummary profile={profile} />);
    // Multiple "AI / ML" appearances (background + primary + secondary).
    const matches = screen.getAllByText("AI / ML");
    expect(matches.length).toBeGreaterThanOrEqual(2);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/Ai Ml/);
    expect(text).not.toMatch(/\bai_ml\b/);
  });

  test("Pre-CP8 hardening D-2: arabic language renders as 'Arabic'", () => {
    const profile: PublicProfile = { ...fullProfile, preferredLanguage: "ar" };
    render(<ProfileSummary profile={profile} />);
    expect(screen.getByText("Arabic")).toBeInTheDocument();
    expect(screen.queryByText(/^Ar$/)).not.toBeInTheDocument();
  });
});
