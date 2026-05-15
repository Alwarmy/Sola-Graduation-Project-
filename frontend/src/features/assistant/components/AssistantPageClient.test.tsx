import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AssistantPageClient } from "./AssistantPageClient";
import { makeQueryWrapper } from "@/test/react-query-wrapper";

const TOKEN_LEAK_SENTINELS = [
  "access_token",
  "refresh_token",
  "session_id",
  "sola_access",
] as const;
const INTERNAL_LEAK_WORDS = [
  "preview_payload",
  "request_payload",
  "result_payload",
  "signal_value",
  "signal_metadata",
  "used_context_summary",
  "context_snapshot",
  "message_metadata",
] as const;

function assertNoLeak(rootText: string) {
  for (const sentinel of TOKEN_LEAK_SENTINELS) expect(rootText).not.toContain(sentinel);
  const lower = rootText.toLowerCase();
  for (const w of INTERNAL_LEAK_WORDS) expect(lower).not.toContain(w);
}

// ---- next/link mock so JSDOM doesn't error on the typed Route<...> -------
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={String(href)} {...rest}>
      {children}
    </a>
  ),
}));

describe("AssistantPageClient (CP9)", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  test("anonymous: renders ProtectedState with /login link, never calls assistant routes", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith("/api/auth/session")) {
          return new Response(JSON.stringify({ user: null }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({}), { status: 500 });
      }),
    );
    const { container } = render(<AssistantPageClient />, { wrapper: makeQueryWrapper() });
    expect(await screen.findByText(/Sign in to chat with the assistant\./)).toBeInTheDocument();
    const signIn = screen.getByText("Sign in");
    expect(signIn.getAttribute("href")).toBe("/login");
    // No assistant call before auth.
    expect(calls.every((u) => !u.includes("/api/sola/assistant") && !u.includes("/api/assistant"))).toBe(
      true,
    );
    assertNoLeak(container.textContent ?? "");
  });

  test("authed + empty conversations: honest empty state, no fake assistant content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/auth/session")) {
          return new Response(
            JSON.stringify({ user: { id: 1, email: "u@example.com", fullName: "U" } }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes("/api/assistant/conversations") && !url.includes("/messages")) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (
          url.includes("/api/assistant/memory-signals") ||
          url.includes("/api/assistant/action-runs")
        ) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const { container } = render(<AssistantPageClient />, { wrapper: makeQueryWrapper() });
    expect(await screen.findByText(/No conversations yet/)).toBeInTheDocument();
    expect(
      await screen.findByText(/No assistant memory yet/),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/No suggested actions yet/),
    ).toBeInTheDocument();
    // No active conversation yet → pre-thread hint shown.
    expect(
      await screen.findByText(/Open a conversation from the list above/),
    ).toBeInTheDocument();
    assertNoLeak(container.textContent ?? "");
  });

  test("authed + conversation with backend messages: final assistant content is backend-authored only", async () => {
    // Dedicated handlers now return PublicAssistantMessage[] (camelCase, no internals)
    const userPub = {
      id: 41,
      conversationId: 11,
      role: "user",
      roleLabel: "You",
      content: "Hi",
      responseModeLabel: null,
      governance: null,
      hasStructuredArtifacts: false,
      sequenceNumber: 1,
      isLatestInConversation: false,
      createdAt: "2026-05-13T10:00:00Z",
    };
    const assistantPub = {
      id: 42,
      conversationId: 11,
      role: "assistant",
      roleLabel: "Assistant",
      content: "Here is what I see in your active plan today.",
      responseModeLabel: "Schedule guidance",
      governance: {
        status: "ready",
        statusLabel: "Ready",
        blockingReasonLabel: null,
        requiresClarification: false,
        canSuggestActions: false,
      },
      hasStructuredArtifacts: false,
      sequenceNumber: 2,
      isLatestInConversation: true,
      createdAt: "2026-05-13T10:00:05Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/auth/session")) {
          return new Response(
            JSON.stringify({ user: { id: 1, email: "u@example.com", fullName: "U" } }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.endsWith("/api/assistant/conversations")) {
          return new Response(
            JSON.stringify([
              {
                id: 11,
                title: "Schedule",
                status: "active",
                statusLabel: "Active",
                lastUserMessageAt: "2026-05-13T10:00:00Z",
                lastAssistantMessageAt: "2026-05-13T10:00:05Z",
                createdAt: "2026-05-13T09:30:00Z",
                updatedAt: "2026-05-13T10:00:05Z",
              },
            ]),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes("/api/assistant/conversations/11/messages")) {
          return new Response(JSON.stringify([userPub, assistantPub]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (
          url.includes("/api/assistant/memory-signals") ||
          url.includes("/api/assistant/action-runs")
        ) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const user = userEvent.setup();
    const { container } = render(<AssistantPageClient />, { wrapper: makeQueryWrapper() });
    // Wait for conversations to load and click "Open" on conversation #11.
    const openButtons = await screen.findAllByRole("button", { name: /^Open$/ });
    await user.click(openButtons[0]!);
    // Backend's assistant content is rendered verbatim.
    expect(
      await screen.findByText(/Here is what I see in your active plan today\./),
    ).toBeInTheDocument();
    // Response mode label appears.
    expect(await screen.findByText(/Schedule guidance/)).toBeInTheDocument();
    // Composer is mounted.
    expect(await screen.findByLabelText(/Message/i)).toBeInTheDocument();
    // No internal payload leak in the rendered DOM.
    assertNoLeak(container.textContent ?? "");
  });

  test("memory signal Confirm button requires explicit click; no auto-confirm on render", async () => {
    // Dedicated handler now returns PublicAssistantMemorySignal (camelCase, no value/metadata).
    const memorySignalPub = {
      id: 91,
      conversationId: 11,
      sourceMessageId: 41,
      signalType: "schedule_preference",
      signalTypeLabel: "Schedule preference",
      signalKey: "preferred_time_window",
      signalKeyLabel: "Preferred study window",
      signalSummary: "Prefers evenings.",
      scope: "durable_preference",
      scopeLabel: "Long-term preference",
      status: "proposed",
      statusLabel: "Proposed",
      confidenceScore: 0.88,
      confidenceLabel: "88%",
      effectiveFrom: null,
      expiresAt: null,
      createdAt: "x",
      updatedAt: "x",
    };
    const fetchCalls: { url: string; method: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push({ url, method: init?.method ?? "GET" });
        if (url.endsWith("/api/auth/session")) {
          return new Response(
            JSON.stringify({ user: { id: 1, email: "u@example.com", fullName: "U" } }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.endsWith("/api/assistant/conversations")) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("/api/assistant/memory-signals/91/confirm")) {
          return new Response(JSON.stringify({ ...memorySignalPub, status: "confirmed", statusLabel: "Confirmed" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("/api/assistant/memory-signals")) {
          return new Response(JSON.stringify([memorySignalPub]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("/api/assistant/action-runs")) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const user = userEvent.setup();
    render(<AssistantPageClient />, { wrapper: makeQueryWrapper() });
    const confirmButton = await screen.findByRole("button", { name: /Confirm memory/ });
    // No confirm call before click.
    expect(
      fetchCalls.some((c) => c.url.includes("/api/assistant/memory-signals/91/confirm")),
    ).toBe(false);
    await user.click(confirmButton);
    await waitFor(() =>
      expect(
        fetchCalls.some(
          (c) =>
            c.url.includes("/api/assistant/memory-signals/91/confirm") && c.method === "POST",
        ),
      ).toBe(true),
    );
  });

  test("action run Confirm button requires explicit click + unknown action_type is disabled, not hidden", async () => {
    // Dedicated handler now returns PublicAssistantActionRun (camelCase, no payloads).
    const knownRunPub = {
      id: 71,
      conversationId: 11,
      sourceMessageId: 42,
      actionType: "pause_active_plan",
      actionTypeLabel: "Pause active plan",
      isKnownActionType: true,
      status: "proposed",
      statusLabel: "Proposed",
      failureReasonLabel: null,
      createdAt: "x",
      updatedAt: "x",
    };
    const unknownRunPub = {
      ...knownRunPub,
      id: 72,
      actionType: "future_unknown_action",
      actionTypeLabel: "Future Unknown Action",
      isKnownActionType: false,
    };
    const fetchCalls: { url: string; method: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push({ url, method: init?.method ?? "GET" });
        if (url.endsWith("/api/auth/session")) {
          return new Response(
            JSON.stringify({ user: { id: 1, email: "u@example.com", fullName: "U" } }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.endsWith("/api/assistant/conversations")) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("/api/assistant/memory-signals")) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("/api/assistant/action-runs")) {
          return new Response(JSON.stringify([knownRunPub, unknownRunPub]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    const user = userEvent.setup();
    const { container } = render(<AssistantPageClient />, { wrapper: makeQueryWrapper() });
    // Known action: Confirm button is enabled.
    expect(await screen.findByText("Pause active plan")).toBeInTheDocument();
    const knownConfirm = await screen.findByRole("button", { name: /Confirm action/ });
    expect(knownConfirm).toBeEnabled();
    // Unknown action: card renders with "Not available yet" badge.
    expect(await screen.findByText(/Not available yet/)).toBeInTheDocument();
    expect(await screen.findByText("Future Unknown Action")).toBeInTheDocument();
    // No silent confirm.
    expect(fetchCalls.some((c) => c.url.includes("/confirm"))).toBe(false);
    await user.click(knownConfirm);
    await waitFor(() =>
      expect(
        fetchCalls.some(
          (c) =>
            c.url.includes("/api/assistant/action-runs/71/confirm") && c.method === "POST",
        ),
      ).toBe(true),
    );
    assertNoLeak(container.textContent ?? "");
  });
});
