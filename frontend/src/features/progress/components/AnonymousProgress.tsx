"use client";

import Link from "next/link";

import { PageHeader, Section } from "@/components/layout/PageHeader";
import { ProtectedState } from "@/components/states/ProtectedState";

/**
 * Anonymous `/progress` — protected state with sign-in guidance. No
 * personalized data, no learning-state fetch attempted.
 */
export function AnonymousProgress() {
  return (
    <main style={{ maxWidth: "64rem", margin: "2rem auto", padding: "0 1.5rem" }}>
      <PageHeader title="Progress" />
      <Section>
        <ProtectedState
          title="Sign in to view your progress."
          action={<Link href="/login">Sign in</Link>}
        />
      </Section>
    </main>
  );
}
