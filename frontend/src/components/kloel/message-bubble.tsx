"use client"

import type { Message } from "./chat-container"

interface MessageBubbleProps {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user"
  const isToolEvent = message.eventType === "tool_call" || message.eventType === "tool_result"

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
            className={isUser ? "underline text-white" : "underline text-blue-600"}
          >
            {part}
          </a>
        )
      }

      return <span key={idx}>{part}</span>
    })
  }

  return (
    <div className={`flex items-start gap-4 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-sm font-semibold text-white">
          K
        </div>
      )}

      {/* Message Bubble */}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-gray-900 text-white"
            : isToolEvent
              ? "bg-white border border-gray-200 text-gray-900"
              : "bg-gray-100 text-gray-900"
        }`}
      >
        {isToolEvent && !isUser ? (
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-blue-600">
            {message.eventType === "tool_call" ? "Tool" : "Tool Result"}
          </div>
        ) : null}
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{renderText(message.content)}</p>
      </div>
    </div>
  )
}
