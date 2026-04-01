"use client"

import { useState } from "react"
import { CheckCircle2, AlertTriangle, XCircle, Info, X, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SettingsCard, SettingsHeader, SettingsInset, SettingsModal, SettingsNotice } from "./contract"

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

  const alerts = propAlerts || []

  const getAlertStyles = (type: Alert["type"]) => {
    switch (type) {
      case "success":
        return { bg: "bg-[#10B981]/12", text: "text-[#7FE2BC]", icon: CheckCircle2, iconColor: "text-[#7FE2BC]" }
      case "warning":
        return { bg: "bg-[#E85D30]/12", text: "text-[#F2B29D]", icon: AlertTriangle, iconColor: "text-[#F2B29D]" }
      case "error":
        return { bg: "bg-[#E05252]/12", text: "text-[#F7A8A8]", icon: XCircle, iconColor: "text-[#F7A8A8]" }
      case "info":
        return { bg: "bg-[#3B82F6]/12", text: "text-[#93C5FD]", icon: Info, iconColor: "text-[#93C5FD]" }
    }
  }

  const handleShowResolve = (alert: Alert) => {
    setSelectedAlert(alert)
    setShowResolveModal(true)
  }

  return (
    <>
      <SettingsCard className="p-6">
        <SettingsHeader
          title="Problemas e Alertas"
          description="Status geral do sistema Kloel"
          className="mb-4"
        />

        <div className="space-y-2">
          {alerts.length === 0 ? (
            <SettingsInset className="p-4 text-sm text-[#6E6E73]">
              Nenhum alerta operacional carregado nesta sessao.
            </SettingsInset>
          ) : alerts.map((alert) => {
            const styles = getAlertStyles(alert.type)
            const Icon = styles.icon
            return (
              <div key={alert.id} className={`flex items-center justify-between rounded-md ${styles.bg} p-4`}>
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
      </SettingsCard>

      {showResolveModal && selectedAlert && (
        <SettingsModal className="max-w-md">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#E0DDD8]">Como resolver</h3>
              <button
                onClick={() => setShowResolveModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#6E6E73] hover:bg-[#19191C]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SettingsNotice tone={selectedAlert.type === "error" ? "danger" : selectedAlert.type === "warning" ? "warning" : selectedAlert.type === "info" ? "info" : "neutral"}>
              <p className="text-sm">{selectedAlert.detail || "Instrucoes de resolucao em breve."}</p>
            </SettingsNotice>
            <Button
              onClick={() => setShowResolveModal(false)}
              className="mt-4 w-full rounded-md border border-[#E85D30] bg-[#E85D30] text-[#0A0A0C] hover:opacity-95"
            >
              Entendi
            </Button>
        </SettingsModal>
      )}
    </>
  )
}
