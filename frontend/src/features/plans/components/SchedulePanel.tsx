"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/states/ErrorState";
import { usePlanReadiness } from "@/features/plans/hooks/usePlanReadiness";
import { useGenerateSchedule } from "@/features/plans/hooks/useExecutionMutations";
import { BackendError } from "@/lib/errors/backend-error";
import type { PublicLearningPlan } from "@/lib/contracts/plans";
import { ConflictPanel } from "./ConflictPanel";

export type SchedulePanelProps = {
  plan: PublicLearningPlan;
  onRefresh: () => void;
};

/**
 * CP8 schedule-generation control. Reads readiness to decide if the
 * Generate button is enabled. Sends `expected_version` from `plan.version`
 * and (when known) `expected_schedule_revision` from `plan.scheduleRevision`.
 *
 * Refresh handler resets the mutation error before invalidating queries
 * so the disabled-on-conflict guard lifts as soon as the parent
 * re-renders with the refreshed plan.
 */
export function SchedulePanel({ plan, onRefresh }: SchedulePanelProps) {
  const readiness = usePlanReadiness(plan.id);
  const generate = useGenerateSchedule();
  const [forceRebuild, setForceRebuild] = useState(false);

  const backendError = generate.error instanceof BackendError ? generate.error : null;
  const isConflict =
    backendError?.intent === "stale-refresh" ||
    backendError?.status === 409 ||
    backendError?.status === 412;

  const readinessSignal =
    readiness.data?.kind === "loaded" ? readiness.data.readiness : null;
  const readyForGenerate = readinessSignal?.isReadyForScheduleGeneration ?? false;
  const readyForForceRegen = readinessSignal?.isReadyForForceRegeneration ?? false;

  // Pre-CP8 hardening D-9 pattern: disable while pending or while in
  // conflict (until Refresh).
  const enabled = forceRebuild
    ? readyForForceRegen && !isConflict && !generate.isPending
    : readyForGenerate && !isConflict && !generate.isPending;

  function handleRefresh() {
    generate.reset();
    onRefresh();
  }

  function handleGenerate() {
    generate.mutate({
      planId: plan.id,
      input: {
        force_rebuild: forceRebuild,
        expected_version: plan.version,
        // schedule_revision is optional in the body; send it when known.
        expected_schedule_revision: plan.scheduleRevision > 0 ? plan.scheduleRevision : null,
      },
    });
  }

  const blockerLabels = readinessSignal?.generationBlockers.map((b) => b.label) ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <ConflictPanel error={generate.error} onRefresh={handleRefresh} />
      {generate.error && !isConflict ? <ErrorState error={generate.error} /> : null}

      <label
        style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.9rem" }}
      >
        <input
          type="checkbox"
          checked={forceRebuild}
          onChange={(e) => setForceRebuild(e.target.checked)}
        />
        <span>Force rebuild (replaces any existing schedule)</span>
      </label>

      {blockerLabels.length > 0 ? (
        <ul style={{ paddingInlineStart: "1.25rem", margin: 0, fontSize: "0.85rem" }}>
          {blockerLabels.map((label, i) => (
            <li key={i}>{label}</li>
          ))}
        </ul>
      ) : null}

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <Button
          variant="primary"
          size="sm"
          isBusy={generate.isPending}
          disabled={!enabled}
          onClick={handleGenerate}
        >
          {generate.isPending
            ? forceRebuild
              ? "Rebuilding…"
              : "Generating…"
            : forceRebuild
              ? "Rebuild schedule"
              : "Generate schedule"}
        </Button>
        {!enabled && !generate.isPending && !isConflict ? (
          <span style={{ fontSize: "0.8rem", color: "#7a4a05" }}>
            {forceRebuild
              ? "Force rebuild isn't available yet."
              : "Schedule generation isn't available yet."}
          </span>
        ) : null}
      </div>
    </div>
  );
}
