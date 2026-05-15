"use client";

import Link from "next/link";
import { useState } from "react";

import { PageHeader, Section } from "@/components/layout/PageHeader";
import { LoadingState } from "@/components/states/LoadingState";
import { ProtectedState } from "@/components/states/ProtectedState";
import { useSession } from "@/features/auth/hooks/useSession";

import { ConversationList } from "./ConversationList";
import { ConversationThread } from "./ConversationThread";
import { CreateConversationForm } from "./CreateConversationForm";
import { MessageComposer } from "./MessageComposer";
import { MemorySignalsPanel } from "./MemorySignalsPanel";
import { ActionRunsPanel } from "./ActionRunsPanel";

/**
 * The Assistant page mounts:
 *   - conversation list (top of left rail) + create-conversation form
 *   - active conversation thread (center)
 *   - message composer
 *   - memory signals panel
 *   - action runs panel
 *
 * Anonymous → ProtectedState with sign-in CTA (assistant routes are
 * authenticated-only).
 */
export function AssistantPageClient() {
  const session = useSession();
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);

  if (session.isLoading) return <LoadingState description="Checking your session." />;

  if (!session.data?.user) {
    return (
      <main style={{ maxWidth: "56rem", margin: "2rem auto", padding: "0 1.5rem" }}>
        <PageHeader title="Assistant" />
        <ProtectedState
          title="Sign in to chat with the assistant."
          action={<Link href="/login">Sign in</Link>}
        />
      </main>
    );
  }

  return (
    <main style={{ maxWidth: "64rem", margin: "2rem auto", padding: "0 1.5rem" }}>
      <PageHeader
        title="Assistant"
        subtitle="Backend-backed product assistant. Suggested actions require your explicit confirmation."
        actions={<Link href="/plans">← Plans</Link>}
      />

      <Section title="Conversations">
        <div style={{ display: "grid", gap: "0.75rem" }}>
          <ConversationList
            selectedId={activeConversationId}
            onSelect={(id) => setActiveConversationId(id)}
          />
          <CreateConversationForm onCreated={(id) => setActiveConversationId(id)} />
        </div>
      </Section>

      {activeConversationId !== null ? (
        <Section title={`Conversation #${activeConversationId}`}>
          <ConversationThread conversationId={activeConversationId} />
          <div style={{ marginTop: "0.75rem" }}>
            <MessageComposer conversationId={activeConversationId} />
          </div>
        </Section>
      ) : (
        <Section title="Conversation">
          <p style={{ color: "#555", fontSize: "0.9rem" }}>
            Open a conversation from the list above or create a new one.
          </p>
        </Section>
      )}

      <Section title="Assistant memory">
        <MemorySignalsPanel conversationId={activeConversationId} />
      </Section>

      <Section title="Suggested actions">
        <ActionRunsPanel conversationId={activeConversationId} />
      </Section>
    </main>
  );
}
