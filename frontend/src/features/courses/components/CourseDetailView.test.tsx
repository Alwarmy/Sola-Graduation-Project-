import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { PublicCourseCard } from "@/lib/contracts/courses";

// ---- Hook mocks ------------------------------------------------------------
//
// CourseDetailView pulls from `useSession`, `useCourseDetail`,
// `useCourseStructure`, `useCourseUnits`. None of those are the unit
// under test here — D-4 is purely about rendering. So we mock them with
// stable fixtures, render the component, and assert UI-level invariants.

const sampleCourse: PublicCourseCard = {
  id: 7,
  title: "Python Tutorial 2026",
  source: "youtube",
  providerDisplayName: "YouTube",
  contentFormatLabel: "Playlist course",
  difficultyLabel: "Advanced",
  durationLabel: "13h 45m estimated",
  pricingLabel: "Free",
  instructorDisplayName: "Telusko",
  language: "en",
  topicTagLabels: ["Python"],
  progressionLabel: "Specialization",
  qualityTier: "high",
  cardSummary: "Playlist course • Advanced • 13h 45m estimated • Free • By Telusko",
  shortDescription: "Welcome.",
  description: null,
  url: "https://www.youtube.com/playlist?list=abc",
  thumbnailUrl: null,
  badges: [
    { key: "content_format", label: "Playlist course", tone: "info" },
    { key: "pricing", label: "Free", tone: "success" },
    { key: "quality", label: "High quality", tone: "success" },
  ],
};

vi.mock("@/features/auth/hooks/useSession", () => ({
  useSession: () => ({ data: { user: null }, isLoading: false }),
}));

vi.mock("@/features/courses/hooks/useCourseDetail", () => ({
  useCourseDetail: () => ({
    isLoading: false,
    isError: false,
    error: null,
    data: { kind: "found", course: sampleCourse },
  }),
}));

vi.mock("@/features/courses/hooks/useCourseStructure", () => ({
  useCourseStructure: () => ({ isLoading: false, isError: false, error: null, data: null }),
  useCourseUnits: () => ({ isLoading: false, isError: false, error: null, data: null }),
}));

// AddToQueueButton in turn calls useSession + posts to /api/plans/queue.
// Mock it with a noop so the test stays focused on D-4.
vi.mock("@/features/plans/components/AddToQueueButton", () => ({
  AddToQueueButton: () => null,
}));

import { CourseDetailView } from "./CourseDetailView";

describe("CourseDetailView (Pre-CP8 hardening D-4 — quality tier raw value)", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  test("does NOT render a standalone raw 'high' quality badge", () => {
    const { container } = render(<CourseDetailView courseId="7" />);
    const text = container.textContent ?? "";
    // Backend `badges` includes the safe label "High quality" — that's
    // allowed (it's the canonical user-safe surface).
    expect(screen.getByText("High quality")).toBeInTheDocument();
    // The raw qualityTier string ("high") must NOT appear standalone
    // anywhere — the hardening hid the duplicate raw-tier header badge.
    expect(text).not.toMatch(/(^|[\s>])high([\s<.,]|$)/);
  });

  test("renders backend-built safe badges from `badges` array", () => {
    render(<CourseDetailView courseId="7" />);
    expect(screen.getByText("Playlist course")).toBeInTheDocument();
    expect(screen.getByText("Free")).toBeInTheDocument();
  });
});
