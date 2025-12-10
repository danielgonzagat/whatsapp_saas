"use client"

import { useEffect, useState, useCallback } from "react"
import { X, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { whatsappApi } from "@/lib/api"

interface QRModalProps {
  isOpen: boolean
  onClose: () => void
  onConnected: () => void
}

type ConnectionState = "loading" | "qr" | "connecting" | "connected" | "error"

export function QRModal({ isOpen, onClose, onConnected }: QRModalProps) {
  const [state, setState] = useState<ConnectionState>("loading")
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pollCount, setPollCount] = useState(0)

  const startSession = useCallback(async () => {
    setState("loading")
    setError(null)

    try {
      // Start session
      const startRes = await whatsappApi.startSession()
      if (startRes.error) {
        setError(startRes.error)
        setState("error")
        return
      }

      // Small delay then fetch QR
      await new Promise(r => setTimeout(r, 1000))
      await fetchQrCode()
    } catch (err: any) {
      setError(err.message || "Falha ao iniciar sessão")
      setState("error")
    }
  }, [])

  const fetchQrCode = async () => {
    try {
      const qrRes = await whatsappApi.getQrCode()
      
      if (qrRes.error) {
        // Might be already connected
        const statusRes = await whatsappApi.getStatus()
        if (statusRes.data?.state === 'CONNECTED') {
          setState("connected")
          setTimeout(onConnected, 1500)
          return
        }
        setError(qrRes.error)
        setState("error")
        return
      }

      if (qrRes.data?.available && qrRes.data?.qr) {
        setQrCode(qrRes.data.qr)
        setState("qr")
      } else {
        // Check status
        const statusRes = await whatsappApi.getStatus()
        if (statusRes.data?.state === 'CONNECTED') {
          setState("connected")
          setTimeout(onConnected, 1500)
        } else {
          // QR not ready yet, retry
          await new Promise(r => setTimeout(r, 2000))
          await fetchQrCode()
        }
      }
    } catch (err: any) {
      setError(err.message || "Falha ao obter QR Code")
      setState("error")
    }
  }

  const pollStatus = useCallback(async () => {
    if (state !== "qr") return

    try {
      const statusRes = await whatsappApi.getStatus()
      
      // Backend returns { state: 'CONNECTED' | 'DISCONNECTED' | 'OPENING' }
      if (statusRes.data?.state === 'CONNECTED') {
        setState("connecting")
        await new Promise(r => setTimeout(r, 1000))
        setState("connected")
        setTimeout(onConnected, 1500)
        return
      }

      // If QR expired, refresh it
      if (pollCount > 0 && pollCount % 15 === 0) {
        await fetchQrCode()
      }
    } catch {
      // Ignore polling errors
    }
  }, [state, pollCount, onConnected])

  // Start session when modal opens
  useEffect(() => {
    if (isOpen) {
      startSession()
      setPollCount(0)
    } else {
      setState("loading")
      setQrCode(null)
      setError(null)
    }
  }, [isOpen, startSession])

  // Poll status while showing QR
  useEffect(() => {
    if (!isOpen || state !== "qr") return

    const interval = setInterval(() => {
      setPollCount(c => c + 1)
      pollStatus()
    }, 2000)

    return () => clearInterval(interval)
  }, [isOpen, state, pollStatus])

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

          {/* Content based on state */}
          <div className="relative mb-6 flex h-64 w-64 items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50">
            {state === "loading" && (
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
                <span className="text-sm font-medium text-gray-600">Iniciando sessão...</span>
              </div>
            )}

            {state === "qr" && qrCode && (
              <div className="flex flex-col items-center">
                <img 
                  src={qrCode} 
                  alt="QR Code" 
                  className="h-56 w-56 rounded-lg"
                />
              </div>
            )}

            {state === "connecting" && (
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-green-600" />
                <span className="text-sm font-medium text-gray-600">Conectando...</span>
              </div>
            )}

            {state === "connected" && (
              <div className="flex flex-col items-center gap-3">
                <CheckCircle2 className="h-16 w-16 text-green-500" />
                <span className="text-sm font-medium text-green-700">Conectado com sucesso!</span>
              </div>
            )}

            {state === "error" && (
              <div className="flex flex-col items-center gap-3">
                <AlertCircle className="h-12 w-12 text-red-500" />
                <span className="text-sm font-medium text-red-700">{error || "Erro ao conectar"}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startSession}
                  className="mt-2"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Tentar novamente
                </Button>
              </div>
            )}
          </div>

          {/* Instructions */}
          {(state === "loading" || state === "qr") && (
            <div className="space-y-2 text-sm text-gray-500">
              <p>1. Abra o WhatsApp no seu celular</p>
              <p>2. Toque em Mais opções ou Configurações</p>
              <p>3. Toque em Aparelhos conectados</p>
              <p>4. Escaneie o código QR</p>
            </div>
          )}

          {state === "qr" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchQrCode}
              className="mt-4 text-gray-500"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar QR Code
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
