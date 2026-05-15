import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ConflictPanel } from "./ConflictPanel";
import { BackendError } from "@/lib/errors/backend-error";

describe("ConflictPanel", () => {
  test("renders nothing for non-BackendError values", () => {
    const { container } = render(<ConflictPanel error={new Error("nope")} onRefresh={() => {}} />);
    expect(container.textContent).toBe("");
  });

  test("renders nothing for backend errors that aren't conflict-shaped", () => {
    const err = new BackendError({ status: 422, detail: "no", errorCode: "request_validation_error" });
    const { container } = render(<ConflictPanel error={err} onRefresh={() => {}} />);
    expect(container.textContent).toBe("");
  });

  test("renders ConflictState + refresh button on 409 with stale-refresh intent", async () => {
    const onRefresh = vi.fn();
    const err = new BackendError({
      status: 409,
      detail: "stale",
      errorCode: "expected_version_mismatch",
    });
    render(<ConflictPanel error={err} onRefresh={onRefresh} />);
    expect(await screen.findByRole("button", { name: /refresh and try again/i })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: /refresh and try again/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    // Raw "stale" should not be shown.
    expect(screen.queryByText("stale")).not.toBeInTheDocument();
  });

  test("412 Precondition Failed is also recognized as conflict", () => {
    const err = new BackendError({ status: 412, detail: "precondition" });
    render(<ConflictPanel error={err} onRefresh={() => {}} />);
    expect(screen.getByRole("button", { name: /refresh and try again/i })).toBeInTheDocument();
  });
});
