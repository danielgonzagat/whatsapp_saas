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
import { WORKSPACE_SETTINGS_SECTIONS, type WorkspaceSettingsSectionKey } from "./settings-registry"
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

type SettingsTab = WorkspaceSettingsSectionKey

const tabIcons = {
  user: User,
  bank: CreditCard,
  shield: Brain,
  users: KanbanSquare,
  eye: BarChart3,
  clock: Clock,
} as const

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
        className="fixed left-0 top-1/2 z-40 -translate-y-1/2 rounded-r-md border border-l-0 border-[#222226] bg-[#111113] px-3 py-2  transition-all hover:pl-5"
      >
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-[#6E6E73]" />
          <span className="text-xs font-medium text-[#6E6E73]">Configurações</span>
          <ChevronRight className="h-4 w-4 text-[#6E6E73]" />
        </div>
      </button>
    )
  }

  const drawerClasses =
    side === "left"
      ? "fixed inset-y-0 left-0 z-50 w-full max-w-xl  md:rounded-r-md"
      : "fixed inset-y-0 right-0 z-50 w-full max-w-xl  md:rounded-l-md"

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity" onClick={onClose} />

      {/* Drawer */}
      <div className={drawerClasses} style={{ backgroundColor: '#111113' }}>
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#222226] px-6 py-4">
            <h2 className="text-xl font-semibold text-[#E0DDD8]" style={{ fontFamily: "'Sora', sans-serif" }}>Configuracoes</h2>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#6E6E73] transition-colors hover:bg-[#19191C] hover:text-[#E0DDD8]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Tabs Navigation */}
          <div className="border-b border-[#222226] px-4 py-3" style={{ backgroundColor: '#0A0A0C' }}>
            <nav className="flex flex-col gap-1">
              {WORKSPACE_SETTINGS_SECTIONS.map((tab) => {
                const Icon = tabIcons[tab.iconKey]
                const isActive = activeTab === tab.key
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition-all ${
                      isActive
                        ? "font-semibold text-[#E85D30] border-l-2 border-[#E85D30]"
                        : "text-[#6E6E73] hover:bg-[#19191C] hover:text-[#E0DDD8] border-l-2 border-transparent"
                    }`}
                    style={isActive ? { backgroundColor: 'rgba(232,93,48,0.08)' } : undefined}
                  >
                    <Icon className={`h-5 w-5 ${isActive ? "text-[#E85D30]" : "text-[#6E6E73]"}`} />
                    {tab.label}
                  </button>
                )
              })}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6" style={{ backgroundColor: '#0A0A0C' }}>
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
