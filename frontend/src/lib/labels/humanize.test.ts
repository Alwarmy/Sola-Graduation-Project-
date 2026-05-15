import { describe, expect, test } from "vitest";

import { humanize, label } from "@/lib/labels/humanize";
import { FALLBACK } from "@/lib/copy/fallback";
import {
  goalLabel,
  preferredLanguageLabel,
  trackLabel,
  experienceLevelLabel,
  employmentStatusLabel,
} from "@/lib/labels/profile-options";

describe("humanize", () => {
  test("turns snake_case into Title Case", () => {
    expect(humanize("in_progress")).toBe("In Progress");
    expect(humanize("duration_short")).toBe("Duration Short");
    expect(humanize("duration-long")).toBe("Duration Long");
  });

  test("returns fallback for missing values", () => {
    expect(humanize(null)).toBe(FALLBACK.unknown);
    expect(humanize(undefined)).toBe(FALLBACK.unknown);
    expect(humanize("")).toBe(FALLBACK.unknown);
    expect(humanize("   ")).toBe(FALLBACK.unknown);
  });

  test("returns fallback for NaN numbers but renders finite numbers as strings", () => {
    expect(humanize(Number.NaN)).toBe(FALLBACK.unknown);
    expect(humanize(42)).toBe("42");
  });
});

describe("label", () => {
  test("prefers backend-built label when present", () => {
    expect(label("Advanced", () => humanize("advanced"))).toBe("Advanced");
  });

  test("falls back to humanize when backend label is empty", () => {
    expect(label("", () => humanize("in_progress"))).toBe("In Progress");
    expect(label(null, () => humanize("paused"))).toBe("Paused");
  });

  test("falls back to FALLBACK.unknown when both are empty", () => {
    expect(label(null, () => "")).toBe(FALLBACK.unknown);
  });
});

describe("profile-option label helpers (Pre-CP8 hardening D-2, D-3)", () => {
  test("trackLabel special-cases ai_ml as 'AI / ML'", () => {
    expect(trackLabel("ai_ml")).toBe("AI / ML");
    expect(trackLabel("software_engineering")).toBe("Software engineering");
    expect(trackLabel("data_science")).toBe("Data science");
  });

  test("preferredLanguageLabel maps short codes to safe English names", () => {
    expect(preferredLanguageLabel("ar")).toBe("Arabic");
    expect(preferredLanguageLabel("en")).toBe("English");
    expect(preferredLanguageLabel("any")).toBe("Any");
  });

  test("goalLabel humanizes safe key labels", () => {
    expect(goalLabel("job")).toBe("Job");
    expect(goalLabel("skill_growth")).toBe("Skill growth");
  });

  test("experienceLevelLabel + employmentStatusLabel humanize safely", () => {
    expect(experienceLevelLabel("intermediate")).toBe("Intermediate");
    expect(employmentStatusLabel("job_seeker")).toBe("Job seeker");
  });

  test("label helpers fall back to humanize for unknown values; never leak null", () => {
    expect(trackLabel("custom_unknown_value")).toBe("Custom Unknown Value");
    expect(trackLabel(null)).toBe(FALLBACK.unknown);
    expect(goalLabel(undefined)).toBe(FALLBACK.unknown);
  });
});
