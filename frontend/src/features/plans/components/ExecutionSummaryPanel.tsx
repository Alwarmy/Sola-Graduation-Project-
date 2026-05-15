"use client";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LoadingState } from "@/components/states/LoadingState";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { useExecutionSummary } from "@/features/plans/hooks/useExecutionSummary";

export type ExecutionSummaryPanelProps = {
  planId: number;
};

/**
 * CP8 execution-summary panel.
 *
 * H-1 hardened display (NOTE-CP9-CP10-H1-EXECUTION-SUMMARY-001):
 *   - the backend `completionRateLabel` is intentionally NOT rendered
 *     (no "99% complete" / "100% complete" badge) while the backend
 *     formula is under review and may invert the rate.
 *   - counts (Total / Completed / In progress / Pending / Skipped /
 *     Due today / Overdue) are the reliable primary surface.
 *   - the frontend does NOT recompute or invent a substitute percent.
 *
 * Same rule applied on Home (`AuthenticatedHome.ExecutionCountsCard`)
 * and on `/progress` (`AuthenticatedProgress.PlanProgressCard`).
 */
export function ExecutionSummaryPanel({ planId }: ExecutionSummaryPanelProps) {
  const summary = useExecutionSummary(planId);

  if (summary.isLoading) return <LoadingState description="Loading progress." />;
  if (summary.isError && summary.error) return <ErrorState error={summary.error} />;
  if (!summary.data) return <LoadingState description="Loading progress." />;

  const s = summary.data;
  if (s.totalItems === 0) {
    return <EmptyState title="No execution data yet. Generate the schedule and start studying." />;
  }

  return (
    <Card title="Progress">
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.35rem" }}>
        <Row label="Total" value={s.totalItems} />
        <Row label="Completed" value={s.completedItemsCount} tone="success" />
        <Row label="In progress" value={s.inProgressItemsCount} tone="info" />
        <Row label="Pending" value={s.pendingItemsCount} />
        <Row label="Skipped" value={s.skippedItemsCount} tone="warning" />
        <Row label="Due today" value={s.dueTodayItemsCount} tone="info" />
        <Row label="Overdue" value={s.overdueItemsCount} tone="danger" />
      </ul>
      <p
        style={{
          margin: "0.5rem 0 0",
          fontSize: "0.75rem",
          color: "#888",
        }}
        data-testid="execution-summary-h1-safe-note"
      >
        Progress percentage is under review. Counts are shown instead.
      </p>
      {s.nextActionableTitle ? (
        <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#444" }}>
          Next up: <strong>{s.nextActionableTitle}</strong>
          {s.nextActionableScheduledDate ? ` · ${s.nextActionableScheduledDate}` : ""}
        </p>
      ) : null}
    </Card>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "info" | "warning" | "danger";
}) {
  return (
    <li
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "0.5rem",
      }}
    >
      <span style={{ color: "#555", fontSize: "0.875rem" }}>{label}</span>
      <Badge tone={tone ?? "neutral"}>{value}</Badge>
    </li>
  );
}
