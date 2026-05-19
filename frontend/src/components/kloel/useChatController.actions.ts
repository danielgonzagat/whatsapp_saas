'use client';

import { billingApi, whatsappApi } from '@/lib/api';
import { SEED_PRODUCT_KNOWLEDGE_PROMPT } from './chat-container.data';
import { extractErrorMessage } from './chat-container.message-sender';
import type { ChatContainerModalsProps } from './chat-container.modals';
import type { Message } from './chat-message.types';
import type { AgentActivity } from './AgentConsole';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

type SettingsTab = 'account' | 'billing' | 'brain' | 'activity';

interface ChatControllerActionsParams {
  agentActivities: AgentActivity[];
  appendAssistantMessage: (content: string, meta?: Record<string, unknown>) => void;
  authModalMode: 'login' | 'signup';
  authModalOpen: boolean;
  authPrefillEmail: string;
  authedChatStreamRef: MutableRefObject<{ abort: () => void } | null>;
  closeAuthModal: () => void;
  completeOnboarding: () => void;
  creditsBalance: number;
  dismissOnboardingForSession: () => void;
  hasCard: boolean;
  isAuthenticated: boolean;
  loadedConversationIdRef: MutableRefObject<string | null>;
  openAuthModal: (mode: 'login' | 'signup') => void;
  paywallVariant: 'activate' | 'renew';
  refreshSubscription: () => Promise<void>;
  scrollToCreditCard: boolean;
  setActiveConversation: (conversationId: string | null) => void;
  setActiveConversationId: Dispatch<SetStateAction<string | null>>;
  setAgentThoughts: Dispatch<SetStateAction<string[]>>;
  setCurrentThought: Dispatch<SetStateAction<string>>;
  setHasCard: Dispatch<SetStateAction<boolean>>;
  setInputValue: Dispatch<SetStateAction<string>>;
  setIsAgentThinking: Dispatch<SetStateAction<boolean>>;
  setIsTyping: Dispatch<SetStateAction<boolean>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setPendingAgentAction: Dispatch<SetStateAction<string | null>>;
  setScrollToCreditCard: Dispatch<SetStateAction<boolean>>;
  setSettingsInitialTab: Dispatch<SetStateAction<SettingsTab>>;
  setShowActivationSuccess: Dispatch<SetStateAction<boolean>>;
  setShowAgentDesktop: Dispatch<SetStateAction<boolean>>;
  setShowOnboarding: Dispatch<SetStateAction<boolean>>;
  setShowPaywallModal: Dispatch<SetStateAction<boolean>>;
  setShowSettings: Dispatch<SetStateAction<boolean>>;
  settingsInitialTab: SettingsTab;
  showActivationSuccess: boolean;
  showOnboarding: boolean;
  showPaywallModal: boolean;
  showSettings: boolean;
  subscriptionStatus: 'none' | 'trial' | 'active' | 'expired' | 'suspended';
  trialDaysLeft: number;
}

