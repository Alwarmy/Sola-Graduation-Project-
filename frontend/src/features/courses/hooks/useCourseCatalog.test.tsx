import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useCourseCatalog } from "./useCourseCatalog";
import { makeQueryWrapper } from "@/test/react-query-wrapper";

describe("useCourseCatalog — CP6 hardening URL regression", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  test("calls /api/courses (NOT /api/sola/courses)", async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      // CRITICAL: this hook must use the optional-auth handler, not the
      // protected /api/sola/[...path] proxy. See NOTE-CP6-OPTIONAL-AUTH-001.
      expect(url).toContain("/api/courses");
      expect(url).not.toContain("/api/sola");
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useCourseCatalog({ q: "python", limit: 5 }), {
      wrapper: makeQueryWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("forwards q + limit + offset query params", async () => {
    let observedUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        observedUrl = String(input);
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const { result } = renderHook(
      () => useCourseCatalog({ q: "react", limit: 8, offset: 4 }),
      { wrapper: makeQueryWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(observedUrl).toContain("q=react");
    expect(observedUrl).toContain("limit=8");
    expect(observedUrl).toContain("offset=4");
  });
});
