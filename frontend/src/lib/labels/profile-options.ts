/**
 * Profile enum option lists, sourced from the backend reference v3.1 §enums
 * (`BACKGROUND_TRACK_OPTIONS`, `EXPERIENCE_LEVEL_OPTIONS`,
 * `EMPLOYMENT_STATUS_OPTIONS`, `GOAL_OPTIONS`, `PREFERRED_LANGUAGE_OPTIONS`).
 *
 * The OpenAPI snapshot types these fields as plain strings, but the backend
 * validates them as enums and rejects unknown values with
 * `error_code: "validation_error"` (observed at runtime in CP5). These
 * arrays drive the Select dropdowns in `ProfileForm` so the form can never
 * submit an invalid value.
 *
 * The `value` is the wire value sent to the backend (snake_case).
 * The user-facing label is computed at render time via `humanize(value)`
 * so this file stays free of UI copy.
 */

import { humanize } from "@/lib/labels/humanize";

export const BACKGROUND_TRACK_OPTIONS = [
  "software_engineering",
  "web_development",
  "mobile_development",
  "data_science",
  "ai_ml",
  "cybersecurity",
  "accounting",
  "economics",
  "finance",
  "business",
  "marketing",
  "design",
  "physics",
  "mathematics",
  "medicine",
  "law",
  "education",
  "other",
] as const;
export type BackgroundTrack = (typeof BACKGROUND_TRACK_OPTIONS)[number];

// Backend uses the same TRACK_OPTIONS list for primary_track + secondary_tracks.
export const TRACK_OPTIONS = BACKGROUND_TRACK_OPTIONS;
export type Track = BackgroundTrack;

export const EXPERIENCE_LEVEL_OPTIONS = ["beginner", "intermediate", "advanced"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVEL_OPTIONS)[number];

export const EMPLOYMENT_STATUS_OPTIONS = ["employed", "unemployed", "job_seeker"] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUS_OPTIONS)[number];

export const GOAL_OPTIONS = ["job", "freelance", "academic", "project", "skill_growth", "general"] as const;
export type Goal = (typeof GOAL_OPTIONS)[number];

export const PREFERRED_LANGUAGE_OPTIONS = ["ar", "en", "any"] as const;
export type PreferredLanguage = (typeof PREFERRED_LANGUAGE_OPTIONS)[number];

// ─── User-safe labels (Pre-CP8 hardening D-2, D-3) ─────────────────────────
//
// Naïve `humanize("ai_ml")` produces "Ai Ml" and `humanize("en")` produces
// "En" — both fail the user-safe-copy bar. These maps win over humanize at
// every label call site (ProfileSummary, ProfileForm, future readouts).

export const TRACK_LABELS: Readonly<Record<string, string>> = {
  software_engineering: "Software engineering",
  web_development: "Web development",
  mobile_development: "Mobile development",
  data_science: "Data science",
  ai_ml: "AI / ML",
  cybersecurity: "Cybersecurity",
  accounting: "Accounting",
  economics: "Economics",
  finance: "Finance",
  business: "Business",
  marketing: "Marketing",
  design: "Design",
  physics: "Physics",
  mathematics: "Mathematics",
  medicine: "Medicine",
  law: "Law",
  education: "Education",
  other: "Other",
};

export const EXPERIENCE_LEVEL_LABELS: Readonly<Record<string, string>> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const EMPLOYMENT_STATUS_LABELS: Readonly<Record<string, string>> = {
  employed: "Employed",
  unemployed: "Unemployed",
  job_seeker: "Job seeker",
};

export const GOAL_LABELS: Readonly<Record<string, string>> = {
  job: "Job",
  freelance: "Freelance",
  academic: "Academic",
  project: "Project",
  skill_growth: "Skill growth",
  general: "General",
};

export const PREFERRED_LANGUAGE_LABELS: Readonly<Record<string, string>> = {
  ar: "Arabic",
  en: "English",
  any: "Any",
};

/** Look up a label from one of the maps above; humanize as last resort. */
function labelFromMap(value: string, map: Readonly<Record<string, string>>): string {
  const direct = map[value];
  if (direct) return direct;
  return humanize(value);
}

export function trackLabel(value: string | null | undefined): string {
  if (typeof value !== "string" || value.trim().length === 0) return humanize(value);
  return labelFromMap(value.trim(), TRACK_LABELS);
}

export function experienceLevelLabel(value: string | null | undefined): string {
  if (typeof value !== "string" || value.trim().length === 0) return humanize(value);
  return labelFromMap(value.trim(), EXPERIENCE_LEVEL_LABELS);
}

export function employmentStatusLabel(value: string | null | undefined): string {
  if (typeof value !== "string" || value.trim().length === 0) return humanize(value);
  return labelFromMap(value.trim(), EMPLOYMENT_STATUS_LABELS);
}

export function goalLabel(value: string | null | undefined): string {
  if (typeof value !== "string" || value.trim().length === 0) return humanize(value);
  return labelFromMap(value.trim(), GOAL_LABELS);
}

export function preferredLanguageLabel(value: string | null | undefined): string {
  if (typeof value !== "string" || value.trim().length === 0) return humanize(value);
  return labelFromMap(value.trim(), PREFERRED_LANGUAGE_LABELS);
}