export function useChatControllerActions(params: ChatControllerActionsParams) {
  const {
    agentActivities,
    appendAssistantMessage,
    authModalMode,
    authModalOpen,
    authPrefillEmail,
    authedChatStreamRef,
    closeAuthModal,
    completeOnboarding,
    creditsBalance,
    dismissOnboardingForSession,
    hasCard,
    isAuthenticated,
    loadedConversationIdRef,
    openAuthModal,
    paywallVariant,
    refreshSubscription,
    scrollToCreditCard,
    setActiveConversation,
    setActiveConversationId,
    setAgentThoughts,
    setCurrentThought,
    setHasCard,
    setInputValue,
    setIsAgentThinking,
    setIsTyping,
    setMessages,
    setPendingAgentAction,
    setScrollToCreditCard,
    setSettingsInitialTab,
    setShowActivationSuccess,
    setShowAgentDesktop,
    setShowOnboarding,
    setShowPaywallModal,
    setShowSettings,
    settingsInitialTab,
    showActivationSuccess,
    showOnboarding,
    showPaywallModal,
    showSettings,
    subscriptionStatus,
    trialDaysLeft,
  } = params;

  const handleWhatsAppConnect = () => setShowAgentDesktop(true);
  const handleAgentQuickAction = async (actionId: string, label: string) => {
    setPendingAgentAction(actionId);
    setMessages((prev) => [
      ...prev.map((m) =>
        Array.isArray(m.meta?.quickActions) && m.meta.quickActions.length > 0
          ? { ...m, meta: { ...m.meta, quickActions: [] } }
          : m,
      ),
      { id: `owner_action_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`, role: 'user', content: label },
    ]);
    setCurrentThought('Preparando a execução do backlog');
    setAgentThoughts((prev) => [...prev.slice(-4), 'Preparando a execução do backlog']);
    setIsAgentThinking(true);
    try {
      const response = await whatsappApi.startBacklog(actionId);
      if (response.error) {throw new Error(response.error);}
    } catch (error: unknown) {
      appendAssistantMessage(
        `Não consegui iniciar essa ação. Motivo: ${extractErrorMessage(error, 'erro desconhecido')}.`,
      );
      setIsAgentThinking(false);
    } finally {
      setPendingAgentAction(null);
    }
  };
  const handleOpenSettings = () => {
    if (!isAuthenticated) {
      openAuthModal('login');
      return;
    }
    setSettingsInitialTab('account');
    setScrollToCreditCard(false);
    setShowSettings(true);
  };
  const handleActivateTrial = async () => {
    try {
      await billingApi.activateTrial();
      await refreshSubscription();
      setHasCard(true);
      setShowActivationSuccess(true);
    } catch (err) {
      console.error('Failed to activate trial:', err);
    }
  };
  const handleActivationChatWithKloel = () => {
    authedChatStreamRef.current?.abort();
    authedChatStreamRef.current = null;
    loadedConversationIdRef.current = null;
    setActiveConversationId(null);
    setActiveConversation(null);
    setMessages([]);
    setInputValue('');
    setIsTyping(false);
    setShowAgentDesktop(false);
  };
  const handleActivationTestKloel = () => {
    if (!isAuthenticated) {
      openAuthModal('login');
      return;
    }
    setInputValue(SEED_PRODUCT_KNOWLEDGE_PROMPT);
    setShowAgentDesktop(true);
  };
  const modals: ChatContainerModalsProps = {
    authModalOpen,
    authModalMode,
    authPrefillEmail,
    onCloseAuthModal: closeAuthModal,
    showSettings,
    settingsInitialTab,
    scrollToCreditCard,
    subscriptionStatus,
    trialDaysLeft,
    creditsBalance,
    hasCard,
    agentActivities,
    onCloseSettings: () => setShowSettings(false),
    onOpenSettings: () => setShowSettings(true),
    onActivateTrial: handleActivateTrial,
    showPaywallModal,
    paywallVariant,
    onClosePaywallModal: () => setShowPaywallModal(false),
    onPaywallActivate: () => {
      setShowPaywallModal(false);
      setSettingsInitialTab('billing');
      setScrollToCreditCard(!hasCard);
      setShowSettings(true);
    },
    showOnboarding,
    onOnboardingComplete: () => {
      setShowOnboarding(false);
      completeOnboarding();
    },
    onOnboardingClose: () => {
      setShowOnboarding(false);
      dismissOnboardingForSession();
    },
    onTeachProducts: () => setInputValue(SEED_PRODUCT_KNOWLEDGE_PROMPT),
    onConnectWhatsApp: handleWhatsAppConnect,
    showActivationSuccess,
    onCloseActivationSuccess: () => setShowActivationSuccess(false),
    onTestKloel: handleActivationTestKloel,
    onOpenBrainSettings: () => {
      setSettingsInitialTab('brain');
      setScrollToCreditCard(false);
      setShowSettings(true);
    },
    onChatWithKloel: handleActivationChatWithKloel,
  };
  return { handleAgentQuickAction, handleOpenSettings, handleWhatsAppConnect, modals };
}
