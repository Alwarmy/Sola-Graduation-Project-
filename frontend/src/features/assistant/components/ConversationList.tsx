"use client";

import { LoadingState } from "@/components/states/LoadingState";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAssistantConversations } from "@/features/assistant/hooks/useAssistantConversations";

export type ConversationListProps = {
  selectedId: number | null;
  onSelect: (id: number) => void;
};

export function ConversationList({ selectedId, onSelect }: ConversationListProps) {
  const conversations = useAssistantConversations();

  if (conversations.isLoading) return <LoadingState description="Loading conversations." />;
  if (conversations.isError && conversations.error)
    return <ErrorState error={conversations.error} />;
  if (!conversations.data) return <LoadingState description="Loading conversations." />;
  if (conversations.data.length === 0) {
    return <EmptyState title="No conversations yet. Create one below." />;
  }

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.4rem" }}>
      {conversations.data.map((c) => {
        const isSelected = c.id === selectedId;
        return (
          <li key={c.id}>
            <Card>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      fontWeight: 500,
                      fontSize: "0.95rem",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.title || `Conversation #${c.id}`}
                  </p>
                  <p style={{ margin: 0, fontSize: "0.8rem", color: "#555" }}>{c.statusLabel}</p>
                </div>
                <Button
                  variant={isSelected ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => onSelect(c.id)}
                  disabled={isSelected}
                >
                  {isSelected ? "Open" : "Open"}
                </Button>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
