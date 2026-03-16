"use client"

import type React from "react"

import { useRef } from "react"
import { Plus, Mic, AudioLines, MessageCircle } from "lucide-react"
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
            icon={<MessageCircle className="h-4 w-4" />}
            label="Conectar WhatsApp"
            onClick={onConnectWhatsApp}
          />
        </div>
      )}

      {/* Input Box - Light rounded bar design with new layout */}
      <div className="relative flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-3 shadow-sm transition-shadow focus-within:border-gray-300 focus-within:shadow-md">
        {/* Plus button */}
        <button
          onClick={handleFileClick}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
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
          className="min-w-0 flex-1 bg-transparent text-gray-900 placeholder:text-gray-400 focus:outline-none"
        />

        {/* Mic button */}
        <button
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <Mic className="h-5 w-5" />
        </button>

        {/* Audio waves / Send button */}
        <button
          onClick={handleSubmit}
          disabled={!value.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white transition-all hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400"
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
