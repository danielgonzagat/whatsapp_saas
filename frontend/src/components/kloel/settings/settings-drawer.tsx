"use client"

import { useState } from "react"
import { X, User, CreditCard, Brain, Clock } from "lucide-react"
import { AccountSettingsSection } from "./account-settings-section"
import { BillingSettingsSection } from "./billing-settings-section"
import { BrainSettingsSection } from "./brain-settings-section"
import { ActivitySection } from "./activity-section"
import { SystemAlertsCard } from "./system-alerts-card"

interface SettingsDrawerProps {
  isOpen: boolean
  onClose: () => void
  subscriptionStatus: "none" | "trial" | "active" | "expired" | "suspended"
  trialDaysLeft: number
  creditsBalance: number
  hasCard: boolean
  onActivateTrial: () => void
  initialTab?: "account" | "billing" | "brain" | "activity"
  scrollToCreditCard?: boolean
}

type SettingsTab = "account" | "billing" | "brain" | "activity"

const tabs = [
  { id: "account" as const, label: "Configuracao da conta", icon: User },
  { id: "billing" as const, label: "Metodos de pagamento", icon: CreditCard },
  { id: "brain" as const, label: "Configurar Kloel", icon: Brain },
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
}: SettingsDrawerProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab)

  if (isOpen && initialTab !== "account" && activeTab !== initialTab) {
    setActiveTab(initialTab)
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm transition-opacity" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-white shadow-2xl md:rounded-l-2xl">
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
            {activeTab === "activity" && <ActivitySection />}
          </div>
        </div>
      </div>
    </>
  )
}
