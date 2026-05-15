"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { ErrorState } from "@/components/states/ErrorState";
import { useSendAssistantMessage } from "@/features/assistant/hooks/useAssistantMutations";

export type MessageComposerProps = {
  conversationId: number;
};

/**
 * Message composer for the active conversation. Sends through the
 * dedicated CP9 handler. While the mutation is pending, shows a small
 * "Waiting for the assistant…" line — this is a load state, NOT a fake
 * final answer. The real final assistant content arrives via
 * `useSendAssistantMessage` success → query invalidation → re-render.
 */
export function MessageComposer({ conversationId }: MessageComposerProps) {
  const send = useSendAssistantMessage();
  const [content, setContent] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      setLocalError("Type your message.");
      return;
    }
    if (trimmed.length > 4000) {
      setLocalError("Message is too long.");
      return;
    }
    setLocalError(null);
    send.mutate(
      { conversationId, content: trimmed },
      {
        onSuccess: () => {
          setContent("");
        },
      },
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {send.error ? (
        <div style={{ marginBottom: "0.5rem" }}>
          <ErrorState error={send.error} />
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <FormField label="Message" error={localError ?? undefined}>
          {(api) => (
            <Textarea
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={4000}
              placeholder="Ask the assistant about your plan, schedule, or recovery…"
              {...api}
            />
          )}
        </FormField>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <Button type="submit" isBusy={send.isPending} disabled={send.isPending}>
            {send.isPending ? "Sending…" : "Send"}
          </Button>
          {send.isPending ? (
            <span style={{ fontSize: "0.8rem", color: "#555" }}>
              Waiting for the assistant…
            </span>
          ) : null}
        </div>
      </div>
    </form>
  );
}
