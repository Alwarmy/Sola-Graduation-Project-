import { vi } from "vitest";

/**
 * Build a `next/headers` cookies() mock with an in-memory jar.
 * Supports `.get(name)`, `.set({...})`, `.delete(name)`.
 */
export function makeCookieJar(initial: Record<string, string> = {}) {
  const store = new Map<string, { value: string; options: Record<string, unknown> }>();
  for (const [k, v] of Object.entries(initial)) {
    store.set(k, { value: v, options: {} });
  }
  const api = {
    get: (name: string) => {
      const entry = store.get(name);
      return entry ? { name, value: entry.value } : undefined;
    },
    set: (input: { name: string; value: string } & Record<string, unknown>) => {
      const { name, value, ...options } = input;
      store.set(name, { value, options });
    },
    delete: (name: string) => {
      store.delete(name);
    },
    _store: store,
  };
  return api;
}

/**
 * Stub `globalThis.fetch` with a queue of responses. Returns the spy.
 *
 * Each call shifts the next response. Tests should provide one response per
 * expected backend call.
 */
type StubFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function stubFetch(responses: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>) {
  const queue = [...responses];
  const fetchSpy = vi.fn<StubFetch>(async (_input, _init) => {
    const next = queue.shift();
    if (!next) throw new Error("stubFetch: no more responses queued");
    return new Response(next.body !== undefined ? JSON.stringify(next.body) : null, {
      status: next.status,
      headers: {
        "content-type": "application/json",
        ...next.headers,
      },
    });
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

export function clearStubs() {
  vi.unstubAllGlobals();
}
