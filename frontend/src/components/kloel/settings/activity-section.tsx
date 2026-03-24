"use client"

import Link from "next/link"
import { MessageSquare, Send, AlertTriangle, CreditCard, Smartphone, ShoppingCart, XCircle } from "lucide-react"
import type { AgentActivity } from "../AgentConsole"

interface ActivityItem {
  id: string
  type: "response" | "sent" | "error" | "sale" | "checkout_click" | "reconnect" | "low_credits"
  message: string
  time: string
}

interface ActivitySectionProps {
  activities?: AgentActivity[]
}

function formatRelativeTime(date: Date) {
  const delta = Math.max(0, Date.now() - date.getTime())
  const seconds = Math.floor(delta / 1000)
  if (seconds < 60) return "Agora mesmo"
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min atras`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h atras`
  return `${Math.floor(seconds / 86400)} dia(s) atras`
}

function normalizeActivities(activities?: AgentActivity[]): ActivityItem[] {
  if (!activities || activities.length === 0) {
    return []
  }

  return activities
    .slice(-12)
    .reverse()
    .map((activity) => {
      let type: ActivityItem["type"] = "response"
      if (activity.type === "message_sent") type = "sent"
      if (activity.type === "error") type = "error"
      if (activity.type === "lead_qualified") type = "sale"
      if (activity.type === "connection_status") type = "reconnect"
      if (activity.type === "follow_up_scheduled") type = "checkout_click"

      return {
        id: activity.id,
        type,
        message: activity.description || activity.title,
        time: formatRelativeTime(activity.timestamp),
      }
    })
}

export function ActivitySection({ activities }: ActivitySectionProps) {
  const items = normalizeActivities(activities)

  const getActivityIcon = (type: ActivityItem["type"]) => {
    switch (type) {
      case "response":
        return { icon: MessageSquare, bg: "bg-blue-100", color: "text-blue-600" }
      case "sent":
        return { icon: Send, bg: "bg-green-100", color: "text-green-600" }
      case "error":
        return { icon: XCircle, bg: "bg-red-100", color: "text-red-600" }
      case "sale":
        return { icon: ShoppingCart, bg: "bg-teal-100", color: "text-teal-600" }
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
        <h4 className="text-sm font-semibold text-gray-900">Acessos rapidos</h4>
        <p className="mt-1 text-xs text-gray-500">Operacoes do produto (estilo perfeito)</p>
        <div className="mt-4">
          <Link
            href="/inbox"
            className="inline-flex items-center rounded-xl bg-[#E85D30] px-4 py-2 text-sm font-semibold text-white hover:bg-[#E85D30] transition-colors"
          >
            Abrir Inbox
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[19px] top-0 h-full w-0.5 bg-gray-100" />

          <div className="space-y-4">
            {(items.length > 0 ? items : [
              { id: "empty", type: "response" as const, message: "O feed real do agente ainda nao gerou eventos nesta sessao.", time: "Aguardando atividade" },
            ]).map((activity) => {
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
