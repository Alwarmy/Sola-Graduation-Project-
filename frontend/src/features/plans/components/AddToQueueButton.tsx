"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { useSession } from "@/features/auth/hooks/useSession";
import { useAddCourseToQueue } from "@/features/plans/hooks/usePlanQueue";
import { BackendError } from "@/lib/errors/backend-error";

export type AddToQueueButtonProps = {
  courseId: number | string;
  size?: "sm" | "md";
};

/**
 * Add-to-queue action surfaced from CP6 course cards/detail. Authenticated
 * users hit the CP7 server-side handler at `/api/plans/queue/[id]` which
 * calls backend `POST /plans/queue/{course_id}`. Anonymous users see a
 * sign-in CTA — we do NOT fake a queued state locally.
 *
 * Backend confirmation is required before any UI signal of "added".
 * Duplicates / conflicts surface as a safe inline message.
 */
export function AddToQueueButton({ courseId, size = "sm" }: AddToQueueButtonProps) {
  const session = useSession();
  const add = useAddCourseToQueue();
  const [feedback, setFeedback] = useState<string | null>(null);

  if (session.isLoading) return null;
  const user = session.data?.user ?? null;

  if (!user) {
    return (
      <Link
        href="/login"
        style={{
          display: "inline-block",
          padding: "0.35rem 0.7rem",
          borderRadius: 6,
          border: "1px solid #d6d6d6",
          color: "#111",
          textDecoration: "none",
          fontSize: "0.875rem",
        }}
      >
        Sign in to add to your plan queue
      </Link>
    );
  }

  function handleClick() {
    setFeedback(null);
    add.mutate(
      { courseId },
      {
        onSuccess: () => setFeedback("Added to your plan queue."),
        onError: (err) => {
          if (err instanceof BackendError) {
            if (err.status === 409) {
              setFeedback("Already in your plan queue.");
              return;
            }
            if (err.intent === "validation") {
              setFeedback("This course can't be added right now.");
              return;
            }
            if (err.intent === "rate-limited") {
              setFeedback("Too many attempts. Please wait a moment and try again.");
              return;
            }
            if (err.intent === "unavailable") {
              setFeedback("Queue is temporarily unavailable. Please try again later.");
              return;
            }
          }
          setFeedback("Something went wrong. Please try again.");
        },
      },
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", alignItems: "flex-start" }}>
      <Button variant="secondary" size={size} isBusy={add.isPending} onClick={handleClick}>
        {add.isPending ? "Adding…" : add.isSuccess ? "In your queue" : "Add to plan queue"}
      </Button>
      {feedback ? (
        <span style={{ fontSize: "0.8rem", color: "#555" }} role="status">
          {feedback}
        </span>
      ) : null}
    </div>
  );
}
