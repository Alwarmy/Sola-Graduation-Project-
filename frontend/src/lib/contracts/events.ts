import { z } from "zod";

/**
 * B1.CP11 — User events contract.
 *
 * Mirrors backend `app/schemas/user_event.py:UserEventResponse`. The
 * backend carries `event_payload: dict` (open-shape) plus `user_id` —
 * both MUST be stripped before the browser sees them. The dedicated
 * CP11 GET handler at `/api/events` runs this adapter server-side.
 *
 * Known event types are mapped to safe English labels. Unknown types
 * fall back to "Learning activity" (per CP11 directive addendum §F).
 */

export const userEventResponseSchema = z
  .object({
    id: z.number().int(),
    user_id: z.number().int(),
    event_type: z.string(),
    event_payload: z.unknown().optional(),
    created_at: z.string(),
  })
  .passthrough();
export type UserEventResponse = z.infer<typeof userEventResponseSchema>;

// Mirrors backend `USER_EVENT_TYPES` (operational allow-list).
const KNOWN_EVENT_LABELS: Readonly<Record<string, string>> = {
  onboarding_completed: "Onboarding completed",
  search_performed: "Searched the catalog",
  recommendation_viewed: "Viewed a recommendation",
  recommendation_clicked: "Opened a recommendation",
  course_opened: "Opened a course",
  course_saved: "Saved a course",
  course_selected: "Selected a course",
  course_dismissed: "Dismissed a course",
  plan_created: "Created a plan",
  plan_item_started: "Started a scheduled item",
  plan_item_completed: "Completed a scheduled item",
  plan_item_delayed: "Delayed a scheduled item",
  plan_item_skipped: "Skipped a scheduled item",
  chat_message_sent: "Sent a message to the assistant",
  profile_updated: "Updated profile",
  assistant_memory_signal_confirmed: "Confirmed an assistant memory",
  assistant_memory_signal_superseded: "An assistant memory was superseded",
  assistant_memory_signal_expired: "An assistant memory expired",
  assistant_action_executed: "Assistant action ran",
};

/**
 * Map a backend `event_type` to a safe English label. Unknown values
 * map to the generic safe fallback per directive §F.
 */
export function learnerEventTypeLabel(value: string | null | undefined): string {
  if (typeof value !== "string" || value.trim().length === 0) return "Learning activity";
  const direct = KNOWN_EVENT_LABELS[value.trim()];
  if (direct) return direct;
  return "Learning activity";
}

export function isKnownLearnerEventType(value: string): boolean {
  return Object.prototype.hasOwnProperty.call(KNOWN_EVENT_LABELS, value);
}

export type PublicLearnerEvent = {
  id: number;
  /** Backend type kept internally for filtering; never shown raw. */
  eventType: string;
  /** Safe humanized label (unknown → "Learning activity"). */
  eventTypeLabel: string;
  isKnownEventType: boolean;
  createdAt: string;
};

export function toPublicLearnerEvent(e: UserEventResponse): PublicLearnerEvent {
  return {
    id: e.id,
    eventType: e.event_type,
    eventTypeLabel: learnerEventTypeLabel(e.event_type),
    isKnownEventType: isKnownLearnerEventType(e.event_type),
    createdAt: e.created_at,
  };
}
