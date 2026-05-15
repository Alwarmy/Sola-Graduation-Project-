"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingState } from "@/components/states/LoadingState";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { useAssistantActionRuns } from "@/features/assistant/hooks/useAssistantActionRuns";
import { useConfirmAssistantActionRun } from "@/features/assistant/hooks/useAssistantMutations";
import type { PublicAssistantActionRun } from "@/lib/contracts/assistant";

export type ActionRunsPanelProps = {
  conversationId: number | null;
};

/**
 * Action runs panel. Each proposed action is a card with an explicit
 * Confirm button — the mutation hook routes to the dedicated assistant
 * confirm handler and runs the action-type-scoped invalidation map
 * (plan / queue / recommendations / assistant). Unknown action types
 * are NEVER hidden silently — they render with a disabled Confirm and
 * safe "not available yet" copy.
 */
export function ActionRunsPanel({ conversationId }: ActionRunsPanelProps) {
  const runs = useAssistantActionRuns({});
  const confirm = useConfirmAssistantActionRun();

  if (runs.isLoading) return <LoadingState description="Loading suggested actions." />;
  if (runs.isError && runs.error) return <ErrorState error={runs.error} />;
  if (!runs.data) return <LoadingState description="Loading suggested actions." />;

  if (runs.data.length === 0) {
    return (
      <EmptyState title="No suggested actions yet. The assistant will propose actions when relevant." />
    );
  }

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      {confirm.error ? <ErrorState error={confirm.error} /> : null}
      {runs.data.map((r) => (
        <ActionCard
          key={r.id}
          run={r}
          onConfirm={() =>
            confirm.mutate({
              actionRunId: r.id,
              conversationId: conversationId ?? r.conversationId,
            })
          }
          isPending={confirm.isPending && confirm.variables?.actionRunId === r.id}
        />
      ))}
    </div>
  );
}

function statusTone(status: string): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (status) {
    case "proposed":
      return "info";
    case "confirmed":
      return "info";
    case "executed":
      return "success";
    case "failed":
      return "danger";
    case "dismissed":
      return "warning";
    default:
      return "neutral";
  }
}

function ActionCard({
  run,
  onConfirm,
  isPending,
}: {
  run: PublicAssistantActionRun;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const canConfirm = run.status === "proposed" && run.isKnownActionType;
  return (
    <Card>
      <div style={{ display: "grid", gap: "0.4rem" }}>
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
          <Badge tone={statusTone(run.status)}>{run.statusLabel}</Badge>
          <Badge tone="neutral">{run.actionTypeLabel}</Badge>
          {!run.isKnownActionType ? <Badge tone="warning">Not available yet</Badge> : null}
        </div>
        {run.failureReasonLabel ? (
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#7a4a05" }}>
            {run.failureReasonLabel}
          </p>
        ) : null}
        {!run.isKnownActionType ? (
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#7a4a05" }}>
            This action isn&apos;t available yet in this app version.
          </p>
        ) : null}
        {canConfirm ? (
          <div>
            <Button
              variant="primary"
              size="sm"
              isBusy={isPending}
              disabled={isPending}
              onClick={onConfirm}
            >
              {isPending ? "Confirming…" : "Confirm action"}
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
