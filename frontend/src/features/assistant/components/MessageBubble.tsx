"use client";

import { Badge } from "@/components/ui/Badge";
import type { PublicAssistantMessage } from "@/lib/contracts/assistant";

export type MessageBubbleProps = {
  message: PublicAssistantMessage;
};

/**
 * Backend-content-only message bubble. The content prop comes ONLY from
 * `assistant_message.content` or `user_message.content` returned by the
 * backend — never a frontend-invented final answer. The response_mode +
 * governance labels are humanized through the assistant contract layer
 * so raw enum strings never reach the DOM.
 */
export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isBlocked = message.governance?.status === "blocked";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        gap: "0.25rem",
      }}
    >
      <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.75rem", color: "#555" }}>
        <strong>{message.roleLabel}</strong>
        {message.responseModeLabel ? <Badge tone="info">{message.responseModeLabel}</Badge> : null}
        {message.governance && message.governance.status !== "ready" ? (
          <Badge tone={isBlocked ? "danger" : "warning"}>
            {message.governance.statusLabel}
          </Badge>
        ) : null}
      </div>
      <div
        style={{
          padding: "0.6rem 0.8rem",
          borderRadius: "0.75rem",
          background: isUser ? "#e6f0fb" : isBlocked ? "#fdecea" : "#f3f4f6",
          color: "#1a202c",
          maxWidth: "85%",
          whiteSpace: "pre-wrap",
          fontSize: "0.92rem",
          lineHeight: 1.5,
        }}
      >
        {message.content}
      </div>
      {message.governance?.blockingReasonLabel ? (
        <p style={{ fontSize: "0.75rem", color: "#7a4a05", margin: 0 }}>
          {message.governance.blockingReasonLabel}
        </p>
      ) : null}
    </div>
  );
}
