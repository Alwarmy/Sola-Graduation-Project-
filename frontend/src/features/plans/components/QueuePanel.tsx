"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { LoadingState } from "@/components/states/LoadingState";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";

import { usePlanQueue, useRemoveQueueItem } from "@/features/plans/hooks/usePlanQueue";
import type { PublicQueueItem } from "@/lib/contracts/plans";
import { formatDateTime } from "@/lib/formatters/date";

export type QueuePanelProps = {
  /** Optional toggle to show item-level select checkboxes (used by create-plan form). */
  selectable?: boolean;
  selectedIds?: number[];
  onToggleSelected?: (id: number) => void;
};

export function QueuePanel({ selectable, selectedIds, onToggleSelected }: QueuePanelProps) {
  const queue = usePlanQueue();
  const remove = useRemoveQueueItem();

  if (queue.isLoading) return <LoadingState description="Loading your queue." />;
  if (queue.isError && queue.error) return <ErrorState error={queue.error} />;

  const items = queue.data ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        title="Your plan queue is empty."
        description='Browse Discover, open a course, and use "Add to plan queue".'
      />
    );
  }

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.75rem" }}>
      {items.map((item) => (
        <li key={item.id}>
          <QueueRow
            item={item}
            selectable={selectable}
            selected={selectedIds?.includes(item.id) ?? false}
            onToggle={onToggleSelected ? () => onToggleSelected(item.id) : undefined}
            onRemove={() => remove.mutate({ queueItemId: item.id })}
            isRemoving={remove.isPending && remove.variables?.queueItemId === item.id}
          />
        </li>
      ))}
    </ul>
  );
}

function QueueRow({
  item,
  selectable,
  selected,
  onToggle,
  onRemove,
  isRemoving,
}: {
  item: PublicQueueItem;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  onRemove: () => void;
  isRemoving: boolean;
}) {
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
        {selectable && onToggle ? (
          <label style={{ display: "flex", alignItems: "center", paddingTop: "0.25rem" }}>
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggle}
              aria-label={`Include ${item.course.title} in the new plan`}
            />
          </label>
        ) : null}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <div style={{ fontWeight: 600, fontSize: "1rem" }}>{item.course.title}</div>
          {item.course.cardSummary ? (
            <div style={{ color: "#555", fontSize: "0.875rem" }}>{item.course.cardSummary}</div>
          ) : null}
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
            <Badge tone="info">{item.statusLabel}</Badge>
            {item.note ? (
              <span style={{ fontSize: "0.85rem", color: "#444" }}>{item.note}</span>
            ) : null}
            <span style={{ fontSize: "0.75rem", color: "#888" }}>
              Added {formatDateTime(item.createdAt)}
            </span>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onRemove} isBusy={isRemoving}>
          Remove
        </Button>
      </div>
    </Card>
  );
}
