"use client";

import { LoadingState } from "@/components/states/LoadingState";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { usePlanItems } from "@/features/plans/hooks/usePlanItems";
import { PlanItemRow } from "./PlanItemRow";

export type PlanItemsListProps = {
  planId: number;
  onRefresh: () => void;
};

/**
 * CP8 plan-items list. Reads `/api/plans/[planId]/items` and renders
 * each item via `PlanItemRow`. Honest empty state when the schedule
 * hasn't been generated yet (zero items).
 */
export function PlanItemsList({ planId, onRefresh }: PlanItemsListProps) {
  const items = usePlanItems(planId);

  if (items.isLoading) return <LoadingState description="Loading schedule items." />;
  if (items.isError && items.error) return <ErrorState error={items.error} />;
  if (!items.data) return <LoadingState description="Loading schedule items." />;

  if (items.data.length === 0) {
    return <EmptyState title="No schedule items yet. Generate the schedule to begin." />;
  }

  // Backend orders items by schedule_order_index naturally; keep that order.
  const sorted = items.data.slice().sort((a, b) => a.scheduleOrderIndex - b.scheduleOrderIndex);

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      {sorted.map((item) => (
        <PlanItemRow key={item.id} item={item} onRefresh={onRefresh} />
      ))}
    </div>
  );
}
