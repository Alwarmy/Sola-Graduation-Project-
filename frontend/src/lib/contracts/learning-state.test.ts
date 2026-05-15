import { describe, expect, test } from "vitest";

import {
  toPublicLearningState,
  userLearningStateResponseSchema,
} from "@/lib/contracts/learning-state";

const rawState = {
  id: 1,
  user_id: 275,
  dominant_interests: ["python", "data-science"],
  emerging_interests: ["typescript"],
  covered_topics: ["variables", "loops", "functions", "classes"],
  topic_familiarity: { variables: 0.8, DO_NOT_LEAK: "internal" },
  topic_families: { python: ["variables", "loops"] },
  current_focus: "python",
  preferred_content_type: "video",
  preferred_course_length: "medium",
  effective_preferred_language: "en",
  engagement_score: 42,
  source_profile_snapshot: { DO_NOT_LEAK: "snapshot_internal" },
  source_event_summary: { DO_NOT_LEAK: "event_internal" },
  profile_alignment: { DO_NOT_LEAK: "alignment_internal" },
  created_at: "2026-05-14T09:00:00Z",
  updated_at: "2026-05-14T09:00:00Z",
};

describe("learning-state contracts (B1.CP11)", () => {
  test("schema accepts the backend shape with passthrough", () => {
    const parsed = userLearningStateResponseSchema.parse(rawState);
    expect(parsed.dominant_interests).toEqual(["python", "data-science"]);
  });

  test("toPublicLearningState strips all five internal dicts and user_id; humanizes preference labels", () => {
    const pub = toPublicLearningState(rawState);
    expect(pub.id).toBe(1);
    expect(pub.dominantInterests).toEqual(["python", "data-science"]);
    expect(pub.emergingInterests).toEqual(["typescript"]);
    expect(pub.coveredTopicsCount).toBe(4);
    expect(pub.coveredTopicsPreview).toEqual(["variables", "loops", "functions", "classes"]);
    expect(pub.currentFocus).toBe("python");
    expect(pub.preferredContentTypeLabel).toBe("Video");
    expect(pub.preferredCourseLengthLabel).toBe("Medium (1–4 hours)");
    expect(pub.preferredLanguageLabel).toBe("English");
    expect(pub.engagementScore).toBe(42);

    const json = JSON.stringify(pub);
    expect(json).not.toContain("topic_familiarity");
    expect(json).not.toContain("topic_families");
    expect(json).not.toContain("source_profile_snapshot");
    expect(json).not.toContain("source_event_summary");
    expect(json).not.toContain("profile_alignment");
    expect(json).not.toContain("user_id");
    expect(json).not.toContain("DO_NOT_LEAK");
  });

  test("coveredTopicsPreview caps at 10", () => {
    const many = { ...rawState, covered_topics: Array.from({ length: 25 }, (_, i) => `topic_${i}`) };
    const pub = toPublicLearningState(many);
    expect(pub.coveredTopicsCount).toBe(25);
    expect(pub.coveredTopicsPreview).toHaveLength(10);
  });

  test("nullable preference fields render as null (UI maps to 'Not available')", () => {
    const minimal = {
      ...rawState,
      current_focus: null,
      preferred_content_type: null,
      preferred_course_length: null,
      effective_preferred_language: null,
    };
    const pub = toPublicLearningState(minimal);
    expect(pub.currentFocus).toBeNull();
    expect(pub.preferredContentTypeLabel).toBeNull();
    expect(pub.preferredCourseLengthLabel).toBeNull();
    expect(pub.preferredLanguageLabel).toBeNull();
  });

  test("unknown enum values humanize safely (no raw snake_case in label)", () => {
    const odd = { ...rawState, preferred_content_type: "future_format" };
    const pub = toPublicLearningState(odd);
    expect(pub.preferredContentTypeLabel).toBe("Future Format");
  });
});
