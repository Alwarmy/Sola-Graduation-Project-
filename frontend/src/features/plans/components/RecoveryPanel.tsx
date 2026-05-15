"use client";

import { useState } from "react";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Select, Textarea } from "@/components/ui/Input";
import { LoadingState } from "@/components/states/LoadingState";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { BackendError } from "@/lib/errors/backend-error";
import { useRecoveryPreview } from "@/features/plans/hooks/useRecoveryPreview";
import { useApplyRecovery } from "@/features/plans/hooks/useExecutionMutations";
import type { PublicLearningPlan } from "@/lib/contracts/plans";
import { ConflictPanel } from "./ConflictPanel";

export type RecoveryPanelProps = {
  plan: PublicLearningPlan;
  onRefresh: () => void;
};

/**
 * CP8 recovery preview + apply. Apply requires BOTH `expected_version`
 * AND `expected_schedule_revision`. The button is disabled unless the
 * UI knows both (per addendum §D — "Never guess revision values; if a
 * required revision is missing from the UI state, disable the action
 * and show safe guidance").
 */
export function RecoveryPanel({ plan, onRefresh }: RecoveryPanelProps) {
  const preview = useRecoveryPreview(plan.id);
  const apply = useApplyRecovery();
  const [mode, setMode] = useState<string>("");
  const [recoveryNote, setRecoveryNote] = useState<string>("");

  const backendError = apply.error instanceof BackendError ? apply.error : null;
  const isConflict =
    backendError?.intent === "stale-refresh" ||
    backendError?.status === 409 ||
    backendError?.status === 412;

  if (preview.isLoading) return <LoadingState description="Loading recovery preview." />;
  if (preview.isError && preview.error) return <ErrorState error={preview.error} />;
  if (!preview.data) return <LoadingState description="Loading recovery preview." />;

  const p = preview.data;

  function handleRefresh() {
    apply.reset();
    onRefresh();
  }

  // Default the selection to the backend's recommended mode if the user
  // hasn't picked one yet.
  const selectedMode = mode || p.recommendedRecoveryMode || p.availableRecoveryModes[0] || "";

  const hasModes = p.availableRecoveryModes.length > 0;
  const hasVersion = plan.version >= 1;
  const hasScheduleRevision = plan.scheduleRevision >= 1;
  const canApply =
    p.needsRecovery &&
    hasModes &&
    selectedMode.length > 0 &&
    hasVersion &&
    hasScheduleRevision &&
    !isConflict &&
    !apply.isPending;

  function handleApply() {
    if (!hasVersion || !hasScheduleRevision || selectedMode.length === 0) return;
    const note = recoveryNote.trim();
    apply.mutate({
      planId: plan.id,
      input: {
        mode: selectedMode,
        expected_version: plan.version,
        expected_schedule_revision: plan.scheduleRevision,
        recovery_note: note.length === 0 ? null : note,
      },
    });
  }

  if (!p.needsRecovery) {
    return (
      <Card
        title="Recovery"
        headerActions={<Badge tone="success">{p.driftLevelLabel}</Badge>}
      >
        <EmptyState
          title="On track — no recovery needed right now."
          description={`Pressure ${p.recoveryPressureLabel}.`}
        />
      </Card>
    );
  }

  return (
    <Card
      title="Recovery"
      headerActions={<Badge tone="warning">{p.driftLevelLabel}</Badge>}
    >
      <div style={{ display: "grid", gap: "0.5rem" }}>
        <p style={{ margin: 0, fontSize: "0.9rem" }}>
          Pressure <strong>{p.recoveryPressureLabel}</strong> · Overdue{" "}
          <strong>{p.overdueItemsCount}</strong> items ({p.overdueMinutes} min) · Missed slots{" "}
          <strong>{p.missedStudySlotsCount}</strong>
        </p>
        <p style={{ margin: 0, fontSize: "0.9rem", color: "#555" }}>
          Recommended: <strong>{p.recommendedActionLabel}</strong>
          {p.recommendedRecoveryModeLabel ? ` · ${p.recommendedRecoveryModeLabel}` : ""}
        </p>

        <ConflictPanel error={apply.error} onRefresh={handleRefresh} />
        {apply.error && !isConflict ? <ErrorState error={apply.error} /> : null}

        {!hasModes ? (
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#7a4a05" }}>
            No recovery modes are available for this plan.
          </p>
        ) : (
          <>
            <FormField label="Recovery mode">
              {(api) => (
                <Select
                  value={selectedMode}
                  onChange={(e) => setMode(e.target.value)}
                  {...api}
                >
                  {p.availableRecoveryModes.map((m, i) => (
                    <option key={m} value={m}>
                      {p.availableRecoveryModeLabels[i] ?? m}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <FormField label="Recovery note (optional)">
              {(api) => (
                <Textarea
                  rows={2}
                  value={recoveryNote}
                  onChange={(e) => setRecoveryNote(e.target.value)}
                  maxLength={300}
                  {...api}
                />
              )}
            </FormField>
          </>
        )}

        {(!hasVersion || !hasScheduleRevision) && hasModes ? (
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#7a4a05" }}>
            Refresh the plan to enable recovery — current schedule revision is unknown.
          </p>
        ) : null}

        <Button
          variant="primary"
          size="sm"
          isBusy={apply.isPending}
          disabled={!canApply}
          onClick={handleApply}
        >
          {apply.isPending ? "Applying recovery…" : "Apply recovery"}
        </Button>
      </div>
    </Card>
  );
}
