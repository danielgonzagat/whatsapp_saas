"use client"

import {
  CheckCircle2,
  Circle,
  Package,
  FileText,
  CreditCard,
  MessageSquare,
  HelpCircle,
  Smartphone,
} from "lucide-react"

interface MissingStepsCardProps {
  hasProducts: boolean
  hasFiles: boolean
  hasCheckout: boolean
  hasVoiceTone: boolean
  hasFaq: boolean
  hasOpeningMessage: boolean
  hasWhatsApp: boolean
}

export function MissingStepsCard({
  hasProducts = false,
  hasFiles = false,
  hasCheckout = false,
  hasVoiceTone = false,
  hasFaq = false,
  hasOpeningMessage = false,
  hasWhatsApp = false,
}: MissingStepsCardProps) {
  const steps = [
    { label: "Cadastrar produtos", done: hasProducts, icon: Package },
    { label: "Enviar arquivos", done: hasFiles, icon: FileText },
    { label: "Configurar planos de checkout", done: hasCheckout, icon: CreditCard },
    { label: "Definir tom de voz", done: hasVoiceTone, icon: MessageSquare },
    { label: "Adicionar perguntas frequentes", done: hasFaq, icon: HelpCircle },
    { label: "Configurar mensagem de abertura", done: hasOpeningMessage, icon: MessageSquare },
    { label: "Conectar WhatsApp", done: hasWhatsApp, icon: Smartphone },
  ]

  const completedCount = steps.filter((s) => s.done).length
  const allCompleted = completedCount === steps.length

  if (allCompleted) return null

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h4 className="text-lg font-semibold text-gray-900">O que falta para completar o seu Kloel?</h4>
        <p className="mt-1 text-sm text-gray-500">
          {completedCount} de {steps.length} etapas concluidas
        </p>
      </div>

      <div className="space-y-2">
        {steps.map((step, index) => {
          const Icon = step.icon
          return (
            <div
              key={index}
              className={`flex items-center gap-3 rounded-xl p-3 transition-colors ${
                step.done ? "bg-green-50" : "bg-gray-50"
              }`}
            >
              {step.done ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <Circle className="h-5 w-5 text-gray-300" />
              )}
              <Icon className={`h-4 w-4 ${step.done ? "text-green-600" : "text-gray-400"}`} />
              <span className={`text-sm ${step.done ? "text-green-700" : "text-gray-600"}`}>{step.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
