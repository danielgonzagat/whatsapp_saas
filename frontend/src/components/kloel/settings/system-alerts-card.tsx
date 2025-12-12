"use client"

import { useState } from "react"
import { CheckCircle2, AlertTriangle, XCircle, Info, X, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Alert {
  id: string
  type: "success" | "warning" | "error" | "info"
  message: string
  detail?: string
}

interface SystemAlertsCardProps {
  alerts?: Alert[]
}

export function SystemAlertsCard({ alerts: propAlerts }: SystemAlertsCardProps) {
  const [showResolveModal, setShowResolveModal] = useState(false)
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)

  // Default demo alerts
  const defaultAlerts: Alert[] = [
    { id: "1", type: "success", message: "Tudo funcionando", detail: "Todos os sistemas estao operacionais." },
  ]

  const alerts = propAlerts || defaultAlerts

  const getAlertStyles = (type: Alert["type"]) => {
    switch (type) {
      case "success":
        return { bg: "bg-green-50", text: "text-green-700", icon: CheckCircle2, iconColor: "text-green-500" }
      case "warning":
        return { bg: "bg-yellow-50", text: "text-yellow-700", icon: AlertTriangle, iconColor: "text-yellow-500" }
      case "error":
        return { bg: "bg-red-50", text: "text-red-700", icon: XCircle, iconColor: "text-red-500" }
      case "info":
        return { bg: "bg-blue-50", text: "text-blue-700", icon: Info, iconColor: "text-blue-500" }
    }
  }

  const handleShowResolve = (alert: Alert) => {
    setSelectedAlert(alert)
    setShowResolveModal(true)
  }

  return (
    <>
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h4 className="text-lg font-semibold text-gray-900">Problemas e Alertas</h4>
          <p className="mt-1 text-sm text-gray-500">Status geral do sistema Kloel</p>
        </div>

        <div className="space-y-2">
          {alerts.map((alert) => {
            const styles = getAlertStyles(alert.type)
            const Icon = styles.icon
            return (
              <div key={alert.id} className={`flex items-center justify-between rounded-xl ${styles.bg} p-4`}>
                <div className="flex items-center gap-3">
                  <Icon className={`h-5 w-5 ${styles.iconColor}`} />
                  <span className={`text-sm font-medium ${styles.text}`}>{alert.message}</span>
                </div>
                {alert.type !== "success" && (
                  <button
                    onClick={() => handleShowResolve(alert)}
                    className={`flex items-center gap-1 text-xs font-medium ${styles.text} hover:underline`}
                  >
                    Ver como resolver
                    <ChevronRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Resolve Modal */}
      {showResolveModal && selectedAlert && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Como resolver</h3>
              <button
                onClick={() => setShowResolveModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-sm text-gray-700">{selectedAlert.detail || "Instrucoes de resolucao em breve."}</p>
            </div>
            <Button
              onClick={() => setShowResolveModal(false)}
              className="mt-4 w-full rounded-xl bg-gray-900 text-white hover:bg-gray-800"
            >
              Entendi
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
