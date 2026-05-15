"use client";

import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader, Section } from "@/components/layout/PageHeader";
import { ErrorState } from "@/components/states/ErrorState";

export type AnonymousHomeProps = {
  /** Optional session-load error to surface as a small per-card alert. */
  sessionError?: unknown;
};

/**
 * Public anonymous home. Concise SOLA identity + sign-in / register /
 * discover entry points. No personalized data. No CP10+ feature
 * promises. No fake content.
 */
export function AnonymousHome({ sessionError }: AnonymousHomeProps) {
  return (
    <>
      <PageHeader
        title="SOLA"
        subtitle="A focused learning assistant for plan-based study."
      />

      {sessionError ? (
        <Section>
          <ErrorState error={sessionError} />
        </Section>
      ) : null}

      <Section>
        <Card title="Get started">
          <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.6 }}>
            SOLA helps you build a learning plan from real courses, generate a
            workable schedule, and stay on track with execution support.
          </p>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
            <Link href="/login">
              <Button variant="primary" size="md">
                Sign in
              </Button>
            </Link>
            <Link href="/register">
              <Button variant="secondary" size="md">
                Create account
              </Button>
            </Link>
            <Link href="/courses">
              <Button variant="secondary" size="md">
                Discover courses
              </Button>
            </Link>
          </div>
        </Card>
      </Section>

      <Section title="Explore as a guest">
        <Card>
          <p style={{ margin: 0, fontSize: "0.9rem" }}>
            You can browse the course catalog without an account. Plans,
            schedules, and the assistant require sign-in.
          </p>
        </Card>
      </Section>
    </>
  );
}
