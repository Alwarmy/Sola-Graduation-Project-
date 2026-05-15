"use client";

import Link from "next/link";
import { useState } from "react";

import { PageHeader, Section } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/states/LoadingState";
import { ErrorState } from "@/components/states/ErrorState";
import { ProtectedState } from "@/components/states/ProtectedState";

import { useSession } from "@/features/auth/hooks/useSession";
import { useProfile } from "@/features/profile/hooks/useProfile";
import { useCreateProfile } from "@/features/profile/hooks/useCreateProfile";
import { useUpdateProfile } from "@/features/profile/hooks/useUpdateProfile";
import { ProfileForm } from "./ProfileForm";
import { ProfileSummary } from "./ProfileSummary";

export function ProfilePageClient() {
  const session = useSession();
  const user = session.data?.user ?? null;
  const profile = useProfile({ enabled: Boolean(user) });
  const createProfile = useCreateProfile();
  const updateProfile = useUpdateProfile();
  const [editing, setEditing] = useState(false);

  if (session.isLoading) {
    return <LoadingState description="Checking your session." />;
  }
  if (!user) {
    return (
      <ProtectedState
        action={
          <Link
            href="/login"
            style={{
              display: "inline-block",
              padding: "0.35rem 0.7rem",
              borderRadius: 6,
              background: "#111",
              color: "#fff",
              textDecoration: "none",
              fontSize: "0.875rem",
            }}
          >
            Sign in
          </Link>
        }
      />
    );
  }

  if (profile.isLoading) {
    return <LoadingState description="Loading your profile." />;
  }

  if (profile.isError && profile.error) {
    return <ErrorState error={profile.error} />;
  }

  const result = profile.data;
  if (!result) return <LoadingState description="Loading your profile." />;

  if (result.kind === "missing") {
    return (
      <>
        <PageHeader
          title="Welcome to SOLA"
          subtitle="Let's set up your learning profile so we can personalize recommendations."
        />
        <Section title="Create your profile">
          <ProfileForm
            mode="create"
            state={createProfile}
            onSuccess={() => setEditing(false)}
          />
        </Section>
      </>
    );
  }

  // Loaded profile.
  return (
    <>
      <PageHeader
        title="Your profile"
        subtitle="Update this anytime — your plans and recommendations follow your goals."
        actions={
          editing ? (
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Edit profile
            </Button>
          )
        }
      />
      <Section>
        <ProfileSummary profile={result.profile} />
      </Section>
      {editing ? (
        <Section title="Edit profile">
          <ProfileForm
            mode="update"
            initial={result.profile}
            state={updateProfile}
            onSuccess={() => setEditing(false)}
          />
        </Section>
      ) : null}
    </>
  );
}
