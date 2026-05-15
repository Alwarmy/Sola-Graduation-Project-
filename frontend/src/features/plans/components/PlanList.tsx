"use client";

import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LoadingState } from "@/components/states/LoadingState";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";

import { usePlans } from "@/features/plans/hooks/usePlans";
import { formatDateTime } from "@/lib/formatters/date";
import { formatOptional } from "@/lib/formatters/optional";

export function PlanList() {
  const plans = usePlans();
  if (plans.isLoading) return <LoadingState description="Loading your plans." />;
  if (plans.isError && plans.error) return <ErrorState error={plans.error} />;

  const items = plans.data ?? [];
  if (items.length === 0) {
    return <EmptyState title="No plans yet." description="Create one from your queue above." />;
  }

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.75rem" }}>
      {items.map((plan) => (
        <li key={plan.id}>
          <Card
            title={
              <Link href={`/plans/${plan.id}`} style={{ color: "inherit" }}>
                {plan.title}
              </Link>
            }
            subtitle={formatOptional(plan.goal)}
            headerActions={<Badge tone="info">{plan.statusLabel}</Badge>}
          >
            <div style={{ fontSize: "0.85rem", color: "#555" }}>
              {plan.courses.length} courses · {plan.weeklyHoursSnapshot} h/wk · Updated{" "}
              {formatDateTime(plan.updatedAt)}
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
