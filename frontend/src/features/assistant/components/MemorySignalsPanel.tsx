"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingState } from "@/components/states/LoadingState";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { useAssistantMemorySignals } from "@/features/assistant/hooks/useAssistantMemorySignals";
import { useConfirmAssistantMemorySignal } from "@/features/assistant/hooks/useAssistantMutations";
import type { PublicAssistantMemorySignal } from "@/lib/contracts/assistant";

export type MemorySignalsPanelProps = {
  conversationId: number | null;
};

/**
 * Memory signals are backend-backed. Confirmation requires explicit
 * user click. After confirm, the mutation hook invalidates memory +
 * conversation + (for durable preferences) profile + learning-state.
 */
export function MemorySignalsPanel({ conversationId }: MemorySignalsPanelProps) {
  const signals = useAssistantMemorySignals({});
  const confirm = useConfirmAssistantMemorySignal();

  if (signals.isLoading) return <LoadingState description="Loading memory signals." />;
  if (signals.isError && signals.error) return <ErrorState error={signals.error} />;
  if (!signals.data) return <LoadingState description="Loading memory signals." />;

  if (signals.data.length === 0) {
    return (
      <EmptyState title="No assistant memory yet. The assistant will propose memory as you chat." />
    );
  }

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      {confirm.error ? <ErrorState error={confirm.error} /> : null}
      {signals.data.map((s) => (
        <SignalCard
          key={s.id}
          signal={s}
          onConfirm={() =>
            confirm.mutate({
              signalId: s.id,
              conversationId: conversationId ?? s.conversationId,
            })
          }
          isPending={confirm.isPending && confirm.variables?.signalId === s.id}
        />
      ))}
    </div>
  );
}

function SignalCard({
  signal,
  onConfirm,
  isPending,
}: {
  signal: PublicAssistantMemorySignal;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const canConfirm = signal.status === "proposed";
  return (
    <Card>
      <div style={{ display: "grid", gap: "0.4rem" }}>
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
          <Badge tone={signal.status === "active" ? "success" : signal.status === "proposed" ? "info" : "neutral"}>
            {signal.statusLabel}
          </Badge>
          <Badge tone="neutral">{signal.scopeLabel}</Badge>
          <Badge tone="neutral">{signal.confidenceLabel} confidence</Badge>
        </div>
        <p style={{ margin: 0, fontWeight: 500 }}>{signal.signalKeyLabel}</p>
        <p style={{ margin: 0, fontSize: "0.9rem" }}>{signal.signalSummary}</p>
        {canConfirm ? (
          <div>
            <Button
              variant="primary"
              size="sm"
              isBusy={isPending}
              disabled={isPending}
              onClick={onConfirm}
            >
              {isPending ? "Confirming…" : "Confirm memory"}
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
