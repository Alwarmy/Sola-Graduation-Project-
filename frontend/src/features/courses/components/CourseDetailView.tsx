"use client";

import Link from "next/link";

import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Section } from "@/components/layout/PageHeader";
import { LoadingState } from "@/components/states/LoadingState";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { ProtectedState } from "@/components/states/ProtectedState";
import { useSession } from "@/features/auth/hooks/useSession";
import { useCourseDetail } from "@/features/courses/hooks/useCourseDetail";
import { useCourseStructure, useCourseUnits } from "@/features/courses/hooks/useCourseStructure";
import { AddToQueueButton } from "@/features/plans/components/AddToQueueButton";
import { formatOptional } from "@/lib/formatters/optional";
import { formatDurationMinutes } from "@/lib/formatters/duration";
import { FALLBACK } from "@/lib/copy/fallback";

const TONE_MAP: Record<string, BadgeTone> = {
  info: "info",
  success: "success",
  warning: "warning",
  danger: "danger",
  neutral: "neutral",
};

export type CourseDetailViewProps = {
  courseId: string;
};

export function CourseDetailView({ courseId }: CourseDetailViewProps) {
  const session = useSession();
  const hasSession = Boolean(session.data?.user);

  const detail = useCourseDetail(courseId);
  const structure = useCourseStructure(courseId, { enabled: hasSession });
  const units = useCourseUnits(courseId, { enabled: hasSession });

  if (detail.isLoading) return <LoadingState description="Loading course." />;
  if (detail.isError && detail.error) return <ErrorState error={detail.error} />;
  if (!detail.data) return <LoadingState description="Loading course." />;
  if (detail.data.kind === "missing") {
    return (
      <EmptyState
        title="Course not found."
        description="It may have been removed from the catalog."
        action={<Link href="/courses">Back to Discover</Link>}
      />
    );
  }

  const course = detail.data.course;

  return (
    <>
      <Section>
        <Card
          title={course.title}
          subtitle={course.cardSummary ?? undefined}
        >
          {course.shortDescription ? <p>{course.shortDescription}</p> : null}
          {course.badges.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
              {course.badges.map((b) => (
                <Badge key={b.key} tone={TONE_MAP[b.tone ?? "neutral"] ?? "neutral"}>
                  {b.label}
                </Badge>
              ))}
            </div>
          ) : null}
          <p style={{ fontSize: "0.9rem", color: "#555" }}>
            <span>{formatOptional(course.instructorDisplayName)}</span>
            {course.providerDisplayName ? <span> · {course.providerDisplayName}</span> : null}
          </p>
          {course.url ? (
            <p>
              <a href={course.url} target="_blank" rel="noopener noreferrer">
                Open course on {course.providerDisplayName}
              </a>
            </p>
          ) : null}
          <div style={{ marginTop: "0.5rem" }}>
            <AddToQueueButton courseId={course.id} size="md" />
          </div>
        </Card>
      </Section>

      <Section title="Course structure">
        {!hasSession ? (
          <ProtectedState
            title="Sign in to view the course structure and units."
            action={<Link href="/login">Sign in</Link>}
          />
        ) : structure.isLoading ? (
          <LoadingState description="Loading structure." />
        ) : structure.isError && structure.error ? (
          <ErrorState error={structure.error} />
        ) : structure.data?.kind === "missing" ? (
          <EmptyState title="Structure not built yet for this course." />
        ) : structure.data ? (
          <Card>
            <p>
              <strong>{structure.data.structure.totalUnits}</strong> units ·{" "}
              {structure.data.structure.totalMinutes > 0
                ? formatDurationMinutes(structure.data.structure.totalMinutes)
                : FALLBACK.unknown}
            </p>
          </Card>
        ) : null}
      </Section>

      <Section title="Units">
        {!hasSession ? null : units.isLoading ? (
          <LoadingState description="Loading units." />
        ) : units.isError && units.error ? (
          <ErrorState error={units.error} />
        ) : units.data && units.data.length > 0 ? (
          <ol style={{ paddingInlineStart: "1.5rem", display: "grid", gap: "0.5rem" }}>
            {units.data
              .slice()
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map((u) => (
                <li key={u.id}>
                  <span style={{ fontWeight: 500 }}>{u.title}</span>
                  {u.estimatedMinutes ? (
                    <span style={{ color: "#555" }}>
                      {" "}
                      · {formatDurationMinutes(u.estimatedMinutes)}
                    </span>
                  ) : null}
                </li>
              ))}
          </ol>
        ) : (
          <EmptyState title="No units listed yet." />
        )}
      </Section>
    </>
  );
}
