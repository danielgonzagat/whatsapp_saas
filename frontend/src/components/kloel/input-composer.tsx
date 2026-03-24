"use client"

import type React from "react"

import { useRef } from "react"
import { ArrowUp } from "lucide-react"
import { Button } from "@/components/ui/button"

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
    <div className="space-y-3">
      <div className="relative rounded-2xl border border-[#1E1E34] bg-[#10101C] shadow-sm transition-shadow focus-within:border-[#4E7AE0] focus-within:shadow-md">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pergunte qualquer coisa sobre vendas, marketing ou WhatsApp…"
          className="max-h-48 min-h-[56px] w-full resize-none bg-transparent px-4 py-4 pr-14 text-white placeholder:text-gray-500 focus:outline-none"
          rows={1}
          style={{
            fontFamily: "'DM Sans', sans-serif",
            height: "auto",
            minHeight: "56px",
          }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement
            target.style.height = "auto"
            target.style.height = `${Math.min(target.scrollHeight, 192)}px`
          }}
        />

        <Button
          onClick={handleSubmit}
          disabled={!value.trim()}
          size="icon"
          className="absolute bottom-3 right-3 h-8 w-8 rounded-lg bg-[#4E7AE0] text-white transition-all hover:bg-[#3D63C0] disabled:bg-gray-700 disabled:text-gray-500"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
