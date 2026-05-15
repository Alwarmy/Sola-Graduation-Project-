"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { ErrorState } from "@/components/states/ErrorState";

import { useUpdatePlanStatus } from "@/features/plans/hooks/usePlanMutations";
import { BackendError } from "@/lib/errors/backend-error";
import {
  PLAN_STATUS_OPTIONS,
  planStatusLabel,
  type PublicLearningPlan,
} from "@/lib/contracts/plans";
import { ConflictPanel } from "./ConflictPanel";

export type StatusControlProps = {
  plan: PublicLearningPlan;
  onRefresh: () => void;
};

export function StatusControl({ plan, onRefresh }: StatusControlProps) {
  const update = useUpdatePlanStatus();
  const [status, setStatus] = useState<string>(plan.status);
  const backendError = update.error instanceof BackendError ? update.error : null;
  const isConflict =
    backendError?.intent === "stale-refresh" ||
    backendError?.status === 409 ||
    backendError?.status === 412;

  // Pre-CP8 hardening D-9: while a stale-version conflict is pending we must
  // NOT let the user submit again with the cached `plan.version` — the
  // request would just 412 again. Force them through Refresh first.
  const submitDisabled = status === plan.status || isConflict;

  function handleRefresh() {
    // Clear the local error first so the disabled state lifts as soon as
    // the parent re-renders with the refreshed plan version.
    update.reset();
    onRefresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <ConflictPanel error={update.error} onRefresh={handleRefresh} />
      {update.error && !isConflict ? <ErrorState error={update.error} /> : null}
      <FormField label="Plan status">
        {(api) => (
          <Select value={status} onChange={(e) => setStatus(e.target.value)} {...api}>
            {PLAN_STATUS_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {planStatusLabel(v)}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <Button
        variant="secondary"
        size="sm"
        isBusy={update.isPending}
        disabled={submitDisabled}
        onClick={() =>
          update.mutate({
            planId: plan.id,
            input: { status, expected_version: plan.version },
          })
        }
      >
        {update.isPending ? "Updating…" : "Update status"}
      </Button>
    </div>
  );
}
