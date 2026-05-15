import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock the auth + profile hooks BEFORE importing the component.
const useSessionMock = vi.fn();
const useProfileMock = vi.fn();
const useCreateProfileMock = vi.fn(() => ({ mutate: vi.fn(), isPending: false, error: null }));
const useUpdateProfileMock = vi.fn(() => ({ mutate: vi.fn(), isPending: false, error: null }));

vi.mock("@/features/auth/hooks/useSession", () => ({
  useSession: () => useSessionMock(),
}));
vi.mock("@/features/profile/hooks/useProfile", () => ({
  useProfile: (opts?: unknown) => useProfileMock(opts),
}));
vi.mock("@/features/profile/hooks/useCreateProfile", () => ({
  useCreateProfile: () => useCreateProfileMock(),
}));
vi.mock("@/features/profile/hooks/useUpdateProfile", () => ({
  useUpdateProfile: () => useUpdateProfileMock(),
}));

import { ProfilePageClient } from "./ProfilePageClient";
import { FALLBACK } from "@/lib/copy/fallback";

const TOKEN_SENTINELS = ["access_token", "refresh_token", "session_id"] as const;
const INTERNAL_WORDS = [
  "ingest",
  "raw scraped",
  "pipeline",
  "admin console",
  "api_key",
  "stack trace",
] as const;

function assertSafeText(text: string) {
  for (const t of TOKEN_SENTINELS) expect(text).not.toContain(t);
  const lower = text.toLowerCase();
  for (const w of INTERNAL_WORDS) expect(lower).not.toContain(w);
  expect(text).not.toMatch(/\bnull\b/);
  expect(text).not.toMatch(/\bundefined\b/);
  expect(text).not.toMatch(/NaN/);
}

describe("ProfilePageClient — anonymous protected state (Pre-CP6 hardening, NOTE-CP5-PROFILE-UI-001)", () => {
  afterEach(() => vi.clearAllMocks());

  test("renders CP3 ProtectedState and a sign-in link when the session is anonymous", async () => {
    useSessionMock.mockReturnValue({ data: { user: null }, isLoading: false });
    useProfileMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    const { container } = render(<ProfilePageClient />);

    // Locked CP3 FALLBACK copy. ProtectedState's default title is
    // FALLBACK.signInRequired = "Please sign in to continue."
    expect(await screen.findByText(FALLBACK.signInRequired)).toBeInTheDocument();

    // The CTA goes to /login. A semantic <a href> is sufficient — we don't
    // require any specific button styling here.
    const signInLink = await screen.findByRole("link", { name: /sign in/i });
    expect(signInLink).toBeInTheDocument();
    expect(signInLink.getAttribute("href")).toBe("/login");

    // No token, internal-word, snake_case, or value-leak material reached
    // the DOM under the anonymous state.
    assertSafeText(container.textContent ?? "");

    // The profile hook MUST be called with `enabled: false` (or equivalent
    // falsy `enabled`) so we never try to read the profile while anonymous.
    expect(useProfileMock).toHaveBeenCalled();
    const firstCallArg = useProfileMock.mock.calls[0]?.[0] as { enabled?: boolean } | undefined;
    expect(firstCallArg?.enabled).toBe(false);
  });

  test("does not render the create-profile form or summary in anonymous state", () => {
    useSessionMock.mockReturnValue({ data: { user: null }, isLoading: false });
    useProfileMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    render(<ProfilePageClient />);

    // No profile form labels should be present.
    expect(screen.queryByRole("button", { name: /save profile/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /update profile/i })).not.toBeInTheDocument();
    // No "Welcome to SOLA" copy (that appears only when an authed user has no profile).
    expect(screen.queryByText(/Welcome to SOLA/i)).not.toBeInTheDocument();
  });
});
