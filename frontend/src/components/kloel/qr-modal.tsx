"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface QRModalProps {
  isOpen: boolean
  onClose: () => void
  onConnected: () => void
}

export function QRModal({ isOpen, onClose, onConnected }: QRModalProps) {
  const [isConnecting, setIsConnecting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      // Simulate QR scanning after 5 seconds for demo
      const timer = setTimeout(() => {
        setIsConnecting(true)
        setTimeout(() => {
          onConnected()
          setIsConnecting(false)
        }, 1500)
      }, 5000)

      return () => clearTimeout(timer)
    }
  }, [isOpen, onConnected])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        {/* Close Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="absolute right-4 top-4 h-8 w-8 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </Button>

        <div className="flex flex-col items-center text-center">
          {/* Title */}
          <h2 className="mb-2 text-xl font-semibold text-gray-900">Conectar WhatsApp</h2>
          <p className="mb-6 text-sm text-gray-500">Escaneie com seu WhatsApp para conectar</p>

          {/* QR Code Placeholder */}
          <div className="relative mb-6 flex h-64 w-64 items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50">
            {isConnecting ? (
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
                <span className="text-sm font-medium text-gray-600">Conectando...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                {/* Simulated QR Code */}
                <div className="grid grid-cols-8 gap-1">
                  {Array.from({ length: 64 }).map((_, i) => (
                    <div key={i} className={`h-4 w-4 rounded-sm ${Math.random() > 0.5 ? "bg-gray-900" : "bg-white"}`} />
                  ))}
                </div>
                <span className="mt-4 text-xs text-gray-400">Aguardando leitura...</span>
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="space-y-2 text-sm text-gray-500">
            <p>1. Abra o WhatsApp no seu celular</p>
            <p>2. Toque em Mais opções ou Configurações</p>
            <p>3. Toque em Aparelhos conectados</p>
            <p>4. Escaneie o código QR</p>
          </div>
        </div>
      </div>
    </div>
  )
}
