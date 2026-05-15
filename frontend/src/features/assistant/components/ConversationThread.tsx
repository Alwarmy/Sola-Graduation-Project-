"use client";

import { LoadingState } from "@/components/states/LoadingState";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { useAssistantMessages } from "@/features/assistant/hooks/useAssistantMessages";
import { MessageBubble } from "./MessageBubble";

export type ConversationThreadProps = {
  conversationId: number;
};

export function ConversationThread({ conversationId }: ConversationThreadProps) {
  const messages = useAssistantMessages(conversationId);

  if (messages.isLoading) return <LoadingState description="Loading conversation." />;
  if (messages.isError && messages.error) return <ErrorState error={messages.error} />;
  if (!messages.data) return <LoadingState description="Loading conversation." />;
  if (messages.data.length === 0) {
    return (
      <EmptyState
        title="No messages yet."
        description="Send a message below to start the conversation."
      />
    );
  }

  const ordered = messages.data
    .slice()
    .sort(
      (a, b) =>
        (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0) ||
        (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0),
    );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        padding: "0.5rem 0",
      }}
    >
      {ordered.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
    </div>
  );
}
