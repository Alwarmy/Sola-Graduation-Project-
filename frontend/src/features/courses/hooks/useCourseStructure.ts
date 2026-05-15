"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { queryKeys } from "@/lib/query/query-keys";
import { solaFetch } from "@/features/courses/api/client";
import {
  courseStructureResponseSchema,
  courseUnitResponseSchema,
  toPublicStructure,
  toPublicUnit,
  type PublicCourseStructure,
  type PublicCourseUnit,
} from "@/lib/contracts/course-structures";
import { BackendError } from "@/lib/errors/backend-error";

export type CourseStructureQueryResult =
  | { kind: "missing" }
  | { kind: "loaded"; structure: PublicCourseStructure };

const unitsResponseSchema = z.array(courseUnitResponseSchema);

/**
 * Read the course structure. 404 → `{kind: "missing"}` (no structure built
 * yet for this course); the UI renders an honest empty state, not an error.
 */
export function useCourseStructure(courseId: number | string | null, options?: { enabled?: boolean }) {
  return useQuery<CourseStructureQueryResult, BackendError>({
    queryKey: queryKeys.courseStructures.detail(courseId ?? ""),
    enabled: (options?.enabled ?? true) && courseId !== null && courseId !== "",
    queryFn: async ({ signal }) => {
      try {
        const raw = await solaFetch<unknown>(
          `/course-structures/${encodeURIComponent(String(courseId))}`,
          { signal },
        );
        const parsed = courseStructureResponseSchema.parse(raw);
        return { kind: "loaded", structure: toPublicStructure(parsed) };
      } catch (err) {
        if (err instanceof BackendError && err.status === 404) return { kind: "missing" };
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Read the list of units for a course's structure. Returns `[]` when the
 * structure is missing (404).
 */
export function useCourseUnits(courseId: number | string | null, options?: { enabled?: boolean }) {
  return useQuery<PublicCourseUnit[], BackendError>({
    queryKey: queryKeys.courseStructures.units(courseId ?? ""),
    enabled: (options?.enabled ?? true) && courseId !== null && courseId !== "",
    queryFn: async ({ signal }) => {
      try {
        const raw = await solaFetch<unknown>(
          `/course-structures/${encodeURIComponent(String(courseId))}/units`,
          { signal },
        );
        const parsed = unitsResponseSchema.parse(raw);
        return parsed.map(toPublicUnit);
      } catch (err) {
        if (err instanceof BackendError && err.status === 404) return [];
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });
}
