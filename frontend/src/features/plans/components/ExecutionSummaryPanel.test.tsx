import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ExecutionSummaryPanel } from "./ExecutionSummaryPanel";
import type { PublicExecutionSummary } from "@/lib/contracts/plan-execution";
import { makeQueryWrapper } from "@/test/react-query-wrapper";

/**
 * Pre-CP12 hardening: ExecutionSummaryPanel must no longer render the
 * misleading backend `completionRateLabel` while
 * NOTE-CP9-CP10-H1-EXECUTION-SUMMARY-001 is open. These tests assert
 * counts are visible and the percent string is NEVER in the DOM.
 */

function summary(overrides: Partial<PublicExecutionSummary> = {}): PublicExecutionSummary {
  return {
    planId: 204,
    planStatus: "active",
    planStatusLabel: "Active",
    totalItems: 81,
    pendingItemsCount: 80,
    inProgressItemsCount: 0,
    completedItemsCount: 1,
    skippedItemsCount: 0,
    overdueItemsCount: 0,
    dueTodayItemsCount: 4,
    completionRate: 0.0123,
    completionRateLabel: "100%",
    isPlanFinished: false,
    canMarkCompleted: false,
    nextActionableItemId: 5001,
    nextActionableScheduledDate: "2026-05-15",
    nextActionableTitle: "Read chapter 1",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("ExecutionSummaryPanel — H-1 hardened display", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  test("renders counts and the safe under-review note; never renders backend completionRateLabel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/plans/204/execution-summary")) {
          return jsonResponse(summary());
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const { container } = render(<ExecutionSummaryPanel planId={204} />, {
      wrapper: makeQueryWrapper(),
    });

    // Counts are visible as the primary surface.
    expect(await screen.findByText(/^Total$/)).toBeInTheDocument();
    expect(screen.getByText(/^Completed$/)).toBeInTheDocument();
    expect(screen.getByText(/^In progress$/)).toBeInTheDocument();
    expect(screen.getByText(/^Pending$/)).toBeInTheDocument();
    expect(screen.getByText(/^Skipped$/)).toBeInTheDocument();
    expect(screen.getByText(/^Due today$/)).toBeInTheDocument();
    expect(screen.getByText(/^Overdue$/)).toBeInTheDocument();

    // Safe under-review copy is present.
    expect(
      screen.getByTestId("execution-summary-h1-safe-note"),
    ).toHaveTextContent(/Progress percentage is under review/i);

    // Backend completionRateLabel ("100%") MUST NOT appear in the DOM.
    const dom = container.textContent ?? "";
    expect(dom).not.toMatch(/100%/);
    expect(dom).not.toMatch(/99%/);
    // The previous "X% complete" badge phrasing must also be gone.
    expect(dom).not.toMatch(/% complete/i);
    expect(dom).not.toMatch(/Backend reports completion rate/i);
  });

  test("H-1 worst case (1/81 → backend says 99%): still no percent in DOM", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/plans/204/execution-summary")) {
          return jsonResponse(
            summary({
              completionRateLabel: "99%",
              completionRate: 0.99,
            }),
          );
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const { container } = render(<ExecutionSummaryPanel planId={204} />, {
      wrapper: makeQueryWrapper(),
    });

    expect(await screen.findByText(/^Total$/)).toBeInTheDocument();
    const dom = container.textContent ?? "";
    expect(dom).not.toMatch(/99%/);
    expect(dom).not.toMatch(/100%/);
    expect(dom).not.toMatch(/% complete/i);
    // Counts are still the reliable surface.
    expect(screen.getByTestId("execution-summary-h1-safe-note")).toBeInTheDocument();
  });

  test("totalItems=0 → empty state, no counts and no percent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/plans/204/execution-summary")) {
          return jsonResponse(
            summary({
              totalItems: 0,
              pendingItemsCount: 0,
              completedItemsCount: 0,
              dueTodayItemsCount: 0,
              completionRateLabel: "0%",
              completionRate: 0,
              nextActionableItemId: null,
              nextActionableScheduledDate: null,
              nextActionableTitle: null,
            }),
          );
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const { container } = render(<ExecutionSummaryPanel planId={204} />, {
      wrapper: makeQueryWrapper(),
    });

    expect(
      await screen.findByText(/No execution data yet/i),
    ).toBeInTheDocument();
    const dom = container.textContent ?? "";
    expect(dom).not.toMatch(/0%/);
    expect(dom).not.toMatch(/% complete/i);
  });
});
