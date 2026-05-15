"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { ErrorState } from "@/components/states/ErrorState";
import { ValidationErrors } from "@/components/states/ValidationErrors";

import { BackendError } from "@/lib/errors/backend-error";
import { useCreatePlan } from "@/features/plans/hooks/usePlans";
import { usePlanQueue } from "@/features/plans/hooks/usePlanQueue";
import {
  learningPlanCreateRequestSchema,
  type LearningPlanCreateRequest,
} from "@/lib/contracts/plans";

export type CreatePlanFormProps = {
  selectedQueueItemIds: number[];
  onClearSelection?: () => void;
};

export function CreatePlanForm({ selectedQueueItemIds, onClearSelection }: CreatePlanFormProps) {
  const queue = usePlanQueue();
  const create = useCreatePlan();
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof LearningPlanCreateRequest, string>>>({});

  // Selection guard: backend caps queue_item_ids at 1–3.
  const selectionValid = selectedQueueItemIds.length >= 1 && selectedQueueItemIds.length <= 3;
  const queueHasItems = (queue.data?.length ?? 0) > 0;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    const payload: LearningPlanCreateRequest = {
      title: title.trim(),
      goal: goal.trim(),
      queue_item_ids: [...selectedQueueItemIds],
    };
    const parsed = learningPlanCreateRequestSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Partial<Record<keyof LearningPlanCreateRequest, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof LearningPlanCreateRequest | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setFieldErrors(next);
      return;
    }
    create.mutate(parsed.data, {
      onSuccess: () => {
        setTitle("");
        setGoal("");
        onClearSelection?.();
      },
    });
  }

  const backendError = create.error instanceof BackendError ? create.error : null;
  const isValidationError = backendError?.errorCode === "request_validation_error";

  return (
    <form onSubmit={onSubmit} noValidate>
      {create.error && !isValidationError ? (
        <div style={{ marginBottom: "1rem" }}>
          <ErrorState error={create.error} />
        </div>
      ) : null}
      {isValidationError && backendError ? (
        <div style={{ marginBottom: "1rem" }}>
          <ValidationErrors source={backendError} />
        </div>
      ) : null}

      {!queueHasItems ? (
        <p style={{ color: "#555", fontSize: "0.9rem" }}>
          Add courses to your queue first, then come back to create a plan.
        </p>
      ) : null}

      <div style={{ display: "grid", gap: "0.9rem" }}>
        <FormField label="Plan title" error={fieldErrors.title} required>
          {(api) => (
            <Input
              type="text"
              maxLength={255}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              {...api}
            />
          )}
        </FormField>
        <FormField
          label="Goal"
          hint="What do you want to accomplish with this plan?"
          error={fieldErrors.goal}
          required
        >
          {(api) => (
            <Textarea
              rows={2}
              maxLength={2000}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              required
              {...api}
            />
          )}
        </FormField>
        <FormField
          label="Selected queued courses"
          hint="Pick 1 to 3 queued courses to include in the plan."
          error={fieldErrors.queue_item_ids}
        >
          {() => (
            <div style={{ fontSize: "0.875rem", color: selectionValid ? "#14692f" : "#555" }}>
              {selectedQueueItemIds.length === 0
                ? "No queued courses selected."
                : `${selectedQueueItemIds.length} queued course${selectedQueueItemIds.length === 1 ? "" : "s"} selected.`}
            </div>
          )}
        </FormField>
        <Button
          type="submit"
          isBusy={create.isPending}
          disabled={!queueHasItems || !selectionValid}
        >
          {create.isPending ? "Creating plan…" : "Create plan"}
        </Button>
      </div>
    </form>
  );
}
