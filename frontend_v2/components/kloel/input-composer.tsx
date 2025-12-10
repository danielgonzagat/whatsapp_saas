"use client"

import type React from "react"

import { useRef } from "react"
import { Paperclip, Brain, MessageCircle, ArrowUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ActionButton } from "./action-button"
import { useAuth } from "./auth/auth-provider"

interface InputComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: (content: string) => void
  onTeachProducts: () => void
  onConnectWhatsApp: () => void
  showActionButtons: boolean
  onAttachFiles?: () => void
}

export function InputComposer({
  value,
  onChange,
  onSend,
  onTeachProducts,
  onConnectWhatsApp,
  showActionButtons,
  onAttachFiles,
}: InputComposerProps) {
  const { isAuthenticated, subscription, openAuthModal, openSubscriptionModal } = useAuth()
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

  // Anexar arquivos - requer login
  const handleFileClick = () => {
    if (!isAuthenticated) {
      openAuthModal("signup")
      return
    }
    if (onAttachFiles) {
      onAttachFiles()
    } else {
      fileInputRef.current?.click()
    }
  }

  // Ensinar produtos - requer login
  const handleTeachProducts = () => {
    if (!isAuthenticated) {
      openAuthModal("signup")
      return
    }
    onTeachProducts()
  }

  // Conectar WhatsApp - requer login + assinatura
  const handleConnectWhatsApp = () => {
    if (!isAuthenticated) {
      openAuthModal("signup")
      return
    }
    
    const hasActiveSubscription = subscription?.status === "trial" || subscription?.status === "active"
    if (!hasActiveSubscription) {
      openSubscriptionModal()
      return
    }
    
    onConnectWhatsApp()
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
      {/* Action Buttons - SEMPRE visíveis, com permissões individuais */}
      {showActionButtons && (
        <div className="flex flex-wrap justify-center gap-2 pb-2">
          <ActionButton 
            icon={<Paperclip className="h-4 w-4" />} 
            label="Anexar Arquivos" 
            onClick={handleFileClick}
            requiresAuth={!isAuthenticated}
          />
          <ActionButton
            icon={<Brain className="h-4 w-4" />}
            label="Ensinar sobre meus produtos"
            onClick={handleTeachProducts}
            requiresAuth={!isAuthenticated}
          />
          <ActionButton
            icon={<MessageCircle className="h-4 w-4" />}
            label="Conectar WhatsApp"
            onClick={handleConnectWhatsApp}
            requiresAuth={!isAuthenticated}
            requiresSubscription={isAuthenticated && !(subscription?.status === "trial" || subscription?.status === "active")}
          />
        </div>
      )}

      {/* Input Box */}
      <div className="relative rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow focus-within:border-gray-300 focus-within:shadow-md">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pergunte qualquer coisa sobre vendas, marketing ou WhatsApp…"
          className="max-h-48 min-h-[56px] w-full resize-none bg-transparent px-4 py-4 pr-14 text-gray-900 placeholder:text-gray-400 focus:outline-none"
          rows={1}
          style={{
            height: "auto",
            minHeight: "56px",
          }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement
            target.style.height = "auto"
            target.style.height = `${Math.min(target.scrollHeight, 192)}px`
          }}
        />

        {/* Attach button inside input */}
        <button
          onClick={handleFileClick}
          className="absolute bottom-3 left-3 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <Paperclip className="h-5 w-5" />
        </button>

        {/* Send Button */}
        <Button
          onClick={handleSubmit}
          disabled={!value.trim()}
          size="icon"
          className="absolute bottom-3 right-3 h-8 w-8 rounded-lg bg-gray-900 text-white transition-all hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>

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
