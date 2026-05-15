import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useCourseSearch } from "./useCourseSearch";
import { makeQueryWrapper } from "@/test/react-query-wrapper";

describe("useCourseSearch", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  test("disabled when input is null — no fetch, no error", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderHook(() => useCourseSearch(null), { wrapper: makeQueryWrapper() });
    // Give react-query a tick; if it tried to fetch, the spy would record it.
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("disabled when query is empty/whitespace", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderHook(() => useCourseSearch({ q: "   " }), { wrapper: makeQueryWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("non-empty query: posts to /api/courses/search and returns curated result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toContain("/api/courses/search");
        expect(init?.method).toBe("POST");
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        expect(body.q).toBe("python");
        return new Response(
          JSON.stringify({
            search: {
              items: [],
              total: 0,
              returnedCount: 0,
              hasMore: false,
              offset: 0,
              limit: 12,
              queryText: "python",
            },
            sourceStatus: "anonymous",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    const { result } = renderHook(() => useCourseSearch({ q: "python", limit: 12 }), {
      wrapper: makeQueryWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.search.queryText).toBe("python");
    expect(result.current.data?.sourceStatus).toBe("anonymous");
  });
});
