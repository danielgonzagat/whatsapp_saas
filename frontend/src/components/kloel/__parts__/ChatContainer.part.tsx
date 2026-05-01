export function ChatContainer({
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
    justSignedUp: _justSignedUp,
    hasCompletedOnboarding: _hasCompletedOnboarding,
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
  const [paywallVariant, _setPaywallVariant] = useState<'activate' | 'renew'>('activate');
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
      if (!conversationId) return;
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

  /* ── Effects ── */
  useEffect(() => {
    const authError = searchParams.get('authError');
    if (!authError) return;
    const message = AUTH_ERROR_MESSAGES[authError];
    if (message) {
      setMessages((prev) => {
        const id = `auth_error_${authError}`;
        if (prev.some((m) => m.id === id)) return prev;
        return [...prev, { id, role: 'assistant', content: message }];
      });
    }
    openAuthModal('login');
  }, [searchParams, openAuthModal]);

  useEffect(() => {
    if (appliedAuthDeepLink.current) return;
    const authMode = searchParams.get('authMode');
    if (authMode !== 'login' && authMode !== 'signup') return;
    appliedAuthDeepLink.current = true;
    openAuthModal(authMode);
  }, [searchParams, openAuthModal]);

  useEffect(() => {
    if (!shouldOpenWhatsAppPanel || appliedWhatsAppPanelDeepLink.current) return;
    appliedWhatsAppPanelDeepLink.current = true;
    setShowAgentDesktop(true);
  }, [shouldOpenWhatsAppPanel]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const nextParams = new URLSearchParams(searchParams.toString());
    const authKeys = ['authMode', 'authError', 'email', 'authEmail'];
    const hasAuthQuery = authKeys.some((key) => nextParams.has(key));
    if (!hasAuthQuery) return;
    authKeys.forEach((key) => nextParams.delete(key));
    const nextQuery = nextParams.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [isAuthenticated, pathname, router, searchParams]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const targetConversationId =
      requestedConversationId || activeConversationId || activeConv || null;
    if (!targetConversationId) return;
    if (loadedConversationIdRef.current === targetConversationId && messages.length > 0) return;
    void loadConversation(targetConversationId);
  }, [
    activeConv,
    activeConversationId,
    isAuthenticated,
    loadConversation,
    messages.length,
    requestedConversationId,
  ]);

  useEffect(() => {
    const handleNewChat = () => {
      authedChatStreamRef.current?.abort();
      authedChatStreamRef.current = null;
      loadedConversationIdRef.current = null;
      setActiveConversationId(null);
      setActiveConversation(null);
      setMessages([]);
      setInputValue('');
      setIsTyping(false);
    };
    const handleLoadChat = (event: Event) => {
      const conversationId = (event as CustomEvent).detail?.conversationId;
      if (!conversationId) return;
      loadedConversationIdRef.current = null;
      setActiveConversationId(String(conversationId));
    };
    window.addEventListener('kloel:new-chat', handleNewChat);
    window.addEventListener('kloel:load-chat', handleLoadChat);
    return () => {
      window.removeEventListener('kloel:new-chat', handleNewChat);
      window.removeEventListener('kloel:load-chat', handleLoadChat);
    };
  }, [setActiveConversation]);

  useEffect(() => {
    const slot = 'kloel_guest_session';
    const stored = localStorage.getItem(slot);
    if (stored) {
      setGuestSessionId(stored);
      return;
    }
    const newSession = `guest_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem(slot, newSession);
    setGuestSessionId(newSession);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      setAgentStreamEnabled(true);
      return;
    }
    if (typeof window === 'undefined') return;
    if (tokenStorage.getToken() && tokenStorage.getWorkspaceId()) setAgentStreamEnabled(true);
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) refreshHasCard();
  }, [isAuthenticated, refreshHasCard]);
  useEffect(() => {
    if (showSettings && isAuthenticated) refreshHasCard();
  }, [showSettings, isAuthenticated, refreshHasCard]);

  const appendAssistantMessage = useCallback((content: string, meta?: Record<string, unknown>) => {
    const normalized = String(content || '').trim();
    if (!normalized) return;
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

  useEffect(() => {
    if (!agentStreamEnabled) return;
    const token = tokenStorage.getToken();
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!token || !workspaceId) return;
    const cleanup = connectAgentStream({
      onEvent: handleAgentEvent,
      onConnected: () => setIsAgentStreamConnected(true),
      onDisconnected: () => setIsAgentStreamConnected(false),
    });
    return cleanup;
  }, [agentStreamEnabled, handleAgentEvent]);

  useEffect(() => {
    return () => {
      if (thoughtTimerRef.current) clearTimeout(thoughtTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const nextDayKey = currentTraceDayKey();
      if (traceDayRef.current === nextDayKey) return;
      traceDayRef.current = nextDayKey;
      agentTraceEntriesRef.current = [];
      setAgentTraceEntries([]);
      setAgentThoughts([]);
      setCurrentThought('');
      setCursorTarget(null);
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      authedChatStreamRef.current?.abort();
      authedChatStreamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (appliedInitialDeepLink.current) return;
    if (!initialOpenSettings) {
      appliedInitialDeepLink.current = true;
      return;
    }
    if (!isAuthenticated) return;
    setSettingsInitialTab(initialSettingsTab);
    setScrollToCreditCard(initialScrollToCreditCard);
    setShowSettings(true);
    appliedInitialDeepLink.current = true;
  }, [initialOpenSettings, initialSettingsTab, initialScrollToCreditCard, isAuthenticated]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (!isTyping || !isCancelableReply) {
      setShowSlowHint(false);
      return;
    }
    const timeoutId = window.setTimeout(() => setShowSlowHint(true), SLOW_HINT_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [isCancelableReply, isTyping]);

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
    if (!content.trim()) return;
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

  const handleWhatsAppConnect = () => setShowAgentDesktop(true);

  const handlePaywallActivate = () => {
    setShowPaywallModal(false);
    setSettingsInitialTab('billing');
    setScrollToCreditCard(!hasCard);
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

  const handleAgentQuickAction = async (actionId: string, label: string) => {
    setPendingAgentAction(actionId);
    setMessages((prev) => [
      ...prev.map((m) =>
        Array.isArray(m.meta?.quickActions) && m.meta.quickActions.length > 0
          ? { ...m, meta: { ...m.meta, quickActions: [] } }
          : m,
      ),
      {
        id: `owner_action_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
        role: 'user',
        content: label,
      },
    ]);
    setCurrentThought('Preparando a execução do backlog');
    setAgentThoughts((prev) => [...prev.slice(-4), 'Preparando a execução do backlog']);
    setIsAgentThinking(true);
    try {
      const response = await whatsappApi.startBacklog(actionId);
      if (response.error) throw new Error(response.error);
    } catch (error: unknown) {
      const errMsg = extractErrorMessage(error, 'erro desconhecido');
      appendAssistantMessage(`Não consegui iniciar essa ação. Motivo: ${errMsg}.`);
      setIsAgentThinking(false);
    } finally {
      setPendingAgentAction(null);
    }
  };

  const handleSeedProductKnowledge = () => setInputValue(SEED_PRODUCT_KNOWLEDGE_PROMPT);

  const handleActivationTestKloel = () => {
    if (!isAuthenticated) {
      openAuthModal('login');
      return;
    }
    setInputValue(SEED_PRODUCT_KNOWLEDGE_PROMPT);
    setShowAgentDesktop(true);
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

  const handleOpenSettings = () => {
    if (!isAuthenticated) {
      openAuthModal('login');
      return;
    }
    setSettingsInitialTab('account');
    setScrollToCreditCard(false);
    setShowSettings(true);
  };

  const handleOpenBrainSettings = () => {
    setSettingsInitialTab('brain');
    setScrollToCreditCard(false);
    setShowSettings(true);
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    completeOnboarding();
  };
  const handleOnboardingClose = () => {
    setShowOnboarding(false);
    dismissOnboardingForSession();
  };

  const latestTraceLine =
    currentThought || agentTraceEntries[agentTraceEntries.length - 1]?.message || '';
  const contentMaxWidth = showAgentDesktop ? 865 : 768;

  return (
    <ChatLayout
      isWhatsAppConnected={isWhatsAppConnected}
      subscriptionStatus={subscriptionStatus}
      trialDaysLeft={trialDaysLeft}
      onOpenSettings={handleOpenSettings}
      messages={messages}
      showAgentDesktop={showAgentDesktop}
      latestTraceLine={latestTraceLine}
      isAgentThinking={isAgentThinking}
      agentTraceEntries={agentTraceEntries}
      cursorTarget={cursorTarget}
      thoughtTraceExpanded={thoughtTraceExpanded}
      isTyping={isTyping}
      isCancelableReply={isCancelableReply}
      showSlowHint={showSlowHint}
      pendingAgentAction={pendingAgentAction}
      activeConversationId={activeConversationId}
      isAuthenticated={isAuthenticated}
      userName={userName}
      contentMaxWidth={contentMaxWidth}
      messagesEndRef={messagesEndRef}
      inputValue={inputValue}
      onInputChange={setInputValue}
      onSend={handleSendMessage}
      onThoughtTraceToggle={() => setThoughtTraceExpanded((prev) => !prev)}
      onAgentDesktopClose={() => setShowAgentDesktop(false)}
      onAgentConnectionChange={(connected) => setIsWhatsAppConnected(connected)}
      onAgentStreamEnable={() => setAgentStreamEnabled(true)}
      onQuickAction={handleAgentQuickAction}
      onCancelProcessing={cancelActiveReply}
      onMessageEdit={activeConversationId ? handleMessageEdit : undefined}
      onMessageRetry={handleMessageRetry}
      onAssistantFeedback={activeConversationId ? handleAssistantFeedback : undefined}
      onAssistantRegenerate={activeConversationId ? handleAssistantRegenerate : undefined}
      onWhatsAppConnect={handleWhatsAppConnect}
      onWhatsAppConnectionChange={(connected) => setIsWhatsAppConnected(connected)}
      onAgentStreamEnabled={() => setAgentStreamEnabled(true)}
      agentActivities={agentActivities}
      modals={{
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
        onPaywallActivate: handlePaywallActivate,
        showOnboarding,
        onOnboardingComplete: handleOnboardingComplete,
        onOnboardingClose: handleOnboardingClose,
        onTeachProducts: handleSeedProductKnowledge,
        onConnectWhatsApp: handleWhatsAppConnect,
        showActivationSuccess,
        onCloseActivationSuccess: () => setShowActivationSuccess(false),
        onTestKloel: handleActivationTestKloel,
        onOpenBrainSettings: handleOpenBrainSettings,
        onChatWithKloel: handleActivationChatWithKloel,
      }}
    />
  );
}


