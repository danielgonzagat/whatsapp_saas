"use client"

import { MessageSquare, Send, AlertTriangle, CreditCard, Smartphone, ShoppingCart, XCircle } from "lucide-react"

interface ActivityItem {
  id: string
  type: "response" | "sent" | "error" | "sale" | "checkout_click" | "reconnect" | "low_credits"
  message: string
  time: string
}

export function ActivitySection() {
  // Demo data
  const activities: ActivityItem[] = [
    { id: "1", type: "response", message: "Kloel respondeu um cliente", time: "Agora mesmo" },
    { id: "2", type: "sent", message: "Mensagem enviada com sucesso", time: "2 min atras" },
    { id: "3", type: "checkout_click", message: "Cliente clicou no link de checkout", time: "5 min atras" },
    { id: "4", type: "sale", message: "Venda iniciada", time: "15 min atras" },
    { id: "5", type: "reconnect", message: "WhatsApp reconectado", time: "1 hora atras" },
    { id: "6", type: "low_credits", message: "Creditos abaixo de 20%", time: "2 horas atras" },
    { id: "7", type: "error", message: "Erro ao enviar mensagem", time: "3 horas atras" },
  ]

  const getActivityIcon = (type: ActivityItem["type"]) => {
    switch (type) {
      case "response":
        return { icon: MessageSquare, bg: "bg-blue-100", color: "text-blue-600" }
      case "sent":
        return { icon: Send, bg: "bg-green-100", color: "text-green-600" }
      case "error":
        return { icon: XCircle, bg: "bg-red-100", color: "text-red-600" }
      case "sale":
        return { icon: ShoppingCart, bg: "bg-purple-100", color: "text-purple-600" }
      case "checkout_click":
        return { icon: CreditCard, bg: "bg-indigo-100", color: "text-indigo-600" }
      case "reconnect":
        return { icon: Smartphone, bg: "bg-green-100", color: "text-green-600" }
      case "low_credits":
        return { icon: AlertTriangle, bg: "bg-yellow-100", color: "text-yellow-600" }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Atividade</h3>
        <p className="mt-1 text-sm text-gray-500">Historico de acoes e eventos do Kloel</p>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[19px] top-0 h-full w-0.5 bg-gray-100" />

          <div className="space-y-4">
            {activities.map((activity) => {
              const iconData = getActivityIcon(activity.type)
              const Icon = iconData.icon
              return (
                <div key={activity.id} className="relative flex items-start gap-4 pl-0">
                  <div
                    className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full ${iconData.bg}`}
                  >
                    <Icon className={`h-4 w-4 ${iconData.color}`} />
                  </div>
                  <div className="flex-1 pt-2">
                    <p className="text-sm font-medium text-gray-900">{activity.message}</p>
                    <p className="text-xs text-gray-500">{activity.time}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
