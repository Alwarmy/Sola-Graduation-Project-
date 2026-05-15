"use client";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";

import { useRemovePlanCourse } from "@/features/plans/hooks/usePlanMutations";
import { usePlanQueue } from "@/features/plans/hooks/usePlanQueue";
import { useAddQueueItemToPlan } from "@/features/plans/hooks/usePlanMutations";
import { formatOptional } from "@/lib/formatters/optional";
import type { PublicLearningPlan } from "@/lib/contracts/plans";
import { ConflictPanel } from "./ConflictPanel";

export type PlanCoursesListProps = {
  plan: PublicLearningPlan;
  onRefresh: () => void;
};

export function PlanCoursesList({ plan, onRefresh }: PlanCoursesListProps) {
  const remove = useRemovePlanCourse();
  const queue = usePlanQueue();
  const addQueueItem = useAddQueueItemToPlan();

  const queuedNotInPlan = (queue.data ?? []).filter(
    (item) => !plan.courses.some((pc) => pc.courseId === item.courseId),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <ConflictPanel error={remove.error} onRefresh={onRefresh} />
      <ConflictPanel error={addQueueItem.error} onRefresh={onRefresh} />
      {remove.error && !(remove.error instanceof Error && (remove.error as { intent?: string }).intent === "stale-refresh") ? (
        <ErrorState error={remove.error} />
      ) : null}

      {plan.courses.length === 0 ? (
        <EmptyState
          title="This plan has no courses yet."
          description="Add a queued course below."
        />
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.6rem" }}>
          {plan.courses.map((pc) => (
            <li key={pc.id}>
              <Card>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{pc.course.title}</div>
                    {pc.course.cardSummary ? (
                      <div style={{ fontSize: "0.85rem", color: "#555" }}>
                        {pc.course.cardSummary}
                      </div>
                    ) : null}
                    <div style={{ marginTop: "0.35rem", display: "flex", gap: "0.4rem", alignItems: "center" }}>
                      <Badge tone="info">{pc.statusLabel}</Badge>
                      {pc.rationale ? (
                        <span style={{ fontSize: "0.85rem", color: "#444" }}>
                          {formatOptional(pc.rationale)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    isBusy={remove.isPending && remove.variables?.planCourseId === pc.id}
                    onClick={() =>
                      remove.mutate({
                        planId: plan.id,
                        planCourseId: pc.id,
                        expectedVersion: plan.version,
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {queuedNotInPlan.length > 0 ? (
        <Card title="Add a queued course to this plan">
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.4rem" }}>
            {queuedNotInPlan.map((q) => (
              <li
                key={q.id}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <span style={{ fontSize: "0.875rem" }}>{q.course.title}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  isBusy={addQueueItem.isPending && addQueueItem.variables?.queueItemId === q.id}
                  onClick={() =>
                    addQueueItem.mutate({
                      planId: plan.id,
                      queueItemId: q.id,
                      expectedVersion: plan.version,
                    })
                  }
                >
                  Add
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
