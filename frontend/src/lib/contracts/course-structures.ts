import { z } from "zod";

/**
 * Course structures + units schemas per the CP1 OpenAPI snapshot:
 * `CourseStructureResponse`, `CourseUnitResponse`.
 *
 * Backend may also return 404 with `error_code: "not_found"` when no
 * structure has been built for a course; consumers (hooks) map that to a
 * `{kind: "missing"}` sentinel, NOT an error.
 */

export const courseUnitResponseSchema = z
  .object({
    id: z.number().int(),
    course_structure_id: z.number().int(),
    external_unit_id: z.string().nullish(),
    unit_type: z.string(),
    title: z.string(),
    description: z.string().nullish(),
    source_order_index: z.number().int(),
    raw_duration_seconds: z.number().int().nullish(),
    estimated_minutes: z.number().int().nullish(),
    start_second: z.number().int().nullish(),
    end_second: z.number().int().nullish(),
  })
  .passthrough();
export type CourseUnitResponse = z.infer<typeof courseUnitResponseSchema>;

export const courseStructureResponseSchema = z
  .object({
    id: z.number().int(),
    course_id: z.number().int(),
    source: z.string(),
    content_type: z.string(),
    structure_type: z.string(),
    build_status: z.string(),
    total_units: z.number().int(),
    total_minutes: z.number().int(),
    build_notes: z.string().nullish(),
    last_built_at: z.string().nullish(),
    created_at: z.string(),
    updated_at: z.string(),
    units: z.array(courseUnitResponseSchema).optional(),
  })
  .passthrough();
export type CourseStructureResponse = z.infer<typeof courseStructureResponseSchema>;

// ─── Browser-safe view models ────────────────────────────────────────────────

export type PublicCourseUnit = {
  id: number;
  title: string;
  description: string | null;
  unitType: string;
  orderIndex: number;
  estimatedMinutes: number | null;
};

export function toPublicUnit(u: CourseUnitResponse): PublicCourseUnit {
  return {
    id: u.id,
    title: u.title,
    description: u.description ?? null,
    unitType: u.unit_type,
    orderIndex: u.source_order_index,
    estimatedMinutes: u.estimated_minutes ?? null,
  };
}

export type PublicCourseStructure = {
  id: number;
  courseId: number;
  totalUnits: number;
  totalMinutes: number;
  buildStatus: string;
  lastBuiltAt: string | null;
};

export function toPublicStructure(s: CourseStructureResponse): PublicCourseStructure {
  return {
    id: s.id,
    courseId: s.course_id,
    totalUnits: s.total_units,
    totalMinutes: s.total_minutes,
    buildStatus: s.build_status,
    lastBuiltAt: s.last_built_at ?? null,
  };
}
