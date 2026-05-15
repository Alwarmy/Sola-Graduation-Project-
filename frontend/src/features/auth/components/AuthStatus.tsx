"use client";

import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { useSession } from "@/features/auth/hooks/useSession";
import { useLogout } from "@/features/auth/hooks/useLogout";

/**
 * Tiny session-aware indicator. Used on the foundation landing page to
 * surface auth state without building a full app shell (that's CP3 + future
 * checkpoints). Renders:
 *
 *   - while session is loading: nothing (loading flicker is worse than empty)
 *   - anonymous: "Sign in" + "Create account" links
 *   - authenticated: "Signed in as <name>." + "Sign out" button
 *
 * Tokens never appear here — the hook only sees the safe `PublicSession` shape.
 */
export function AuthStatus() {
  const session = useSession();
  const logout = useLogout();

  if (session.isLoading) return null;

  const user = session.data?.user ?? null;

  if (!user) {
    return (
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <Link href="/courses">Discover</Link>
        <Link href="/login">Sign in</Link>
        <Link href="/register">Create account</Link>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
      <span>Signed in as {user.fullName}.</span>
      <Link href="/courses">Discover</Link>
      <Link href="/plans">Plans</Link>
      <Link href="/progress">Progress</Link>
      <Link href="/assistant">Assistant</Link>
      <Link href="/profile">Profile</Link>
      <Button
        variant="secondary"
        size="sm"
        isBusy={logout.isPending}
        onClick={() => logout.mutate()}
      >
        {logout.isPending ? "Signing out…" : "Sign out"}
      </Button>
    </div>
  );
}
