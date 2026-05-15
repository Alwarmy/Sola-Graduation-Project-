"use client";

import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LoadingState } from "@/components/states/LoadingState";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";

import { useActivePlan } from "@/features/plans/hooks/usePlans";
import { formatDateTime } from "@/lib/formatters/date";

export function ActivePlanSummary() {
  const active = useActivePlan();
  if (active.isLoading) return <LoadingState description="Loading your active plan." />;
  if (active.isError && active.error) return <ErrorState error={active.error} />;
  if (!active.data) return <LoadingState description="Loading your active plan." />;

  if (active.data.kind === "missing") {
    return (
      <EmptyState
        title="No active plan yet."
        description="Once you create or activate a plan, it'll appear here."
      />
    );
  }
  const plan = active.data.plan;
  return (
    <Card
      title={
        <Link href={`/plans/${plan.id}`} style={{ color: "inherit" }}>
          {plan.title}
        </Link>
      }
      subtitle={plan.goal}
      headerActions={<Badge tone="success">{plan.statusLabel}</Badge>}
    >
      <div style={{ fontSize: "0.85rem", color: "#555" }}>
        {plan.courses.length} courses · {plan.weeklyHoursSnapshot} h/wk · Last updated{" "}
        {formatDateTime(plan.updatedAt)}
      </div>
    </Card>
  );
}
