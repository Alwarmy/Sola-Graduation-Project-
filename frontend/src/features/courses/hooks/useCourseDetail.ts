"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/query-keys";
import { coursesFetch } from "@/features/courses/api/client";
import type { PublicCourseCard } from "@/lib/contracts/courses";
import { BackendError } from "@/lib/errors/backend-error";

export type CourseDetailQueryResult =
  | { kind: "found"; course: PublicCourseCard }
  | { kind: "missing" };

/**
 * Read a single course by id — **optional-auth**, via the CP6-hardened
 * dedicated frontend handler at `/api/courses/[courseId]`. Works for
 * both anonymous and authenticated browsers (NOTE-CP6-OPTIONAL-AUTH-001).
 *
 * 404 → `{kind: "missing"}` sentinel so the UI can render an honest
 * "course not found" state, NOT an error toast. The dedicated handler
 * has already mapped the response to `PublicCourseCard` — raw provider
 * fields never reach the browser.
 */
export function useCourseDetail(courseId: number | string | null) {
  return useQuery<CourseDetailQueryResult, BackendError>({
    queryKey: queryKeys.courses.detail(courseId ?? ""),
    enabled: courseId !== null && courseId !== "",
    queryFn: async ({ signal }) => {
      try {
        const course = await coursesFetch<PublicCourseCard>(
          `/api/courses/${encodeURIComponent(String(courseId))}`,
          { signal },
        );
        return { kind: "found", course };
      } catch (err) {
        if (err instanceof BackendError && err.status === 404) {
          return { kind: "missing" };
        }
        throw err;
      }
    },
    staleTime: 60_000,
  });
}
