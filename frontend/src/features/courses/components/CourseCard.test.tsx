import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";

import { CourseCard } from "./CourseCard";
import type { PublicCourseCard } from "@/lib/contracts/courses";

const TOKEN_SENTINELS = ["access_token", "refresh_token", "session_id"] as const;
const INTERNAL_WORDS = [
  "ingest",
  "raw scraped",
  "pipeline",
  "admin console",
  "api_key",
  "stack trace",
  "ingestion_id",
  "total_raw_items",
  "raw_data",
] as const;

function assertSafeText(text: string) {
  for (const t of TOKEN_SENTINELS) expect(text).not.toContain(t);
  const lower = text.toLowerCase();
  for (const w of INTERNAL_WORDS) expect(lower).not.toContain(w);
  expect(text).not.toMatch(/\bnull\b/);
  expect(text).not.toMatch(/\bundefined\b/);
  expect(text).not.toMatch(/NaN/);
}

const samplePublic: PublicCourseCard = {
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
  shortDescription: "Welcome to the Python Tutorial 2026 playlist…",
  description: null,
  url: "https://www.youtube.com/playlist?list=abc",
  thumbnailUrl: null,
  badges: [
    { key: "content_format", label: "Playlist course", tone: "info" },
    { key: "pricing", label: "Free", tone: "success" },
    { key: "difficulty", label: "Advanced", tone: "warning" },
    { key: "quality", label: "High quality", tone: "success" },
  ],
};

describe("CourseCard", () => {
  test("renders title and backend-built labels safely", async () => {
    const { container } = render(<CourseCard course={samplePublic} />);
    expect(await screen.findByText(/Python Tutorial 2026/)).toBeInTheDocument();
    // These labels appear in both the card_summary and a badge — both copies
    // are intentional, so we just assert at least one match.
    expect((await screen.findAllByText(/Playlist course/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Free/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Advanced/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Telusko/)).length).toBeGreaterThan(0);
    assertSafeText(container.textContent ?? "");
  });

  test("missing optional fields render safe fallback, never raw null/undefined", async () => {
    const minimal: PublicCourseCard = {
      ...samplePublic,
      cardSummary: null,
      shortDescription: null,
      description: null,
      instructorDisplayName: null,
      thumbnailUrl: null,
      badges: [],
      topicTagLabels: [],
    };
    const { container } = render(<CourseCard course={minimal} />);
    expect(await screen.findByText(/Python Tutorial 2026/)).toBeInTheDocument();
    // Should fall back to "Not available" for instructor.
    expect(await screen.findByText(/Not available/)).toBeInTheDocument();
    assertSafeText(container.textContent ?? "");
  });

  test("explanationSummary shows when provided (recommendations use case)", async () => {
    render(
      <CourseCard
        course={samplePublic}
        explanationSummary="Recommended because you study Python."
      />,
    );
    expect(
      await screen.findByText(/Recommended because you study Python\./),
    ).toBeInTheDocument();
  });
});
