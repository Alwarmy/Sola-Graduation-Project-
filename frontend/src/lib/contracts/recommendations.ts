import { z } from "zod";

import {
  courseCardResponseSchema,
  toPublicCourseCard,
  type PublicCourseCard,
} from "@/lib/contracts/courses";

/**
 * Recommendations domain Zod schemas (per CP1 OpenAPI snapshot,
 * `RecommendationCourseResponse` and `RecommendationListResponse`).
 *
 * A `RecommendationCourseResponse` is a `CourseCardResponse` with additional
 * recommendation-specific signals. The browser-safe view model exposes only
 * the safe display fields plus a short, backend-built explanation summary if
 * the backend supplied one.
 */

export const recommendationCourseResponseSchema = courseCardResponseSchema; // permissive passthrough

export const recommendationListResponseSchema = z.object({
  total: z.number().int(),
  items: z.array(recommendationCourseResponseSchema).optional().default([]),
});
export type RecommendationListResponse = z.infer<typeof recommendationListResponseSchema>;

export type PublicRecommendation = PublicCourseCard & {
  explanationSummary: string | null;
};

function safeExplanation(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const discovery = (raw as Record<string, unknown>).discovery;
  if (!discovery || typeof discovery !== "object") return null;
  const d = discovery as Record<string, unknown>;
  const value =
    typeof d.explanation_label === "string" && d.explanation_label.trim().length > 0
      ? d.explanation_label
      : typeof d.explanation_summary === "string" && d.explanation_summary.trim().length > 0
        ? d.explanation_summary
        : null;
  return value;
}

export type PublicRecommendationList = {
  total: number;
  items: PublicRecommendation[];
};

export function toPublicRecommendations(
  r: RecommendationListResponse,
): PublicRecommendationList {
  return {
    total: r.total,
    items: r.items.map((raw) => ({
      ...toPublicCourseCard(raw),
      explanationSummary: safeExplanation(raw),
    })),
  };
}
