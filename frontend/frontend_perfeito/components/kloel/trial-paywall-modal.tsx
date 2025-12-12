"use client"

import { X, MessageSquare, Clock, Zap, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"

interface TrialPaywallModalProps {
  isOpen: boolean
  onClose: () => void
  onActivateTrial: () => void
  variant?: "activate" | "renew"
}

export function TrialPaywallModal({ isOpen, onClose, onActivateTrial, variant = "activate" }: TrialPaywallModalProps) {
  if (!isOpen) return null

  const isRenew = variant === "renew"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl">
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
          {/* Icon */}
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-900">
            <Smartphone className="h-8 w-8 text-white" />
          </div>

          {/* Title */}
          <h2 className="mb-3 text-2xl font-semibold text-gray-900">
            {isRenew ? "Renove seu plano para continuar vendendo pelo WhatsApp" : "Ative seu teste grátis de 7 dias"}
          </h2>

          {/* Description */}
          <div className="mb-6 space-y-3 text-gray-600">
            {isRenew ? (
              <p>
                Seu período de teste terminou ou seus créditos foram usados. Ative o Plano Basic para continuar usando o
                Kloel no WhatsApp.
              </p>
            ) : (
              <>
                <p>
                  Para conectar o WhatsApp e deixar o Kloel atender seus clientes de forma 100% autônoma, você precisa
                  ativar o Plano Basic.
                </p>
                <p>
                  Você ganha <strong>7 dias grátis</strong> + <strong>US$ 5 em créditos de mensagens</strong>. Só
                  começamos a cobrar depois que o período de teste terminar e seus créditos forem usados.
                </p>
              </>
            )}
          </div>

          {/* Benefits */}
          {!isRenew && (
            <div className="mb-8 w-full space-y-3 rounded-xl bg-gray-50 p-4 text-left">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100">
                  <Smartphone className="h-4 w-4 text-green-600" />
                </div>
                <span className="text-sm text-gray-700">Conexão direta com seu WhatsApp</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
                  <Clock className="h-4 w-4 text-blue-600" />
                </div>
                <span className="text-sm text-gray-700">Atendimento autônomo 24/7 pelo Kloel</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100">
                  <Zap className="h-4 w-4 text-purple-600" />
                </div>
                <span className="text-sm text-gray-700">7 dias de uso completo sem cobrança</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100">
                  <MessageSquare className="h-4 w-4 text-orange-600" />
                </div>
                <span className="text-sm text-gray-700">US$ 5 em créditos de mensagens para testar à vontade</span>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex w-full flex-col gap-3">
            <Button
              onClick={onActivateTrial}
              className="w-full rounded-xl bg-gray-900 py-6 text-base font-medium text-white hover:bg-gray-800"
            >
              {isRenew ? "Ativar assinatura agora" : "Ativar teste grátis agora"}
            </Button>
            <Button
              variant="ghost"
              onClick={onClose}
              className="w-full text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Voltar para o chat
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
