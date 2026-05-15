import type { ReactNode } from "react";

import type { PublicCourseCard } from "@/lib/contracts/courses";
import { AddToQueueButton } from "@/features/plans/components/AddToQueueButton";
import { CourseCard } from "./CourseCard";

export type CourseGridProps = {
  courses: PublicCourseCard[];
  emptyState?: ReactNode;
  /** Optional explanation per-course (used for recommendations). */
  explanationByCourseId?: Record<number, string | null>;
  /** Default: true. Cards in the Discover surface mount the CP7 add-to-queue action. */
  showAddToQueue?: boolean;
};

export function CourseGrid({
  courses,
  emptyState,
  explanationByCourseId,
  showAddToQueue = true,
}: CourseGridProps) {
  if (courses.length === 0) return <>{emptyState ?? null}</>;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(18rem, 1fr))",
        gap: "1rem",
      }}
    >
      {courses.map((course) => (
        <CourseCard
          key={course.id}
          course={course}
          explanationSummary={explanationByCourseId?.[course.id] ?? null}
          actionSlot={showAddToQueue ? <AddToQueueButton courseId={course.id} /> : undefined}
        />
      ))}
    </div>
  );
}
