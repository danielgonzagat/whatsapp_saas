'use client';

import type { AgentActivity } from './AgentConsole';
import { AuthModal } from './auth/auth-modal';
import { OnboardingModal } from './onboarding-modal';
import { PlanActivationSuccessModal } from './plan-activation-success-modal';
import { SettingsDrawer } from './settings/settings-drawer';
import { TrialPaywallModal } from './trial-paywall-modal';

export interface ChatContainerModalsProps {
  /* Auth */
  authModalOpen: boolean;
  authModalMode: 'login' | 'signup';
  authPrefillEmail?: string;
  onCloseAuthModal: () => void;

  /* Settings */
  showSettings: boolean;
  settingsInitialTab: 'account' | 'billing' | 'brain' | 'activity';
  scrollToCreditCard: boolean;
  subscriptionStatus: 'none' | 'trial' | 'active' | 'expired' | 'suspended';
  trialDaysLeft: number;
  creditsBalance: number;
  hasCard: boolean;
  agentActivities: AgentActivity[];
  onCloseSettings: () => void;
  onOpenSettings: () => void;
  onActivateTrial: () => Promise<void>;

  /* Paywall */
  showPaywallModal: boolean;
  paywallVariant: 'activate' | 'renew';
  onClosePaywallModal: () => void;
  onPaywallActivate: () => void;

  /* Onboarding */
  showOnboarding: boolean;
  onOnboardingComplete: () => void;
  onOnboardingClose: () => void;
  onTeachProducts: () => void;
  onConnectWhatsApp: () => void;

  /* Activation success */
  showActivationSuccess: boolean;
  onCloseActivationSuccess: () => void;
  onTestKloel: () => void;
  onOpenBrainSettings: () => void;
  onChatWithKloel: () => void;
}

export function ChatContainerModals({
  authModalOpen,
  authModalMode,
  authPrefillEmail,
  onCloseAuthModal,
  showSettings,
  settingsInitialTab,
  scrollToCreditCard,
  subscriptionStatus,
  trialDaysLeft,
  creditsBalance,
  hasCard,
  agentActivities,
  onCloseSettings,
  onOpenSettings,
  onActivateTrial,
  showPaywallModal,
  paywallVariant,
  onClosePaywallModal,
  onPaywallActivate,
  showOnboarding,
  onOnboardingComplete,
  onOnboardingClose,
  onTeachProducts,
  onConnectWhatsApp,
  showActivationSuccess,
  onCloseActivationSuccess,
  onTestKloel,
  onOpenBrainSettings,
  onChatWithKloel,
}: ChatContainerModalsProps) {
  return (
    <>
      <AuthModal
        isOpen={authModalOpen}
        onClose={onCloseAuthModal}
        initialMode={authModalMode}
        initialEmail={authPrefillEmail || undefined}
      />

      <SettingsDrawer
        isOpen={showSettings}
        onClose={onCloseSettings}
        onOpen={onOpenSettings}
        subscriptionStatus={subscriptionStatus}
        trialDaysLeft={trialDaysLeft}
        creditsBalance={creditsBalance}
        hasCard={hasCard}
        onActivateTrial={onActivateTrial}
        initialTab={settingsInitialTab}
        scrollToCreditCard={scrollToCreditCard}
        side="left"
        showHandle={false}
        activityFeed={agentActivities}
      />

      <TrialPaywallModal
        isOpen={showPaywallModal}
        onClose={onClosePaywallModal}
        onActivateTrial={onPaywallActivate}
        variant={paywallVariant}
      />

      <OnboardingModal
        isOpen={showOnboarding}
        onComplete={onOnboardingComplete}
        onClose={onOnboardingClose}
        onTeachProducts={onTeachProducts}
        onConnectWhatsApp={onConnectWhatsApp}
      />

      <PlanActivationSuccessModal
        isOpen={showActivationSuccess}
        onClose={onCloseActivationSuccess}
        onTestKloel={onTestKloel}
        onOpenSettings={onOpenBrainSettings}
        onChatWithKloel={onChatWithKloel}
      />
    </>
  );
}
