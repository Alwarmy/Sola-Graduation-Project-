import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AddToQueueButton } from "./AddToQueueButton";
import { makeQueryWrapper } from "@/test/react-query-wrapper";

function sessionResponse(user: { id: number; email: string; fullName: string } | null) {
  return new Response(JSON.stringify({ user }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function queueItemResponse(courseId: number) {
  return new Response(
    JSON.stringify({
      id: 11,
      courseId,
      status: "queued",
      statusLabel: "Queued",
      note: null,
      createdAt: "x",
      updatedAt: "x",
      course: {
        id: courseId,
        title: "S",
        source: "youtube",
        providerDisplayName: "YouTube",
        contentFormatLabel: "Video",
        difficultyLabel: null,
        durationLabel: null,
        pricingLabel: null,
        instructorDisplayName: null,
        language: null,
        topicTagLabels: [],
        progressionLabel: null,
        qualityTier: null,
        cardSummary: null,
        shortDescription: null,
        badges: [],
      },
    }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}

describe("AddToQueueButton — CP6 integration", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  test("anonymous: renders sign-in CTA, never calls /api/plans/queue/*", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("/api/auth/session")) return sessionResponse(null);
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
    render(<AddToQueueButton courseId={42} />, { wrapper: makeQueryWrapper() });
    expect(await screen.findByText(/sign in to add to your plan queue/i)).toBeInTheDocument();
    expect(calls.some((u) => u.includes("/api/plans/queue/"))).toBe(false);
  });

  test("authenticated: clicks POST /api/plans/queue/<courseId> and shows success", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.includes("/api/auth/session"))
          return sessionResponse({ id: 1, email: "u@example.com", fullName: "U" });
        if (url.includes("/api/plans/queue/42")) return queueItemResponse(42);
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
    render(<AddToQueueButton courseId={42} />, { wrapper: makeQueryWrapper() });
    const btn = await screen.findByRole("button", { name: /add to plan queue/i });
    await userEvent.setup().click(btn);
    expect(await screen.findByText(/Added to your plan queue\./i)).toBeInTheDocument();
    const post = calls.find((c) => c.url.includes("/api/plans/queue/42"));
    expect(post).toBeDefined();
    expect(post?.init?.method).toBe("POST");
  });

  test("409 conflict: shows safe duplicate copy (no raw detail leak)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/session"))
          return sessionResponse({ id: 1, email: "u@example.com", fullName: "U" });
        return new Response(
          JSON.stringify({ detail: "Internal raw — DO NOT LEAK", error_code: "queue_item_already_exists" }),
          { status: 409, headers: { "content-type": "application/json" } },
        );
      }),
    );
    render(<AddToQueueButton courseId={42} />, { wrapper: makeQueryWrapper() });
    const btn = await screen.findByRole("button", { name: /add to plan queue/i });
    await userEvent.setup().click(btn);
    expect(await screen.findByText(/Already in your plan queue\./i)).toBeInTheDocument();
    expect(screen.queryByText(/Internal raw/)).not.toBeInTheDocument();
    expect(screen.queryByText(/queue_item_already_exists/)).not.toBeInTheDocument();
  });
});
