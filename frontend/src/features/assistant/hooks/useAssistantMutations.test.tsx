import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import {
  useConfirmAssistantActionRun,
  useConfirmAssistantMemorySignal,
  useCreateAssistantConversation,
  useSendAssistantMessage,
} from "./useAssistantMutations";
import { useAssistantConversations } from "./useAssistantConversations";
import { useAssistantMessages } from "./useAssistantMessages";
import { useAssistantMemorySignals } from "./useAssistantMemorySignals";
import { useAssistantActionRuns } from "./useAssistantActionRuns";
import { makeQueryWrapper } from "@/test/react-query-wrapper";
import { BackendError } from "@/lib/errors/backend-error";

const fakeConversation = {
  id: 11,
  title: "Hi",
  status: "active",
  statusLabel: "Active",
  lastUserMessageAt: null,
  lastAssistantMessageAt: null,
  createdAt: "2026-05-13T10:00:00Z",
  updatedAt: "2026-05-13T10:00:00Z",
};

const fakeMessage = {
  id: 42,
  conversationId: 11,
  role: "assistant",
  roleLabel: "Assistant",
  content: "Hi back!",
  responseModeLabel: "General",
  governance: null,
  hasStructuredArtifacts: false,
  sequenceNumber: 2,
  isLatestInConversation: true,
  createdAt: "2026-05-13T10:00:05Z",
};

const fakeExchange = {
  conversation: fakeConversation,
  userMessage: {
    ...fakeMessage,
    id: 41,
    role: "user",
    roleLabel: "You",
    content: "Hi",
    responseModeLabel: null,
  },
  assistantMessage: fakeMessage,
  responseModeLabel: "General",
  governance: null,
  groundedEntities: [],
  suggestedActions: [],
  memoryCandidates: [],
  followUpQuestions: [],
};

const fakeMemorySignal = {
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
  status: "confirmed",
  statusLabel: "Confirmed",
  confidenceScore: 0.9,
  confidenceLabel: "90%",
  effectiveFrom: null,
  expiresAt: null,
  createdAt: "2026-05-13T10:00:05Z",
  updatedAt: "2026-05-13T10:00:10Z",
};

describe("CP9 assistant hooks — URLs + invalidation", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  test("useAssistantConversations GETs the dedicated /api/assistant/conversations (NOT /api/sola)", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input));
        // Dedicated handler returns the already-adapted Public shape (camelCase, no internals).
        return new Response(
          JSON.stringify([
            {
              id: 11,
              title: "Hi",
              status: "active",
              statusLabel: "Active",
              lastUserMessageAt: null,
              lastAssistantMessageAt: null,
              createdAt: "2026-05-13T10:00:00Z",
              updatedAt: "2026-05-13T10:00:00Z",
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    const { result } = renderHook(() => useAssistantConversations(), {
      wrapper: makeQueryWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls[0]).toContain("/api/assistant/conversations");
    expect(calls[0]).not.toContain("/api/sola");
  });

  test("useAssistantMessages GETs the dedicated /api/assistant/conversations/[id]/messages", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const { result } = renderHook(() => useAssistantMessages(11), { wrapper: makeQueryWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls[0]).toContain("/api/assistant/conversations/11/messages");
    expect(calls[0]).not.toContain("/api/sola");
  });

  test("useAssistantMemorySignals GETs the dedicated handler and forwards filters", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const { result } = renderHook(
      () =>
        useAssistantMemorySignals({
          conversationId: 11,
          effectiveOnly: true,
          statusFilter: "proposed",
        }),
      { wrapper: makeQueryWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls[0]).toContain("/api/assistant/memory-signals");
    expect(calls[0]).not.toContain("/api/sola");
    expect(calls[0]).toContain("conversation_id=11");
    expect(calls[0]).toContain("effective_only=true");
    expect(calls[0]).toContain("status_filter=proposed");
  });

  test("useAssistantActionRuns GETs the dedicated handler with conversation_id", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const { result } = renderHook(() => useAssistantActionRuns({ conversationId: 11 }), {
      wrapper: makeQueryWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls[0]).toContain("/api/assistant/action-runs?conversation_id=11");
    expect(calls[0]).not.toContain("/api/sola");
  });

  test("useCreateAssistantConversation POSTs /api/assistant/conversations (dedicated)", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return new Response(JSON.stringify(fakeConversation), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const { result } = renderHook(() => useCreateAssistantConversation(), {
      wrapper: makeQueryWrapper(),
    });
    await act(async () => {
      await result.current.mutateAsync({ title: "Hi" });
    });
    expect(calls[0]!.url).toContain("/api/assistant/conversations");
    expect(calls[0]!.url).not.toContain("/api/sola");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ title: "Hi" });
  });

  test("useSendAssistantMessage POSTs dedicated; conversationId in URL; final content from backend (no optimistic invention)", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return new Response(JSON.stringify(fakeExchange), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const { result } = renderHook(() => useSendAssistantMessage(), {
      wrapper: makeQueryWrapper(),
    });
    let returned: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync({ conversationId: 11, content: "Hi" });
    });
    expect(calls[0]!.url).toContain("/api/assistant/conversations/11/messages");
    expect(calls[0]!.url).not.toContain("/api/sola");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ content: "Hi" });
    // The hook returns the backend's exchange untouched — no frontend-invented final answer.
    expect(returned?.assistantMessage.content).toBe("Hi back!");
  });

  test("useConfirmAssistantMemorySignal POSTs dedicated with NO body", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return new Response(JSON.stringify(fakeMemorySignal), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const { result } = renderHook(() => useConfirmAssistantMemorySignal(), {
      wrapper: makeQueryWrapper(),
    });
    await act(async () => {
      await result.current.mutateAsync({ signalId: 91, conversationId: 11 });
    });
    expect(calls[0]!.url).toContain("/api/assistant/memory-signals/91/confirm");
    expect(calls[0]!.init?.body).toBeUndefined();
  });

  test("useConfirmAssistantActionRun routes to dedicated handler with empty body", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return new Response(
          JSON.stringify({
            id: 71,
            conversationId: 11,
            sourceMessageId: 42,
            actionType: "pause_active_plan",
            actionTypeLabel: "Pause active plan",
            isKnownActionType: true,
            status: "executed",
            statusLabel: "Completed",
            failureReasonLabel: null,
            createdAt: "x",
            updatedAt: "x",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    const { result } = renderHook(() => useConfirmAssistantActionRun(), {
      wrapper: makeQueryWrapper(),
    });
    await act(async () => {
      await result.current.mutateAsync({ actionRunId: 71, conversationId: 11 });
    });
    expect(calls[0]!.url).toContain("/api/assistant/action-runs/71/confirm");
    expect(calls[0]!.init?.body).toBeUndefined();
  });

  test("412 / 422 errors propagate as BackendError with no silent retry", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        return new Response(
          JSON.stringify({
            detail: "Validation failed.",
            error_code: "validation_error",
            request_id: "req-x",
          }),
          { status: 422, headers: { "content-type": "application/json" } },
        );
      }),
    );
    const { result } = renderHook(() => useSendAssistantMessage(), {
      wrapper: makeQueryWrapper(),
    });
    try {
      await act(async () => {
        await result.current.mutateAsync({ conversationId: 11, content: "x" });
      });
    } catch (err) {
      expect(err).toBeInstanceOf(BackendError);
      expect((err as BackendError).errorCode).toBe("validation_error");
    }
    expect(calls).toBe(1); // mutations.retry: false
  });
});
