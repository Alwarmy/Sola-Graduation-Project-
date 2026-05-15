import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";

import { LoadingState } from "./LoadingState";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { ConflictState } from "./ConflictState";
import { UnavailableState } from "./UnavailableState";
import { ValidationErrors } from "./ValidationErrors";
import { ProtectedState } from "./ProtectedState";
import { BackendError } from "@/lib/errors/backend-error";
import { FALLBACK } from "@/lib/copy/fallback";
import { isSafeCopy } from "@/lib/copy/raw-value-guard";

// React 19 + RTL 16 + Vitest 2 do not flush createRoot synchronously, so
// every "render-then-assert" pair in this file uses async `findByText` /
// `findByRole`. Sync `getByText` would race the commit and report
// "element not found" before React mounts the tree.

describe("LoadingState", () => {
  test("renders the locked loading copy by default", async () => {
    render(<LoadingState />);
    expect(await screen.findByText(FALLBACK.loading)).toBeInTheDocument();
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  test("renders truthful default copy", async () => {
    render(<EmptyState />);
    expect(await screen.findByText(FALLBACK.emptyList)).toBeInTheDocument();
    expect(isSafeCopy(FALLBACK.emptyList)).toBe(true);
  });
});

describe("ProtectedState", () => {
  test("renders sign-in required copy", async () => {
    render(<ProtectedState />);
    expect(await screen.findByText(FALLBACK.signInRequired)).toBeInTheDocument();
  });
});

describe("UnavailableState", () => {
  test("renders unavailable copy and is safe", async () => {
    render(<UnavailableState />);
    expect(await screen.findByText(FALLBACK.unavailable)).toBeInTheDocument();
    expect(isSafeCopy(FALLBACK.unavailable)).toBe(true);
  });
});

describe("ConflictState", () => {
  test("renders stale-refresh copy", async () => {
    render(<ConflictState />);
    expect(await screen.findByText(FALLBACK.staleRefresh)).toBeInTheDocument();
  });
});

describe("ErrorState", () => {
  test("renders sign-in required for 401 BackendError and shows request id", async () => {
    const err = new BackendError({
      status: 401,
      detail: "Invalid email or password.",
      errorCode: "invalid_credentials",
      requestId: "req-xyz",
    });
    render(<ErrorState error={err} />);
    expect(await screen.findByText(FALLBACK.signInRequired)).toBeInTheDocument();
    expect(await screen.findByText(/Ref: req-xyz/)).toBeInTheDocument();
    // The raw backend message must NOT be rendered.
    expect(screen.queryByText(/Invalid email or password/)).not.toBeInTheDocument();
    expect(screen.queryByText(/invalid_credentials/)).not.toBeInTheDocument();
  });

  test("renders unavailable copy for 500 errors", async () => {
    const err = new BackendError({ status: 500, detail: "Backend unavailable" });
    render(<ErrorState error={err} />);
    expect(await screen.findByText(FALLBACK.unavailable)).toBeInTheDocument();
  });

  test("renders retryable copy for non-BackendError throwables (no leak)", async () => {
    const err = new Error("internal pipeline error: ingestion failed");
    render(<ErrorState error={err} />);
    expect(await screen.findByText(FALLBACK.retryable)).toBeInTheDocument();
    // Verify the raw internal message does NOT reach the DOM.
    expect(screen.queryByText(/pipeline/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ingestion/i)).not.toBeInTheDocument();
  });
});

describe("ValidationErrors", () => {
  test("lists field errors", async () => {
    const err = new BackendError({
      status: 422,
      detail: "Request validation failed.",
      errorCode: "request_validation_error",
      requestId: "req-vv",
      details: {
        errors: [
          { type: "missing", loc: ["body", "email"], msg: "Field required" },
          { type: "missing", loc: ["body", "password"], msg: "Field required" },
        ],
      },
    });
    render(<ValidationErrors source={err} />);
    expect(await screen.findByText(FALLBACK.validation)).toBeInTheDocument();
    expect(await screen.findByText(/Email: Field required/)).toBeInTheDocument();
    expect(await screen.findByText(/Password: Field required/)).toBeInTheDocument();
  });

  test("renders nothing when there are no field errors", () => {
    const err = new BackendError({ status: 401, detail: "Not authenticated" });
    const { container } = render(<ValidationErrors source={err} />);
    expect(container.firstChild).toBeNull();
  });
});
