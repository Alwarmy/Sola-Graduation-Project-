import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { RecommendationsPanel } from "./RecommendationsPanel";
import { makeQueryWrapper } from "@/test/react-query-wrapper";

const useSessionMock = vi.fn();
vi.mock("@/features/auth/hooks/useSession", () => ({
  useSession: () => useSessionMock(),
}));

describe("RecommendationsPanel", () => {
  beforeEach(() => {
    useSessionMock.mockReset();
    vi.unstubAllGlobals();
  });
  afterEach(() => vi.unstubAllGlobals());

  test("anonymous: renders ProtectedState with Sign-in CTA, no backend call", async () => {
    useSessionMock.mockReturnValue({ data: { user: null }, isLoading: false });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<RecommendationsPanel limit={3} />, { wrapper: makeQueryWrapper() });
    expect(
      await screen.findByText(/Sign in to see personalized recommendations\./i),
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("authenticated + non-empty list: renders backend cards safely", async () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: 1, email: "u@example.com", fullName: "U" } },
      isLoading: false,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            total: 1,
            items: [
              {
                id: 11,
                source: "youtube",
                external_id: "x",
                content_type: "playlist",
                title: "Machine Learning Tutorial",
                provider: "youtube",
                provider_display_name: "YouTube",
                content_format_label: "Playlist course",
                difficulty_label: "Advanced",
                duration_label: "26h 30m estimated",
                pricing_label: "Free",
                instructor_display_name: "edureka!",
                topic_tag_labels: ["Python", "Machine Learning"],
                card_summary: "Playlist course • Advanced • 26h 30m estimated • Free",
                badges: [{ key: "pricing", label: "Free", tone: "success" }],
                discovery: { explanation_label: "Recommended for your goal" },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const { container } = render(<RecommendationsPanel limit={3} />, {
      wrapper: makeQueryWrapper(),
    });
    expect(await screen.findByText(/Machine Learning Tutorial/i)).toBeInTheDocument();
    expect(await screen.findByText(/Recommended for your goal/i)).toBeInTheDocument();
    const text = container.textContent ?? "";
    expect(text).not.toContain("access_token");
    expect(text).not.toContain("refresh_token");
    expect(text.toLowerCase()).not.toContain("ingest");
  });

  test("authenticated + empty list: renders honest empty state, no fake fallback", async () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: 1, email: "u@example.com", fullName: "U" } },
      isLoading: false,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ total: 0, items: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    render(<RecommendationsPanel />, { wrapper: makeQueryWrapper() });
    expect(await screen.findByText(/No recommendations yet/i)).toBeInTheDocument();
  });
});
