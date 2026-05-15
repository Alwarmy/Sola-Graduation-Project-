import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LoginForm } from "./LoginForm";
import { FALLBACK } from "@/lib/copy/fallback";
import { makeQueryWrapper } from "@/test/react-query-wrapper";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
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
  "traceback",
] as const;

function assertNoSensitiveOrInternalLeak(rootText: string) {
  for (const sentinel of TOKEN_LEAK_SENTINELS) {
    expect(rootText, `token-key leak: ${sentinel}`).not.toContain(sentinel);
  }
  for (const word of FORBIDDEN_INTERNAL_WORDS) {
    expect(rootText.toLowerCase(), `internal-word leak: ${word}`).not.toContain(word);
  }
}

describe("LoginForm", () => {
  beforeEach(() => {
    push.mockClear();
    vi.unstubAllGlobals();
  });
  afterEach(() => vi.unstubAllGlobals());

  test("renders email + password fields and a submit button safely", async () => {
    const { container } = render(<LoginForm />, { wrapper: makeQueryWrapper() });
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(await screen.findByLabelText(/password/i)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /sign in/i })).toBeInTheDocument();
    assertNoSensitiveOrInternalLeak(container.textContent ?? "");
  });

  test("client-side validation blocks submit; no /api/auth/login fetch issued", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();
    render(<LoginForm />, { wrapper: makeQueryWrapper() });
    await user.click(await screen.findByRole("button", { name: /sign in/i }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  test("valid credentials: posts to /api/auth/login and routes to /", async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain("/api/auth/login");
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      expect(body).toEqual({ email: "u@example.com", password: "secret123" });
      return new Response(
        JSON.stringify({ user: { id: 1, email: "u@example.com", fullName: "U" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();
    render(<LoginForm />, { wrapper: makeQueryWrapper() });
    await user.type(await screen.findByLabelText(/email/i), "u@example.com");
    await user.type(await screen.findByLabelText(/password/i), "secret123");
    await user.click(await screen.findByRole("button", { name: /sign in/i }));

    // Wait for the mutation to settle and router to navigate.
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("invalid credentials: renders SAFE copy; raw backend wording does NOT reach the DOM", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            detail: "Invalid email or password.",
            error_code: "invalid_credentials",
            request_id: "req-z",
          }),
          { status: 401, headers: { "content-type": "application/json", "x-request-id": "req-z" } },
        ),
      ),
    );
    const user = userEvent.setup();
    const { container } = render(<LoginForm />, { wrapper: makeQueryWrapper() });
    await user.type(await screen.findByLabelText(/email/i), "u@example.com");
    await user.type(await screen.findByLabelText(/password/i), "wrongpass");
    await user.click(await screen.findByRole("button", { name: /sign in/i }));

    // Pre-CP8 hardening D-6: login-form-scoped safe copy, not the generic
    // "Please sign in to continue." fallback.
    expect(await screen.findByText("Incorrect email or password.")).toBeInTheDocument();
    expect(screen.queryByText(FALLBACK.signInRequired)).not.toBeInTheDocument();
    // Raw backend detail and code must not appear.
    expect(screen.queryByText(/Invalid email or password\./)).not.toBeInTheDocument();
    expect(screen.queryByText(/invalid_credentials/)).not.toBeInTheDocument();
    // Request-id is shown safely as "Ref: req-z" (developer diagnostic only).
    expect(screen.getByText(/Ref: req-z/)).toBeInTheDocument();
    // No navigation.
    expect(push).not.toHaveBeenCalled();
    // Cross-cutting leak guard on full rendered text.
    assertNoSensitiveOrInternalLeak(container.textContent ?? "");
  });

  test("422 validation error renders field-level summary, never the raw detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            detail: "Request validation failed.",
            error_code: "request_validation_error",
            request_id: "req-v",
            details: {
              errors: [
                { type: "missing", loc: ["body", "email"], msg: "Field required" },
              ],
            },
          }),
          { status: 422, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const user = userEvent.setup();
    render(<LoginForm />, { wrapper: makeQueryWrapper() });
    // Type valid-looking fields so client-side Zod passes and the request hits the mock.
    await user.type(await screen.findByLabelText(/email/i), "u@example.com");
    await user.type(await screen.findByLabelText(/password/i), "secret123");
    await user.click(await screen.findByRole("button", { name: /sign in/i }));

    // Field-level summary shows.
    expect(await screen.findByText(FALLBACK.validation)).toBeInTheDocument();
    expect(await screen.findByText(/Email: Field required/)).toBeInTheDocument();
    // Raw backend "Request validation failed." must not appear.
    expect(screen.queryByText(/Request validation failed\./)).not.toBeInTheDocument();
  });
});
