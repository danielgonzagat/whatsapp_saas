'use client';

import { KLOEL_THEME } from '@/lib/kloel-theme';
import {
  BarChart3,
  Brain,
  ChevronRight,
  Clock,
  CreditCard,
  KanbanSquare,
  Settings,
  User,
  X,
} from 'lucide-react';
import { useState } from 'react';
import type { AgentActivity } from '../AgentConsole';
import { AccountSettingsSection } from './account-settings-section';
import { ActivitySection } from './activity-section';
import { AnalyticsSettingsSection } from './analytics-settings-section';
import { BillingSettingsSection } from './billing-settings-section';
import { BrainSettingsSection } from './brain-settings-section';
import { CrmSettingsSection } from './crm-settings-section';
import { WORKSPACE_SETTINGS_SECTIONS, type WorkspaceSettingsSectionKey } from './settings-registry';
import { SystemAlertsCard } from './system-alerts-card';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  subscriptionStatus: 'none' | 'trial' | 'active' | 'expired' | 'suspended';
  trialDaysLeft: number;
  creditsBalance: number;
  hasCard: boolean;
  onActivateTrial: () => void;
  initialTab?: 'account' | 'billing' | 'brain' | 'crm' | 'activity' | 'analytics';
  scrollToCreditCard?: boolean;
  side?: 'left' | 'right';
  showHandle?: boolean;
  onOpen?: () => void;
  activityFeed?: AgentActivity[];
}

type SettingsTab = WorkspaceSettingsSectionKey;

const tabIcons = {
  user: User,
  bank: CreditCard,
  shield: Brain,
  users: KanbanSquare,
  eye: BarChart3,
  clock: Clock,
} as const;

/** Settings drawer. */
export function SettingsDrawer({
  isOpen,
  onClose,
  subscriptionStatus,
  trialDaysLeft,
  creditsBalance,
  hasCard,
  onActivateTrial,
  initialTab = 'account',
  scrollToCreditCard = false,
  side = 'left',
  showHandle = true,
  onOpen,
  activityFeed,
}: SettingsDrawerProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  if (isOpen && initialTab !== 'account' && activeTab !== initialTab) {
    setActiveTab(initialTab);
  }

  if (!isOpen) {
    if (!showHandle) {
      return null;
    }

    return (
      <button
        type="button"
        onClick={onOpen}
        className="fixed left-0 top-1/2 z-40 -translate-y-1/2 rounded-r-md border border-l-0 border-[var(--app-border-primary)] bg-[var(--app-bg-card)] px-3 py-2 transition-all hover:pl-5"
      >
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-[var(--app-text-secondary)]" aria-hidden="true" />
          <span className="text-xs font-medium text-[var(--app-text-secondary)]">
            Configurações
          </span>
          <ChevronRight className="h-4 w-4 text-[var(--app-text-secondary)]" aria-hidden="true" />
        </div>
      </button>
    );
  }

  const drawerClasses =
    side === 'left'
      ? 'fixed inset-y-0 left-0 z-50 w-full max-w-xl  md:rounded-r-md'
      : 'fixed inset-y-0 right-0 z-50 w-full max-w-xl  md:rounded-l-md';

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        className="fixed inset-0 z-50 bg-[var(--app-bg-overlay)] backdrop-blur-sm transition-opacity border-none p-0 cursor-pointer"
        onClick={onClose}
        aria-label="Fechar configurações"
      />

      {/* Drawer */}
      <div className={drawerClasses} style={{ backgroundColor: KLOEL_THEME.bgCard }}>
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--app-border-primary)] px-6 py-4">
            <h2
              className="text-xl font-semibold text-[var(--app-text-primary)]"
              style={{ fontFamily: "'Sora', sans-serif" }}
            >
              Configuracoes
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-bg-hover)] hover:text-[var(--app-text-primary)]"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {/* Tabs Navigation */}
          <div
            className="border-b border-[var(--app-border-primary)] px-4 py-3"
            style={{ backgroundColor: KLOEL_THEME.bgPrimary }}
          >
            <nav className="flex flex-col gap-1">
              {WORKSPACE_SETTINGS_SECTIONS.map((tab) => {
                const Icon = tabIcons[tab.iconKey];
                const isActive = activeTab === tab.key;
                return (
                  <button
                    type="button"
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition-all ${
                      isActive
                        ? 'font-semibold text-[var(--app-accent)]'
                        : 'border-transparent text-[var(--app-text-secondary)] hover:bg-[var(--app-bg-hover)] hover:text-[var(--app-text-primary)]'
                    }`}
                    style={{ backgroundColor: 'transparent' }}
                  >
                    <Icon
                      className={`h-5 w-5 ${
                        isActive ? 'text-[var(--app-accent)]' : 'text-[var(--app-text-secondary)]'
                      }`}
                    />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Content */}
          <div
            className="flex-1 overflow-y-auto px-6 py-6"
            style={{ backgroundColor: KLOEL_THEME.bgPrimary }}
          >
            {activeTab !== 'activity' && (
              <div className="mb-6">
                <SystemAlertsCard />
              </div>
            )}

            {activeTab === 'account' && <AccountSettingsSection />}
            {activeTab === 'billing' && (
              <BillingSettingsSection
                subscriptionStatus={subscriptionStatus}
                trialDaysLeft={trialDaysLeft}
                creditsBalance={creditsBalance}
                hasCard={hasCard}
                onActivateTrial={onActivateTrial}
                scrollToCreditCard={scrollToCreditCard}
              />
            )}
            {activeTab === 'brain' && <BrainSettingsSection />}
            {activeTab === 'crm' && <CrmSettingsSection />}
            {activeTab === 'analytics' && <AnalyticsSettingsSection />}
            {activeTab === 'activity' && <ActivitySection activities={activityFeed} />}
          </div>
        </div>
      </div>
    </>
  );
}
