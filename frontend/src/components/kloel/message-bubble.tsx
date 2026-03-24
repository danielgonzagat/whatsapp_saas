"use client"

import type { Message } from "./chat-container"
import { colors } from "@/lib/design-tokens"

interface MessageBubbleProps {
  message: Message
  onQuickAction?: (actionId: string, label: string) => void
  pendingActionId?: string | null
}

export function MessageBubble({ message, onQuickAction, pendingActionId }: MessageBubbleProps) {
  const isUser = message.role === "user"
  const isToolEvent = message.eventType === "tool_call" || message.eventType === "tool_result"
  const quickActions = Array.isArray(message.meta?.quickActions) ? message.meta.quickActions : []

  const renderText = (text: string) => {
    const parts = String(text || "").split(/(\s+)/)

    return parts.map((part, idx) => {
      if (part.trim().length === 0) {
        return <span key={idx}>{part}</span>
      }

      const isHttp = /^https?:\/\//i.test(part)
      const isPath = part.startsWith("/")

      if (isHttp || isPath) {
        const href = isHttp ? part : part
        return (
          <a
            key={idx}
            href={href}
            target={isHttp ? "_blank" : undefined}
            rel={isHttp ? "noopener noreferrer" : undefined}
            style={{
              textDecoration: "underline",
              color: isUser ? "#FFFFFF" : colors.accent.webbHover,
            }}
          >
            {part}
          </a>
        )
      }

      return <span key={idx}>{part}</span>
    })
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        animation: "fadeSlideUp .3s both",
      }}
    >
      {/* KLOEL label above AI messages — replaces K avatar */}
      {!isUser && !isToolEvent && (
        <span
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: 11,
            fontWeight: 600,
            color: colors.text.dust,
            letterSpacing: "0.08em",
            textTransform: "uppercase" as const,
            marginBottom: 4,
          }}
        >
          KLOEL
        </span>
      )}

      {/* Tool event label */}
      {isToolEvent && !isUser && (
        <span
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: 11,
            fontWeight: 600,
            color: colors.accent.webb,
            letterSpacing: "0.08em",
            textTransform: "uppercase" as const,
            marginBottom: 4,
          }}
        >
          {message.eventType === "tool_call" ? "TOOL" : "RESULTADO"}
        </span>
      )}

      {/* Message Bubble */}
      <div
        style={{
          maxWidth: "85%",
          padding: "12px 16px",
          borderRadius: isUser ? "16px 16px 0 16px" : "16px 16px 16px 0",
          background: isUser
            ? colors.accent.webb
            : isToolEvent
              ? colors.background.nebula
              : colors.background.nebula,
          border: isUser ? "none" : `1px solid ${colors.border.void}`,
          color: isUser ? "#FFFFFF" : colors.text.starlight,
          fontSize: 14,
          lineHeight: 1.6,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{renderText(message.content)}</p>

        {/* Quick Actions */}
        {!isUser && quickActions.length > 0 && onQuickAction ? (
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {quickActions.map((action: any) => {
              const actionId = String(action?.id || "")
              const label = String(action?.label || actionId)
              const isPending = pendingActionId === actionId

              return (
                <button
                  key={actionId}
                  type="button"
                  onClick={() => onQuickAction(actionId, label)}
                  disabled={!!pendingActionId}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 20,
                    border: `1px solid ${pendingActionId ? colors.border.void : colors.border.space}`,
                    background: pendingActionId ? colors.background.stellar : colors.background.space,
                    color: pendingActionId ? colors.text.void : colors.text.moonlight,
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: pendingActionId ? "not-allowed" : "pointer",
                    transition: "all 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                  }}
                >
                  {isPending ? "Executando..." : label}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}
