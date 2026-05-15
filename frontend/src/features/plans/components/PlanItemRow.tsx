"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import { ErrorState } from "@/components/states/ErrorState";
import { FALLBACK } from "@/lib/copy/fallback";
import { BackendError } from "@/lib/errors/backend-error";
import {
  useCompletePlanItem,
  useSkipPlanItem,
  useStartPlanItem,
} from "@/features/plans/hooks/useExecutionMutations";
import type { PublicPlanItem } from "@/lib/contracts/plan-execution";
import { ConflictPanel } from "./ConflictPanel";

export type PlanItemRowProps = {
  item: PublicPlanItem;
  onRefresh: () => void;
};

const STATUS_TONES: Readonly<Record<string, BadgeTone>> = {
  pending: "neutral",
  in_progress: "info",
  completed: "success",
  skipped: "warning",
};

function statusTone(status: string): BadgeTone {
  return STATUS_TONES[status] ?? "neutral";
}

/**
 * A single plan-schedule item with safe status badge + start/complete/skip
 * controls gated by `item.status` and `item.is_actionable`.
 *
 * Concurrency: every action sends `item.version` — start as
 * `X-Expected-Version` header, complete + skip as `expected_version`
 * body field — per the CP8 Revision/Conflict Contract Table.
 */
export function PlanItemRow({ item, onRefresh }: PlanItemRowProps) {
  const start = useStartPlanItem();
  const complete = useCompletePlanItem();
  const skip = useSkipPlanItem();

  const [completeMinutes, setCompleteMinutes] = useState<string>("");
  const [skipReason, setSkipReason] = useState<string>("");

  const activeMutation =
    start.isPending ? start : complete.isPending ? complete : skip.isPending ? skip : null;
  const anyError = start.error ?? complete.error ?? skip.error ?? null;
  const backendError = anyError instanceof BackendError ? anyError : null;
  const isConflict =
    backendError?.intent === "stale-refresh" ||
    backendError?.status === 409 ||
    backendError?.status === 412;

  const canStart = item.status === "pending" && item.isActionable;
  const canComplete = item.status === "in_progress" || item.status === "pending";
  const canSkip = item.status === "pending" || item.status === "in_progress";

  function handleRefresh() {
    start.reset();
    complete.reset();
    skip.reset();
    onRefresh();
  }

  function handleStart() {
    start.mutate({
      planId: item.planId,
      itemId: item.id,
      expectedVersion: item.version,
    });
  }

  function handleComplete() {
    const minutesNum = completeMinutes.trim() === "" ? null : Number.parseInt(completeMinutes, 10);
    const actual_minutes =
      typeof minutesNum === "number" && Number.isFinite(minutesNum) && minutesNum >= 1
        ? minutesNum
        : null;
    complete.mutate({
      planId: item.planId,
      itemId: item.id,
      input: {
        actual_minutes,
        expected_version: item.version,
      },
    });
  }

  function handleSkip() {
    const reason = skipReason.trim();
    skip.mutate({
      planId: item.planId,
      itemId: item.id,
      input: {
        skip_reason: reason.length === 0 ? null : reason,
        expected_version: item.version,
      },
    });
  }

  const overdueBadge = item.isOverdue ? <Badge tone="danger">Overdue</Badge> : null;
  const dueTodayBadge = item.isDueToday ? <Badge tone="info">Due today</Badge> : null;

  return (
    <Card>
      <div style={{ display: "grid", gap: "0.5rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <Badge tone={statusTone(item.status)}>{item.statusLabel}</Badge>
          {overdueBadge}
          {dueTodayBadge}
          <span style={{ fontSize: "0.85rem", color: "#555" }}>
            {item.scheduledDate} · {item.timeWindowLabel} · {item.plannedMinutes} min
          </span>
        </div>
        <h4 style={{ margin: 0 }}>{item.title}</h4>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "#555" }}>
          {item.course.title}
          {item.course.providerDisplayName ? ` · ${item.course.providerDisplayName}` : ""}
        </p>

        <ConflictPanel error={anyError} onRefresh={handleRefresh} />
        {anyError && !isConflict ? <ErrorState error={anyError} /> : null}

        {item.status === "completed" ? (
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#14692f" }}>
            Completed
            {item.actualMinutes != null ? ` · ${item.actualMinutes} min logged` : ""}
          </p>
        ) : item.status === "skipped" ? (
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#7a4a05" }}>
            Skipped{item.skipReason ? ` · "${item.skipReason}"` : ""}
          </p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
            <Button
              variant="primary"
              size="sm"
              isBusy={start.isPending}
              disabled={!canStart || isConflict || activeMutation !== null}
              onClick={handleStart}
            >
              {start.isPending ? "Starting…" : "Start"}
            </Button>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <label style={{ fontSize: "0.8rem", color: "#555" }} htmlFor={`min-${item.id}`}>
                Actual minutes (optional)
              </label>
              <Input
                id={`min-${item.id}`}
                type="number"
                inputMode="numeric"
                min={1}
                max={720}
                value={completeMinutes}
                onChange={(e) => setCompleteMinutes(e.target.value)}
                style={{ maxWidth: "8rem" }}
              />
              <Button
                variant="secondary"
                size="sm"
                isBusy={complete.isPending}
                disabled={!canComplete || isConflict || activeMutation !== null}
                onClick={handleComplete}
              >
                {complete.isPending ? "Completing…" : "Complete"}
              </Button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <label style={{ fontSize: "0.8rem", color: "#555" }} htmlFor={`skip-${item.id}`}>
                Skip reason (optional)
              </label>
              <Textarea
                id={`skip-${item.id}`}
                rows={1}
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
                style={{ maxWidth: "16rem" }}
                maxLength={300}
              />
              <Button
                variant="secondary"
                size="sm"
                isBusy={skip.isPending}
                disabled={!canSkip || isConflict || activeMutation !== null}
                onClick={handleSkip}
              >
                {skip.isPending ? "Skipping…" : "Skip"}
              </Button>
            </div>
          </div>
        )}

        {item.actualMinutes == null && item.status !== "pending" && item.status !== "in_progress" ? (
          <p style={{ margin: 0, fontSize: "0.75rem", color: "#888" }}>
            {item.status === "completed" ? "" : FALLBACK.unknown}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
