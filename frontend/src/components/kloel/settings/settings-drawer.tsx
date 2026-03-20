"use client"

import { useState } from "react"
import { X, User, CreditCard, Brain, Clock, ChevronRight, Settings, BarChart3, KanbanSquare } from "lucide-react"
import { AccountSettingsSection } from "./account-settings-section"
import { BillingSettingsSection } from "./billing-settings-section"
import { BrainSettingsSection } from "./brain-settings-section"
import { ActivitySection } from "./activity-section"
import { AnalyticsSettingsSection } from "./analytics-settings-section"
import { CrmSettingsSection } from "./crm-settings-section"
import { SystemAlertsCard } from "./system-alerts-card"
import type { AgentActivity } from "../AgentConsole"

interface SettingsDrawerProps {
  isOpen: boolean
  onClose: () => void
  subscriptionStatus: "none" | "trial" | "active" | "expired" | "suspended"
  trialDaysLeft: number
  creditsBalance: number
  hasCard: boolean
  onActivateTrial: () => void
  initialTab?: "account" | "billing" | "brain" | "crm" | "activity" | "analytics"
  scrollToCreditCard?: boolean
  side?: "left" | "right"
  showHandle?: boolean
  onOpen?: () => void
  activityFeed?: AgentActivity[]
}

type SettingsTab = "account" | "billing" | "brain" | "crm" | "activity" | "analytics"

const tabs = [
  { id: "account" as const, label: "Configuracao da conta", icon: User },
  { id: "billing" as const, label: "Metodos de pagamento", icon: CreditCard },
  { id: "brain" as const, label: "Configurar Kloel", icon: Brain },
  { id: "crm" as const, label: "CRM e pipeline", icon: KanbanSquare },
  { id: "analytics" as const, label: "Analytics", icon: BarChart3 },
  { id: "activity" as const, label: "Atividade", icon: Clock },
]

export function SettingsDrawer({
  isOpen,
  onClose,
  subscriptionStatus,
  trialDaysLeft,
  creditsBalance,
  hasCard,
  onActivateTrial,
  initialTab = "account",
  scrollToCreditCard = false,
  side = "left",
  showHandle = true,
  onOpen,
  activityFeed,
}: SettingsDrawerProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab)

  if (isOpen && initialTab !== "account" && activeTab !== initialTab) {
    setActiveTab(initialTab)
  }

  if (!isOpen) {
    if (!showHandle) return null

    return (
      <button
        onClick={onOpen}
        className="fixed left-0 top-1/2 z-40 -translate-y-1/2 rounded-r-2xl border border-l-0 border-gray-200 bg-white px-3 py-2 shadow-lg transition-all hover:pl-5"
      >
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-gray-600" />
          <span className="text-xs font-medium text-gray-600">Configurações</span>
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </div>
      </button>
    )
  }

  const drawerClasses =
    side === "left"
      ? "fixed inset-y-0 left-0 z-50 w-full max-w-xl bg-white shadow-2xl md:rounded-r-2xl"
      : "fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-white shadow-2xl md:rounded-l-2xl"

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm transition-opacity" onClick={onClose} />

      {/* Drawer */}
      <div className={drawerClasses}>
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h2 className="text-xl font-semibold text-gray-900">Configuracoes</h2>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Tabs Navigation */}
          <div className="border-b border-gray-100 px-4 py-3">
            <nav className="flex flex-col gap-1">
              {tabs.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition-all ${
                      isActive
                        ? "bg-gray-100 font-semibold text-gray-900"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${isActive ? "text-gray-900" : "text-gray-400"}`} />
                    {tab.label}
                  </button>
                )
              })}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {activeTab !== "activity" && (
              <div className="mb-6">
                <SystemAlertsCard />
              </div>
            )}

            {activeTab === "account" && <AccountSettingsSection />}
            {activeTab === "billing" && (
              <BillingSettingsSection
                subscriptionStatus={subscriptionStatus}
                trialDaysLeft={trialDaysLeft}
                creditsBalance={creditsBalance}
                hasCard={hasCard}
                onActivateTrial={onActivateTrial}
                scrollToCreditCard={scrollToCreditCard}
              />
            )}
            {activeTab === "brain" && <BrainSettingsSection />}
            {activeTab === "crm" && <CrmSettingsSection />}
            {activeTab === "analytics" && <AnalyticsSettingsSection />}
            {activeTab === "activity" && <ActivitySection activities={activityFeed} />}
          </div>
        </div>
      </div>
    </>
  )
}
