import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RegisterForm } from "./RegisterForm";
import { makeQueryWrapper } from "@/test/react-query-wrapper";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const TOKEN_LEAK_SENTINELS = ["access_token", "refresh_token", "session_id"] as const;
const FORBIDDEN_INTERNAL_WORDS = [
  "ingest",
  "ingestion",
  "raw scraped",
  "pipeline",
  "admin console",
  "api_key",
  "stack trace",
] as const;

function assertNoSensitiveOrInternalLeak(rootText: string) {
  for (const sentinel of TOKEN_LEAK_SENTINELS) {
    expect(rootText, `token-key leak: ${sentinel}`).not.toContain(sentinel);
  }
  for (const word of FORBIDDEN_INTERNAL_WORDS) {
    expect(rootText.toLowerCase(), `internal-word leak: ${word}`).not.toContain(word);
  }
}

describe("RegisterForm", () => {
  beforeEach(() => {
    push.mockClear();
    vi.unstubAllGlobals();
  });
  afterEach(() => vi.unstubAllGlobals());

  test("renders all required fields safely", async () => {
    const { container } = render(<RegisterForm />, { wrapper: makeQueryWrapper() });
    expect(await screen.findByLabelText(/full name/i)).toBeInTheDocument();
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(await screen.findByLabelText(/password/i)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /create account/i })).toBeInTheDocument();
    assertNoSensitiveOrInternalLeak(container.textContent ?? "");
  });

  test("short password trips client-side validation; no fetch issued", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();
    render(<RegisterForm />, { wrapper: makeQueryWrapper() });
    await user.type(await screen.findByLabelText(/full name/i), "New User");
    await user.type(await screen.findByLabelText(/email/i), "newuser@example.com");
    await user.type(await screen.findByLabelText(/password/i), "12345");
    await user.click(await screen.findByRole("button", { name: /create account/i }));

    // Pre-CP8 hardening D-1: human-safe Zod copy, NOT Zod's default
    // "String must contain at least 6 character(s)".
    expect(await screen.findByText("Use at least 6 characters.")).toBeInTheDocument();
    expect(screen.queryByText(/String must contain at least/i)).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  test("Pre-CP8 hardening D-1: blank full_name and invalid email show safe copy, not raw Zod defaults", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();
    const { container } = render(<RegisterForm />, { wrapper: makeQueryWrapper() });

    // Submit with blank full_name + invalid email + short password
    await user.type(await screen.findByLabelText(/email/i), "not-an-email");
    await user.type(await screen.findByLabelText(/password/i), "1");
    await user.click(await screen.findByRole("button", { name: /create account/i }));

    expect(await screen.findByText("Please enter your name.")).toBeInTheDocument();
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(await screen.findByText("Use at least 6 characters.")).toBeInTheDocument();
    // No raw Zod default copy.
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/String must contain at least/);
    expect(text).not.toMatch(/Invalid email/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("successful register: posts to /api/auth/register and routes to /login?registered=1 (no auto-login)", async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain("/api/auth/register");
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      expect(body).toEqual({
        email: "newuser@example.com",
        full_name: "New User",
        password: "secret123",
      });
      return new Response(
        JSON.stringify({ user: { id: 99, email: "newuser@example.com", fullName: "New User" } }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();
    render(<RegisterForm />, { wrapper: makeQueryWrapper() });
    await user.type(await screen.findByLabelText(/full name/i), "New User");
    await user.type(await screen.findByLabelText(/email/i), "newuser@example.com");
    await user.type(await screen.findByLabelText(/password/i), "secret123");
    await user.click(await screen.findByRole("button", { name: /create account/i }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/login?registered=1"));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("backend 409 conflict: renders safe message, raw detail/code do NOT leak, no navigation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            detail: "Email already registered.",
            error_code: "email_already_registered",
            request_id: "req-409",
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const user = userEvent.setup();
    const { container } = render(<RegisterForm />, { wrapper: makeQueryWrapper() });
    await user.type(await screen.findByLabelText(/full name/i), "Taken");
    await user.type(await screen.findByLabelText(/email/i), "taken@example.com");
    await user.type(await screen.findByLabelText(/password/i), "secret123");
    await user.click(await screen.findByRole("button", { name: /create account/i }));

    // The raw backend text/code must not be rendered.
    await vi.waitFor(() => {
      expect(screen.queryByText(/Email already registered/)).not.toBeInTheDocument();
      expect(screen.queryByText(/email_already_registered/)).not.toBeInTheDocument();
    });
    expect(push).not.toHaveBeenCalled();
    assertNoSensitiveOrInternalLeak(container.textContent ?? "");
  });
});
