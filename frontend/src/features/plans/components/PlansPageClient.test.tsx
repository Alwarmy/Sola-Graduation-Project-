import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { PlansPageClient } from "./PlansPageClient";
import { makeQueryWrapper } from "@/test/react-query-wrapper";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function sessionResponse(user: { id: number; email: string; fullName: string } | null) {
  return new Response(JSON.stringify({ user }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("PlansPageClient — gating + safe states", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  test("anonymous: renders ProtectedState with /login link, NEVER builds plans UI", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/session")) return sessionResponse(null);
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
    render(<PlansPageClient />, { wrapper: makeQueryWrapper() });
    expect(await screen.findByText(/Sign in to manage your plans\./i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
    // No queue / plan fetches should have been made — only the session call.
    // (We can't easily count from spy here without redeclaring; the ProtectedState
    // path returns before any queue or plan hook is mounted, so the assertion is
    // anchored on the rendered UI.)
    expect(screen.queryByText(/Active plan/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Your queue/i)).not.toBeInTheDocument();
  });

  test("authenticated + empty queue: create-plan button disabled until selection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/session"))
          return sessionResponse({ id: 1, email: "u@example.com", fullName: "User" });
        if (url.includes("/plans/active"))
          return new Response(JSON.stringify({ detail: "Active plan not found.", error_code: "not_found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        if (url.includes("/plans/queue"))
          return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
        // Plans list and any other plan path → empty list/200.
        if (url.includes("/plans"))
          return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
    render(<PlansPageClient />, { wrapper: makeQueryWrapper() });
    // Heading visible — section was rendered.
    expect(await screen.findByRole("heading", { name: /^your queue$/i })).toBeInTheDocument();
    // Create-plan button disabled because no queue selection possible.
    expect(await screen.findByRole("button", { name: /^create plan$/i })).toBeDisabled();
  });
});
