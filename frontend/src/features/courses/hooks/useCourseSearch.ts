"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/query-keys";
import { courseSearchFetch } from "@/features/courses/api/client";
import type {
  CourseSearchPipelineResult,
  SearchSourceStatus,
} from "@/app/api/courses/search/route";
import type { PublicCourseSearch } from "@/lib/contracts/courses";

/**
 * Run the locked Course Search Pipeline through the CP6 orchestrator.
 *
 * Disabled until the query is non-empty so an empty-input visit to the
 * Discover page never triggers a backend round-trip — the UI shows the
 * idle guidance state instead.
 */
export type CourseSearchInput = {
  q: string;
  language?: string | null;
  content_type?: string | null;
  source?: string | null;
  difficulty_level?: string | null;
  pricing_model?: string | null;
  progression_hint?: string | null;
  topic_tag?: string | null;
  sort_by?:
    | "relevance"
    | "personalized"
    | "quality"
    | "newest"
    | "published"
    | "duration_short"
    | "duration_long";
  limit?: number;
  offset?: number;
};

export type CourseSearchResult = {
  search: PublicCourseSearch;
  sourceStatus: SearchSourceStatus;
};

export function useCourseSearch(input: CourseSearchInput | null) {
  const enabled = !!input && input.q.trim().length > 0;
  const params = input ?? { q: "" };
  return useQuery<CourseSearchPipelineResult, Error, CourseSearchResult>({
    queryKey: queryKeys.courses.search(params as object),
    enabled,
    queryFn: ({ signal }) =>
      courseSearchFetch<CourseSearchPipelineResult>(input, signal),
    staleTime: 60_000,
  });
}
