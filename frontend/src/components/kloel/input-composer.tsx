"use client"

import type React from "react"

import { useRef } from "react"
import { ArrowUp } from "lucide-react"

interface InputComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: (content: string) => void
  onConnectWhatsApp: () => void
  showActionButtons: boolean
}

export function InputComposer({
  value,
  onChange,
  onSend,
}: InputComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = () => {
    if (value.trim()) {
      onSend(value)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          position: 'relative',
          borderRadius: 6,
          border: '1px solid #222226',
          background: '#111113',
          boxShadow: 'none',
          transition: 'border-color 150ms ease',
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pergunte qualquer coisa sobre vendas, marketing ou WhatsApp..."
          style={{
            width: '100%',
            minHeight: 56,
            maxHeight: 192,
            resize: 'none',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            padding: '16px 56px 16px 16px',
            color: '#E0DDD8',
            fontSize: 14,
            fontFamily: "'Sora', sans-serif",
            lineHeight: 1.5,
          }}
          rows={1}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement
            target.style.height = "auto"
            target.style.height = `${Math.min(target.scrollHeight, 192)}px`
          }}
        />

        <button
          onClick={handleSubmit}
          disabled={!value.trim()}
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            width: 32,
            height: 32,
            borderRadius: 6,
            border: 'none',
            background: value.trim() ? '#E85D30' : '#19191C',
            color: value.trim() ? '#0A0A0C' : '#3A3A3F',
            cursor: value.trim() ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 150ms ease',
          }}
        >
          <ArrowUp style={{ width: 16, height: 16 }} />
        </button>
      </div>
    </div>
  )
}
