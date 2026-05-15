"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { ErrorState } from "@/components/states/ErrorState";
import { useCreateAssistantConversation } from "@/features/assistant/hooks/useAssistantMutations";

export type CreateConversationFormProps = {
  onCreated: (id: number) => void;
};

export function CreateConversationForm({ onCreated }: CreateConversationFormProps) {
  const create = useCreateAssistantConversation();
  const [title, setTitle] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    create.mutate(
      { title: trimmed.length === 0 ? null : trimmed },
      {
        onSuccess: (conversation) => {
          setTitle("");
          onCreated(conversation.id);
        },
      },
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {create.error ? (
        <div style={{ marginBottom: "0.5rem" }}>
          <ErrorState error={create.error} />
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        <FormField label="New conversation title (optional)">
          {(api) => (
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="e.g. Recovery help"
              {...api}
            />
          )}
        </FormField>
        <Button type="submit" isBusy={create.isPending} disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Start new conversation"}
        </Button>
      </div>
    </form>
  );
}
