"use client"

import { TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"

interface RealtimeUsageCardProps {
  messagesToday: number
  estimatedDailyCost: number
  monthlyConsumption: number
  creditsBalance: number
  maxCredits: number
  onAddCredits: () => void
}

export function RealtimeUsageCard({
  messagesToday = 42,
  estimatedDailyCost = 0.42,
  monthlyConsumption = 12.5,
  creditsBalance = 5.0,
  maxCredits = 5.0,
  onAddCredits,
}: RealtimeUsageCardProps) {
  const creditsPercent = (creditsBalance / maxCredits) * 100

  const getBarColor = () => {
    if (creditsPercent >= 70) return "bg-green-500"
    if (creditsPercent >= 30) return "bg-yellow-500"
    return "bg-red-500"
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <TrendingUp className="h-5 w-5 text-gray-600" />
        <h4 className="text-lg font-semibold text-gray-900">Uso em tempo real do Kloel</h4>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-gray-50 p-4">
          <p className="text-xs text-gray-500">Mensagens enviadas hoje</p>
          <p className="text-2xl font-bold text-gray-900">{messagesToday}</p>
        </div>
        <div className="rounded-xl bg-gray-50 p-4">
          <p className="text-xs text-gray-500">Estimativa de custo diario</p>
          <p className="text-2xl font-bold text-gray-900">US$ {estimatedDailyCost.toFixed(2)}</p>
        </div>
        <div className="rounded-xl bg-gray-50 p-4">
          <p className="text-xs text-gray-500">Consumo mensal aproximado</p>
          <p className="text-2xl font-bold text-gray-900">US$ {monthlyConsumption.toFixed(2)}</p>
        </div>
        <div className="rounded-xl bg-gray-50 p-4">
          <p className="text-xs text-gray-500">Saldo de creditos</p>
          <p className="text-2xl font-bold text-gray-900">US$ {creditsBalance.toFixed(2)}</p>
        </div>
      </div>

      {/* Credits Bar */}
      <div className="mb-2">
        <div className="mb-1 flex justify-between text-xs text-gray-500">
          <span>Creditos restantes</span>
          <span>{creditsPercent.toFixed(0)}%</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className={`h-full rounded-full transition-all ${getBarColor()}`}
            style={{ width: `${creditsPercent}%` }}
          />
        </div>
      </div>

      {creditsPercent < 10 && (
        <div className="mt-4 rounded-xl bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">Seus creditos estao acabando.</p>
          <p className="mt-1 text-xs text-red-600">
            Adicione mais creditos para evitar pausas no atendimento automatico.
          </p>
          <Button onClick={onAddCredits} className="mt-3 w-full rounded-xl bg-red-600 text-white hover:bg-red-700">
            Adicionar creditos agora
          </Button>
        </div>
      )}
    </div>
  )
}
