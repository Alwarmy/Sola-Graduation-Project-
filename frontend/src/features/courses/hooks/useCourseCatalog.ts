"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/query-keys";
import { coursesFetch } from "@/features/courses/api/client";
import type { PublicCourseCard } from "@/lib/contracts/courses";

export type CourseCatalogParams = {
  q?: string;
  limit?: number;
  offset?: number;
};

/**
 * Hook for `GET /courses` (catalog/list) — **optional-auth**, via the
 * CP6-hardened dedicated frontend handler at `/api/courses`. Works for
 * both anonymous and authenticated browsers (NOTE-CP6-OPTIONAL-AUTH-001).
 *
 * The dedicated handler already parses the raw backend response through
 * Zod and maps it to `PublicCourseCard[]`, stripping `provider_metadata`,
 * `quality_signals`, `personalization`, `discovery`, and any other
 * raw/internal fields at the server-side boundary. The hook trusts that
 * shape and does not re-parse on the browser side.
 */
export function useCourseCatalog(params: CourseCatalogParams = {}) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  search.set("limit", String(params.limit ?? 12));
  search.set("offset", String(params.offset ?? 0));
  const qs = search.toString();
  return useQuery<PublicCourseCard[], Error>({
    queryKey: queryKeys.courses.catalog(params),
    queryFn: ({ signal }) =>
      coursesFetch<PublicCourseCard[]>(`/api/courses?${qs}`, { signal }),
    staleTime: 60_000,
  });
}
