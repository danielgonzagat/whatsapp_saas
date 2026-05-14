'use client';

import { useConversationHistory } from '@/hooks/useConversationHistory';
import { useToast } from '@/components/kloel/ToastProvider';
import { billingApi, tokenStorage } from '@/lib/api';
import { loadKloelThreadMessages } from '@/lib/kloel-conversations';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import type { AgentActivity, AgentStats } from './AgentConsole';
import { useAuth } from './auth/auth-provider';
import { applyAgentStatsEvent, mapThreadMessageToChatMessage, normalizeMessageMeta, createClientRequestId } from './chat-container.helpers';
import { EMPTY_AGENT_STATS } from './chat-container.data';
import { processAgentEvent, currentTraceDayKey } from './chat-container.event-handler';
import { runGuestChat, runAuthedChat, extractErrorMessage } from './chat-container.message-sender';
import { useMessageActions } from './chat-container.message-actions';
import { useWhatsApp } from './chat-container.whatsapp-hook';
import { useChatControllerEffects } from './useChatController.effects';
import { useChatControllerActions } from './useChatController.actions';
import type { Message } from './chat-message.types';
import type {
  AgentCursorTarget,
  AgentStreamEvent,
  AgentTraceEntry,
  ChatContainerProps,
} from './chat-container.types';
export function useChatController({
  initialOpenSettings = false,
  initialSettingsTab = 'account',
  initialScrollToCreditCard = false,
}: ChatContainerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedConversationId = searchParams.get('conversationId');
  const shouldOpenWhatsAppPanel =
    searchParams.get('panel') === 'whatsapp' || searchParams.get('autoConnect') === '1';
  const authPrefillEmail = searchParams.get('email') || searchParams.get('authEmail') || '';
  const {
    isAuthenticated,
    completeOnboarding,
    dismissOnboardingForSession,
    authModalOpen,
    authModalMode,
    openAuthModal,
    closeAuthModal,
    subscription,
    refreshSubscription,
    userName,
  } = useAuth();
  const { showToast } = useToast();
  const {
    activeConv,
    conversations,
    setActiveConversation,
    upsertConversation,
    refreshConversations,
  } = useConversationHistory();

  const appliedAuthDeepLink = useRef(false);
  const appliedWhatsAppPanelDeepLink = useRef(false);
  const loadedConversationIdRef = useRef<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [showAgentDesktop, setShowAgentDesktop] = useState(false);
  const [agentStreamEnabled, setAgentStreamEnabled] = useState(false);

  const { isWhatsAppConnected, setIsWhatsAppConnected } = useWhatsApp({
    isAuthenticated,
    onConnected: () => setAgentStreamEnabled(true),
  });

  const [agentActivities, setAgentActivities] = useState<AgentActivity[]>([]);
  const [_agentStats, setAgentStats] = useState<AgentStats>(EMPTY_AGENT_STATS);
  const [_agentThoughts, setAgentThoughts] = useState<string[]>([]);
  const [currentThought, setCurrentThought] = useState('');
  const [agentTraceEntries, setAgentTraceEntries] = useState<AgentTraceEntry[]>([]);
  const [thoughtTraceExpanded, setThoughtTraceExpanded] = useState(false);
  const [isAgentThinking, setIsAgentThinking] = useState(false);
  const [_isAgentStreamConnected, setIsAgentStreamConnected] = useState(false);
  const [cursorTarget, setCursorTarget] = useState<AgentCursorTarget | null>(null);
  const [pendingAgentAction, setPendingAgentAction] = useState<string | null>(null);
  const seenAgentEventsRef = useRef(new Set<string>());
  const agentTraceEntriesRef = useRef<AgentTraceEntry[]>([]);
  const thoughtTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const traceDayRef = useRef(currentTraceDayKey());

  const [isTyping, setIsTyping] = useState(false);
  const [showSlowHint, setShowSlowHint] = useState(false);
  const [isCancelableReply, setIsCancelableReply] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const authedChatStreamRef = useRef<{ abort: () => void } | null>(null);

  const subscriptionStatus: 'none' | 'trial' | 'active' | 'expired' | 'suspended' =
    subscription?.status || 'none';
  const trialDaysLeft = subscription?.trialDaysLeft || 0;
  const creditsBalance = subscription?.creditsBalance || 0;
  const [hasCard, setHasCard] = useState(false);
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [paywallVariant] = useState<'activate' | 'renew'>('activate');
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    'account' | 'billing' | 'brain' | 'activity'
  >(initialSettingsTab);
  const [scrollToCreditCard, setScrollToCreditCard] = useState(initialScrollToCreditCard);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showActivationSuccess, setShowActivationSuccess] = useState(false);
  const [guestSessionId, setGuestSessionId] = useState<string | null>(null);
  const appliedInitialDeepLink = useRef(false);

  const refreshHasCard = useCallback(async () => {
    if (!isAuthenticated) {
      setHasCard(false);
      return;
    }
    try {
      const res = await billingApi.getPaymentMethods();
      const methods = Array.isArray(res.data?.paymentMethods) ? res.data.paymentMethods : [];
      setHasCard(methods.length > 0);
    } catch {
      setHasCard(false);
    }
  }, [isAuthenticated]);

  const loadConversation = useCallback(
    async (conversationId: string) => {
      if (!conversationId) {return;}
      try {
        const payload = await loadKloelThreadMessages(conversationId);
        setMessages(
          payload
            .filter((message) => String(message?.content || '').trim())
            .map((message) =>
              mapThreadMessageToChatMessage({
                id: message.id,
                role: message.role,
                content: message.content,
                metadata: normalizeMessageMeta(message.metadata) || null,
              }),
            ),
        );
        loadedConversationIdRef.current = conversationId;
        setActiveConversationId(conversationId);
        setActiveConversation(conversationId);
      } catch (error) {
        console.error('Failed to load Kloel thread', error);
      }
    },
    [setActiveConversation],
  );

  const appendAssistantMessage = useCallback((content: string, meta?: Record<string, unknown>) => {
    const normalized = String(content || '').trim();
    if (!normalized) {return;}
    setMessages((prev) => [
      ...prev,
      {
        id: `assistant_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
        role: 'assistant',
        content: normalized,
        meta,
      },
    ]);
  }, []);

  const updateAgentStats = useCallback((event: AgentStreamEvent) => {
    setAgentStats((prev) => applyAgentStatsEvent(prev, event));
  }, []);

  const handleAgentEvent = useCallback(
    (event: AgentStreamEvent) => {
      processAgentEvent(event, {
        setIsAgentStreamConnected,
        setAgentTraceEntries,
        setCurrentThought,
        setAgentThoughts,
        setIsAgentThinking,
        setAgentActivities,
        setCursorTarget,
        updateAgentStats,
        agentTraceEntriesRef,
        seenAgentEventsRef,
        traceDayRef,
        thoughtTimerRef,
      });
    },
    [updateAgentStats],
  );

  useChatControllerEffects({
    activeConv, activeConversationId, agentStreamEnabled, appliedAuthDeepLink,
    appliedInitialDeepLink, appliedWhatsAppPanelDeepLink, authPrefillEmail, authedChatStreamRef,
    handleAgentEvent, initialOpenSettings, initialScrollToCreditCard, initialSettingsTab,
    isAuthenticated, isCancelableReply, isTyping, loadConversation, loadedConversationIdRef,
    messagesEndRef,
    messagesLength: messages.length,
    openAuthModal, pathname, refreshHasCard, requestedConversationId, router, searchParams,
    setActiveConversation, setActiveConversationId, setAgentStreamEnabled, setAgentThoughts,
    setAgentTraceEntries, setCurrentThought, setCursorTarget, setInputValue,
    setIsAgentStreamConnected, setIsTyping, setMessages, setScrollToCreditCard,
    setSettingsInitialTab, setShowAgentDesktop, setShowSettings, setShowSlowHint,
    setGuestSessionId, shouldOpenWhatsAppPanel, traceDayRef, agentTraceEntriesRef, thoughtTimerRef,
  });

  const cancelActiveReply = useCallback(() => {
    authedChatStreamRef.current?.abort();
    authedChatStreamRef.current = null;
    setIsCancelableReply(false);
    setShowSlowHint(false);
    setIsTyping(false);
    setMessages((prev) => prev.filter((m) => !(m.role === 'assistant' && m.isStreaming)));
  }, []);

  const handleSendMessageRef = useRef<(content: string) => Promise<void>>(async () => {});

  const handleSendMessage = async (content: string) => {
    if (!content.trim()) {return;}
    const clientRequestId = createClientRequestId();
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: 'user',
        content: content.trim(),
        meta: { clientRequestId },
      },
    ]);
    setInputValue('');
    setIsTyping(true);
    setShowSlowHint(false);
    setIsCancelableReply(false);
    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        isStreaming: true,
        meta: { clientRequestId },
      },
    ]);
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!isAuthenticated || !workspaceId) {
      await runGuestChat({ content, assistantId, guestSessionId, setMessages, setIsTyping });
      return;
    }
    try {
      runAuthedChat({
        content,
        assistantId,
        clientRequestId,
        activeConversationId,
        conversations,
        setMessages,
        setIsTyping,
        setShowSlowHint,
        setIsCancelableReply,
        setActiveConversationId,
        setActiveConversation,
        upsertConversation,
        refreshConversations,
        loadConversation,
        loadedConversationIdRef,
        authedChatStreamRef,
        extractErrorMessage,
      });
    } catch (error: unknown) {
      setIsCancelableReply(false);
      setShowSlowHint(false);
      const errMsg = extractErrorMessage(
        error,
        'Desculpe, ocorreu um erro ao continuar sua conversa.',
      );
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: errMsg, isStreaming: false } : m)),
      );
      setIsTyping(false);
      showToast(errMsg, 'error');
    }
  };
  handleSendMessageRef.current = handleSendMessage;

  const {
    handleMessageRetry,
    handleMessageEdit,
    handleAssistantFeedback,
    handleAssistantRegenerate,
  } = useMessageActions({
    messages,
    activeConversationId,
    setMessages,
    setIsTyping,
    refreshConversations,
    sendMessageRef: handleSendMessageRef,
  });

  const latestTraceLine =
    currentThought || agentTraceEntries[agentTraceEntries.length - 1]?.message || '';
  const contentMaxWidth = showAgentDesktop ? 865 : 768;

  const { handleAgentQuickAction, handleOpenSettings, handleWhatsAppConnect, modals } =
    useChatControllerActions({
      agentActivities, appendAssistantMessage, authModalMode, authModalOpen, authPrefillEmail,
      authedChatStreamRef, closeAuthModal, completeOnboarding, creditsBalance,
      dismissOnboardingForSession, hasCard, isAuthenticated, loadedConversationIdRef,
      openAuthModal, paywallVariant, refreshSubscription, scrollToCreditCard,
      setActiveConversation, setActiveConversationId, setAgentThoughts, setCurrentThought,
      setHasCard, setInputValue, setIsAgentThinking, setIsTyping, setMessages,
      setPendingAgentAction, setScrollToCreditCard, setSettingsInitialTab,
      setShowActivationSuccess, setShowAgentDesktop, setShowOnboarding, setShowPaywallModal,
      setShowSettings, settingsInitialTab, showActivationSuccess, showOnboarding, showPaywallModal,
      showSettings, subscriptionStatus, trialDaysLeft,
    });

  const optionalCallbacks = activeConversationId
    ? {
        onMessageEdit: handleMessageEdit,
        onAssistantFeedback: handleAssistantFeedback,
        onAssistantRegenerate: handleAssistantRegenerate,
      }
    : null;

  return {
    isWhatsAppConnected,
    subscriptionStatus,
    trialDaysLeft,
    onOpenSettings: handleOpenSettings,
    messages,
    showAgentDesktop,
    latestTraceLine,
    isAgentThinking,
    agentTraceEntries,
    cursorTarget,
    thoughtTraceExpanded,
    isTyping,
    isCancelableReply,
    showSlowHint,
    pendingAgentAction,
    activeConversationId,
    isAuthenticated,
    userName,
    contentMaxWidth,
    messagesEndRef,
    inputValue,
    onInputChange: setInputValue,
    onSend: handleSendMessage,
    onThoughtTraceToggle: () => setThoughtTraceExpanded((prev) => !prev),
    onAgentDesktopClose: () => setShowAgentDesktop(false),
    onAgentConnectionChange: (connected: boolean) => setIsWhatsAppConnected(connected),
    onAgentStreamEnable: () => setAgentStreamEnabled(true),
    onQuickAction: handleAgentQuickAction,
    onCancelProcessing: cancelActiveReply,
    onMessageRetry: handleMessageRetry,
    onWhatsAppConnect: handleWhatsAppConnect,
    onWhatsAppConnectionChange: (connected: boolean) => setIsWhatsAppConnected(connected),
    onAgentStreamEnabled: () => setAgentStreamEnabled(true),
    modals,
    agentActivities,
    ...optionalCallbacks,
  };
}
