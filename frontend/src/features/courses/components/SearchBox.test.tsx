import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SearchBox } from "./SearchBox";

describe("SearchBox", () => {
  test("disables submit while the input is empty", async () => {
    const onSubmit = vi.fn();
    render(<SearchBox onSubmit={onSubmit} />);
    const submit = await screen.findByRole("button", { name: /search/i });
    expect(submit).toBeDisabled();
  });

  test("submits the trimmed query", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<SearchBox onSubmit={onSubmit} />);
    await user.type(await screen.findByLabelText(/search courses/i), "  python  ");
    await user.click(await screen.findByRole("button", { name: /search/i }));
    expect(onSubmit).toHaveBeenCalledWith("python");
  });

  test("never exposes admin/internal wording", async () => {
    const { container } = render(<SearchBox onSubmit={vi.fn()} />);
    const text = (container.textContent ?? "").toLowerCase();
    for (const term of ["ingest", "ingestion", "raw scraped", "pipeline", "admin console"]) {
      expect(text).not.toContain(term);
    }
  });

  test("shows busy state when isBusy=true", async () => {
    render(<SearchBox onSubmit={vi.fn()} isBusy initialQuery="python" />);
    expect(await screen.findByRole("button", { name: /searching/i })).toBeInTheDocument();
  });
});
