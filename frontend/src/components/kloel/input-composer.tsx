"use client"

import type React from "react"

import { useRef } from "react"
import { Plus, Mic, AudioLines, Brain, MessageCircle } from "lucide-react"
import { ActionButton } from "./action-button"

interface InputComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: (content: string) => void
  onTeachProducts: () => void
  onConnectWhatsApp: () => void
  showActionButtons: boolean
}

export function InputComposer({
  value,
  onChange,
  onSend,
  onTeachProducts,
  onConnectWhatsApp,
  showActionButtons,
}: InputComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  const handleFileClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      // Handle file upload
      console.log("Files selected:", files)
    }
  }

  return (
    <div className="space-y-3">
      {/* Action Buttons - Only show when no messages */}
      {showActionButtons && (
        <div className="flex flex-wrap justify-center gap-2 pb-2">
          <ActionButton
            icon={<Brain className="h-4 w-4" />}
            label="Ensinar sobre meus produtos"
            onClick={onTeachProducts}
          />
          <ActionButton
            icon={<MessageCircle className="h-4 w-4" />}
            label="Conectar WhatsApp"
            onClick={onConnectWhatsApp}
          />
        </div>
      )}

      {/* Input Box - Dark rounded bar design */}
      <div className="relative flex items-center gap-2 rounded-full bg-[#2C2C2E] px-4 py-3 shadow-lg">
        {/* Plus button */}
        <button
          onClick={handleFileClick}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Plus className="h-5 w-5" />
        </button>

        {/* Input field */}
        <input
          ref={textareaRef as any}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pergunte alguma coisa"
          className="min-w-0 flex-1 bg-transparent text-white placeholder:text-gray-400 focus:outline-none"
        />

        {/* Mic button */}
        <button
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Mic className="h-5 w-5" />
        </button>

        {/* Audio waves / Send button */}
        <button
          onClick={handleSubmit}
          disabled={!value.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#2C2C2E] transition-all hover:bg-gray-100 disabled:opacity-50"
        >
          <AudioLines className="h-5 w-5" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,.pdf,.doc,.docx,.txt"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  )
}
