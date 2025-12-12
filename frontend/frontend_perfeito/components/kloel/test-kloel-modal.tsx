"use client"

import { useState } from "react"
import { X, Send, Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface TestKloelModalProps {
  isOpen: boolean
  onClose: () => void
}

export function TestKloelModal({ isOpen, onClose }: TestKloelModalProps) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle")

  if (!isOpen) return null

  const handleSendTest = () => {
    setStatus("sending")
    setTimeout(() => {
      setStatus("sent")
      setTimeout(() => {
        setStatus("idle")
        onClose()
      }, 2000)
    }, 1500)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Enviar mensagem de teste</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {status === "sent" ? (
          <div className="flex flex-col items-center py-8">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-center text-gray-700">Mensagem enviada com sucesso!</p>
            <p className="mt-1 text-center text-sm text-gray-500">Verifique seu WhatsApp.</p>
          </div>
        ) : (
          <>
            <div className="mb-6 rounded-2xl bg-gray-50 p-5">
              <p className="text-sm text-gray-600">
                O Kloel enviara uma mensagem para o seu WhatsApp, para garantir que tudo esta funcionando corretamente.
              </p>
            </div>

            <Button
              onClick={handleSendTest}
              disabled={status === "sending"}
              className="w-full rounded-xl bg-gray-900 py-6 text-white hover:bg-gray-800"
            >
              {status === "sending" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Enviar mensagem de teste
                </>
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
