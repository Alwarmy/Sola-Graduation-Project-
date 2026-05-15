import { describe, expect, test } from "vitest";

import {
  isKnownLearnerEventType,
  learnerEventTypeLabel,
  toPublicLearnerEvent,
} from "@/lib/contracts/events";

const baseEvent = {
  id: 1,
  user_id: 275,
  event_type: "course_opened",
  event_payload: {
    course_id: 99,
    referrer: "internal_pipeline",
    DO_NOT_LEAK: "raw_payload_internal",
  },
  created_at: "2026-05-14T09:00:00Z",
};

describe("learner-events contracts (B1.CP11)", () => {
  test("known event types map to safe English labels", () => {
    expect(learnerEventTypeLabel("plan_item_completed")).toBe("Completed a scheduled item");
    expect(learnerEventTypeLabel("chat_message_sent")).toBe(
      "Sent a message to the assistant",
    );
    expect(learnerEventTypeLabel("course_opened")).toBe("Opened a course");
  });

  test("unknown event types fall back to generic 'Learning activity' (directive §F)", () => {
    expect(learnerEventTypeLabel("brand_new_event_type")).toBe("Learning activity");
    expect(learnerEventTypeLabel("")).toBe("Learning activity");
    expect(learnerEventTypeLabel(null)).toBe("Learning activity");
    expect(learnerEventTypeLabel(undefined)).toBe("Learning activity");
  });

  test("isKnownLearnerEventType correctly classifies known/unknown", () => {
    expect(isKnownLearnerEventType("course_opened")).toBe(true);
    expect(isKnownLearnerEventType("totally_new_type")).toBe(false);
  });

  test("toPublicLearnerEvent strips event_payload + user_id; safe label set", () => {
    const pub = toPublicLearnerEvent(baseEvent);
    expect(pub.id).toBe(1);
    expect(pub.eventType).toBe("course_opened");
    expect(pub.eventTypeLabel).toBe("Opened a course");
    expect(pub.isKnownEventType).toBe(true);
    const json = JSON.stringify(pub);
    expect(json).not.toContain("event_payload");
    expect(json).not.toContain("user_id");
    expect(json).not.toContain("DO_NOT_LEAK");
    expect(json).not.toContain("referrer");
    expect(json).not.toContain("internal_pipeline");
  });

  test("unknown event type renders generic label and isKnownEventType=false", () => {
    const pub = toPublicLearnerEvent({
      ...baseEvent,
      id: 2,
      event_type: "future_unknown_event",
    });
    expect(pub.eventTypeLabel).toBe("Learning activity");
    expect(pub.isKnownEventType).toBe(false);
    // The raw type is preserved internally for filtering/keys but is
    // never rendered as product copy.
    expect(pub.eventType).toBe("future_unknown_event");
  });
});
