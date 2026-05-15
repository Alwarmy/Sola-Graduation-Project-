"use client";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LoadingState } from "@/components/states/LoadingState";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";

import { usePlanReadiness } from "@/features/plans/hooks/usePlanReadiness";

export type ReadinessPanelProps = {
  planId: number | string;
};

/**
 * Plan readiness view. CP7 surfaced base signals (has_courses,
 * has_preference, base_blockers, recommended_action). CP8 extends with
 * schedule + execution readiness signals (is_ready_for_schedule_generation,
 * is_ready_for_execution, generation_blockers, execution_blockers,
 * recommended_recovery_mode).
 */
export function ReadinessPanel({ planId }: ReadinessPanelProps) {
  const readiness = usePlanReadiness(planId);
  if (readiness.isLoading) return <LoadingState description="Loading readiness." />;
  if (readiness.isError && readiness.error) return <ErrorState error={readiness.error} />;
  if (!readiness.data) return <LoadingState description="Loading readiness." />;
  if (readiness.data.kind === "missing") {
    return <EmptyState title="Readiness not computed yet for this plan." />;
  }

  const r = readiness.data.readiness;
  const courseCountLabel =
    r.activeCourseCount > 0
      ? `${r.activeCourseCount} of ${r.maxActiveCourses} active courses`
      : "No active courses yet";

  return (
    <Card
      title="Plan readiness"
      headerActions={<Badge tone={r.isActiveStatus ? "success" : "info"}>{r.statusLabel}</Badge>}
    >
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.4rem" }}>
        <li>
          <ReadinessRow label="Courses" value={courseCountLabel} ok={r.hasCourses} />
        </li>
        <li>
          <ReadinessRow
            label="Preferences"
            value={r.hasPreference ? "Set" : "Not set"}
            ok={r.hasPreference}
          />
        </li>
        <li>
          <ReadinessRow label="Status" value={r.statusLabel} ok={r.isOpenStatus} />
        </li>
        {/* CP8 signals */}
        <li>
          <ReadinessRow
            label="Schedule items"
            value={r.hasScheduleItems ? "Generated" : "Not generated"}
            ok={r.hasScheduleItems}
          />
        </li>
        <li>
          <ReadinessRow
            label="Schedule generation"
            value={r.isReadyForScheduleGeneration ? "Ready" : "Not ready"}
            ok={r.isReadyForScheduleGeneration}
          />
        </li>
        <li>
          <ReadinessRow
            label="Execution"
            value={r.isReadyForExecution ? "Ready" : "Not ready"}
            ok={r.isReadyForExecution}
          />
        </li>
      </ul>
      {r.baseBlockers.length > 0 ? (
        <BlockerList title="Before this plan can move forward:" blockers={r.baseBlockers} />
      ) : null}
      {r.generationBlockers.length > 0 ? (
        <BlockerList
          title="Before generating the schedule:"
          blockers={r.generationBlockers}
        />
      ) : null}
      {r.executionBlockers.length > 0 ? (
        <BlockerList title="Before starting items:" blockers={r.executionBlockers} />
      ) : null}
      {r.recommendedActionLabel ? (
        <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#444" }}>
          Suggested next step: <strong>{r.recommendedActionLabel}</strong>
        </p>
      ) : null}
      {r.recommendedRecoveryModeLabel ? (
        <p style={{ marginTop: "0.25rem", fontSize: "0.875rem", color: "#444" }}>
          Recovery suggestion: <strong>{r.recommendedRecoveryModeLabel}</strong>
        </p>
      ) : null}
    </Card>
  );
}

function ReadinessRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ color: "#555", fontSize: "0.875rem" }}>{label}</span>
      <Badge tone={ok ? "success" : "warning"}>{value}</Badge>
    </div>
  );
}

function BlockerList({
  title,
  blockers,
}: {
  title: string;
  blockers: { code: string; label: string }[];
}) {
  return (
    <div style={{ marginTop: "0.5rem" }}>
      <div style={{ fontSize: "0.85rem", color: "#7a4a05", marginBottom: "0.25rem" }}>{title}</div>
      <ul style={{ paddingInlineStart: "1.25rem", margin: 0, fontSize: "0.85rem" }}>
        {blockers.map((b) => (
          <li key={b.code}>{b.label}</li>
        ))}
      </ul>
    </div>
  );
}
