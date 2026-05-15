import { z } from "zod";

/**
 * B1.CP11 — Learning state contract.
 *
 * Mirrors backend `app/schemas/user_learning_state.py:UserLearningStateResponse`
 * (read-only). The backend response carries five untyped dicts plus
 * `user_id`:
 *   - `topic_familiarity`
 *   - `topic_families`
 *   - `source_profile_snapshot`
 *   - `source_event_summary`
 *   - `profile_alignment`
 * — all of which are internal aggregations and MUST be stripped before the
 * browser sees them. The dedicated CP11 GET handler at
 * `/api/learning-state` runs this adapter server-side.
 */

export const userLearningStateResponseSchema = z
  .object({
    id: z.number().int(),
    user_id: z.number().int(),
    dominant_interests: z.array(z.string()),
    emerging_interests: z.array(z.string()),
    covered_topics: z.array(z.string()),
    topic_familiarity: z.unknown().optional(),
    topic_families: z.unknown().optional(),
    current_focus: z.string().nullish(),
    preferred_content_type: z.string().nullish(),
    preferred_course_length: z.string().nullish(),
    effective_preferred_language: z.string().nullish(),
    engagement_score: z.number().int(),
    source_profile_snapshot: z.unknown().optional(),
    source_event_summary: z.unknown().optional(),
    profile_alignment: z.unknown().optional(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .passthrough();
export type UserLearningStateResponse = z.infer<typeof userLearningStateResponseSchema>;

const PREFERRED_CONTENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  video: "Video",
  text: "Text",
  audio: "Audio",
  interactive: "Interactive",
  mixed: "Mixed formats",
};
const PREFERRED_COURSE_LENGTH_LABELS: Readonly<Record<string, string>> = {
  short: "Short (under 1 hour)",
  medium: "Medium (1–4 hours)",
  long: "Long (4+ hours)",
  any: "Any length",
};
const PREFERRED_LANGUAGE_LABELS: Readonly<Record<string, string>> = {
  ar: "Arabic",
  en: "English",
  any: "Any",
};

function safeLabel(value: string, map: Readonly<Record<string, string>>): string {
  const direct = map[value];
  if (direct) return direct;
  return value
    .replace(/[_\-]+/g, " ")
    .toLowerCase()
    .replace(/(^|\s)\w/g, (m) => m.toUpperCase());
}

export type PublicLearningState = {
  /** Stable id used only for query cache keys; not a product copy field. */
  id: number;
  dominantInterests: string[];
  emergingInterests: string[];
  /** All covered topics. */
  coveredTopicsCount: number;
  /** Up to 10 most recent topics shown as chips. */
  coveredTopicsPreview: string[];
  currentFocus: string | null;
  preferredContentTypeLabel: string | null;
  preferredCourseLengthLabel: string | null;
  preferredLanguageLabel: string | null;
  /** Backend engagement score, integer. Shown as a small label only. */
  engagementScore: number;
  createdAt: string;
  updatedAt: string;
};

export function toPublicLearningState(
  s: UserLearningStateResponse,
): PublicLearningState {
  return {
    id: s.id,
    dominantInterests: s.dominant_interests,
    emergingInterests: s.emerging_interests,
    coveredTopicsCount: s.covered_topics.length,
    coveredTopicsPreview: s.covered_topics.slice(0, 10),
    currentFocus: s.current_focus ?? null,
    preferredContentTypeLabel: s.preferred_content_type
      ? safeLabel(s.preferred_content_type, PREFERRED_CONTENT_TYPE_LABELS)
      : null,
    preferredCourseLengthLabel: s.preferred_course_length
      ? safeLabel(s.preferred_course_length, PREFERRED_COURSE_LENGTH_LABELS)
      : null,
    preferredLanguageLabel: s.effective_preferred_language
      ? safeLabel(s.effective_preferred_language, PREFERRED_LANGUAGE_LABELS)
      : null,
    engagementScore: s.engagement_score,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}
