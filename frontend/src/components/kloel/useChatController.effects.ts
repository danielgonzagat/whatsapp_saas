'use client';

import { tokenStorage } from '@/lib/api';
import { AUTH_ERROR_MESSAGES } from './chat-container.data';
import { connectAgentStream } from './chat-container.agent-stream';
import { currentTraceDayKey } from './chat-container.event-handler';
import type { Message } from './chat-message.types';
import type { AgentCursorTarget, AgentStreamEvent, AgentTraceEntry } from './chat-container.types';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { ReadonlyURLSearchParams } from 'next/navigation';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useEffect } from 'react';

const SLOW_HINT_DELAY_MS = 30_000;

interface ChatControllerEffectsParams {
  activeConv: string | null;
  activeConversationId: string | null;
  agentStreamEnabled: boolean;
  appliedAuthDeepLinkRef: MutableRefObject<boolean>;
  appliedInitialDeepLinkRef: MutableRefObject<boolean>;
  appliedWhatsAppPanelDeepLinkRef: MutableRefObject<boolean>;
  authPrefillEmail: string;
  authedChatStreamRef: MutableRefObject<{ abort: () => void } | null>;
  handleAgentEvent: (event: AgentStreamEvent) => void;
  initialOpenSettings: boolean;
  initialScrollToCreditCard: boolean;
  initialSettingsTab: 'account' | 'billing' | 'brain' | 'activity';
  isAuthenticated: boolean;
  isCancelableReply: boolean;
  isTyping: boolean;
  loadConversation: (conversationId: string) => Promise<void>;
  loadedConversationIdRef: MutableRefObject<string | null>;
  messagesEndRef: MutableRefObject<HTMLDivElement | null>;
  messagesLength: number;
  openAuthModal: (mode: 'login' | 'signup') => void;
  pathname: string;
  refreshHasCard: () => Promise<void>;
  requestedConversationId: string | null;
  router: AppRouterInstance;
  searchParams: ReadonlyURLSearchParams;
  setActiveConversation: (conversationId: string | null) => void;
  setActiveConversationId: Dispatch<SetStateAction<string | null>>;
  setAgentStreamEnabled: Dispatch<SetStateAction<boolean>>;
  setAgentThoughts: Dispatch<SetStateAction<string[]>>;
  setAgentTraceEntries: Dispatch<SetStateAction<AgentTraceEntry[]>>;
  setCurrentThought: Dispatch<SetStateAction<string>>;
  setCursorTarget: Dispatch<SetStateAction<AgentCursorTarget | null>>;
  setInputValue: Dispatch<SetStateAction<string>>;
  setIsAgentStreamConnected: Dispatch<SetStateAction<boolean>>;
  setIsTyping: Dispatch<SetStateAction<boolean>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setScrollToCreditCard: Dispatch<SetStateAction<boolean>>;
  setSettingsInitialTab: Dispatch<SetStateAction<'account' | 'billing' | 'brain' | 'activity'>>;
  setShowAgentDesktop: Dispatch<SetStateAction<boolean>>;
  setShowSettings: Dispatch<SetStateAction<boolean>>;
  setShowSlowHint: Dispatch<SetStateAction<boolean>>;
  setGuestSessionId: Dispatch<SetStateAction<string | null>>;
  shouldOpenWhatsAppPanel: boolean;
  traceDayRef: MutableRefObject<string>;
  agentTraceEntriesRef: MutableRefObject<AgentTraceEntry[]>;
  thoughtTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

export function useChatControllerEffects({
  activeConv,
  activeConversationId,
  agentStreamEnabled,
  appliedAuthDeepLinkRef,
  appliedInitialDeepLinkRef,
  appliedWhatsAppPanelDeepLinkRef,
  authedChatStreamRef,
  handleAgentEvent,
  initialOpenSettings,
  initialScrollToCreditCard,
  initialSettingsTab,
  isAuthenticated,
  isCancelableReply,
  isTyping,
  loadConversation,
  loadedConversationIdRef,
  messagesEndRef,
  messagesLength,
  openAuthModal,
  pathname,
  refreshHasCard,
  requestedConversationId,
  router,
  searchParams,
  setActiveConversation,
  setActiveConversationId,
  setAgentStreamEnabled,
  setAgentThoughts,
  setAgentTraceEntries,
  setCurrentThought,
  setCursorTarget,
  setInputValue,
  setIsAgentStreamConnected,
  setIsTyping,
  setMessages,
  setScrollToCreditCard,
  setSettingsInitialTab,
  setShowAgentDesktop,
  setShowSettings,
  setShowSlowHint,
  setGuestSessionId,
  shouldOpenWhatsAppPanel,
  traceDayRef,
  agentTraceEntriesRef,
  thoughtTimerRef,
}: ChatControllerEffectsParams) {
  useEffect(() => {
    const authError = searchParams.get('authError');
    if (!authError) {
      return;
    }
    const message = AUTH_ERROR_MESSAGES[authError];
    if (message) {
      setMessages((prev) => {
        const id = `auth_error_${authError}`;
        if (prev.some((m) => m.id === id)) {
          return prev;
        }
        return [...prev, { id, role: 'assistant', content: message }];
      });
    }
    openAuthModal('login');
  }, [searchParams, openAuthModal, setMessages]);

  useEffect(() => {
    if (appliedAuthDeepLinkRef.current) {
      return;
    }
    const authMode = searchParams.get('authMode');
    if (authMode !== 'login' && authMode !== 'signup') {
      return;
    }
    appliedAuthDeepLinkRef.current = true;
    openAuthModal(authMode);
  }, [searchParams, openAuthModal, appliedAuthDeepLinkRef]);

  useEffect(() => {
    if (!shouldOpenWhatsAppPanel || appliedWhatsAppPanelDeepLinkRef.current) {
      return;
    }
    appliedWhatsAppPanelDeepLinkRef.current = true;
    setShowAgentDesktop(true);
  }, [shouldOpenWhatsAppPanel, appliedWhatsAppPanelDeepLinkRef, setShowAgentDesktop]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    const nextParams = new URLSearchParams(searchParams.toString());
    const authKeys = ['authMode', 'authError', 'email', 'authEmail'];
    const hasAuthQuery = authKeys.some((key) => nextParams.has(key));
    if (!hasAuthQuery) {
      return;
    }
    authKeys.forEach((key) => nextParams.delete(key));
    const nextQuery = nextParams.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [isAuthenticated, pathname, router, searchParams]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    const targetConversationId =
      requestedConversationId || activeConversationId || activeConv || null;
    if (!targetConversationId) {
      return;
    }
    if (loadedConversationIdRef.current === targetConversationId && messagesLength > 0) {
      return;
    }
    void loadConversation(targetConversationId);
  }, [
    activeConv,
    activeConversationId,
    isAuthenticated,
    loadConversation,
    messagesLength,
    requestedConversationId,
    loadedConversationIdRef,
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
      if (!conversationId) {
        return;
      }
      loadedConversationIdRef.current = null;
      setActiveConversationId(String(conversationId));
    };
    window.addEventListener('kloel:new-chat', handleNewChat);
    window.addEventListener('kloel:load-chat', handleLoadChat);
    return () => {
      window.removeEventListener('kloel:new-chat', handleNewChat);
      window.removeEventListener('kloel:load-chat', handleLoadChat);
    };
  }, [
    authedChatStreamRef,
    loadedConversationIdRef,
    setActiveConversation,
    setActiveConversationId,
    setInputValue,
    setIsTyping,
    setMessages,
  ]);

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
  }, [setGuestSessionId]);

  useEffect(() => {
    if (isAuthenticated) {
      setAgentStreamEnabled(true);
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    if (tokenStorage.getToken() && tokenStorage.getWorkspaceId()) {
      setAgentStreamEnabled(true);
    }
  }, [isAuthenticated, setAgentStreamEnabled]);

  useEffect(() => {
    if (isAuthenticated) {
      void refreshHasCard();
    }
  }, [isAuthenticated, refreshHasCard]);

  useEffect(() => {
    if (!agentStreamEnabled) {
      return;
    }
    const token = tokenStorage.getToken();
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!token || !workspaceId) {
      return;
    }
    return connectAgentStream({
      onEvent: handleAgentEvent,
      onConnected: () => setIsAgentStreamConnected(true),
      onDisconnected: () => setIsAgentStreamConnected(false),
    });
  }, [agentStreamEnabled, handleAgentEvent, setIsAgentStreamConnected]);

  useEffect(
    () => () => {
      const timer = thoughtTimerRef.current;
      if (timer) {
        clearTimeout(timer);
      }
    },
    [thoughtTimerRef],
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const nextDayKey = currentTraceDayKey();
      if (traceDayRef.current === nextDayKey) {
        return;
      }
      traceDayRef.current = nextDayKey;
      agentTraceEntriesRef.current = [];
      setAgentTraceEntries([]);
      setAgentThoughts([]);
      setCurrentThought('');
      setCursorTarget(null);
    }, 60_000);
    return () => clearInterval(interval);
  }, [
    agentTraceEntriesRef,
    setAgentThoughts,
    setAgentTraceEntries,
    setCurrentThought,
    setCursorTarget,
    traceDayRef,
  ]);

  useEffect(
    () => () => {
      authedChatStreamRef.current?.abort();
      authedChatStreamRef.current = null;
    },
    [authedChatStreamRef],
  );

  useEffect(() => {
    if (appliedInitialDeepLinkRef.current) {
      return;
    }
    if (!initialOpenSettings) {
      appliedInitialDeepLinkRef.current = true;
      return;
    }
    if (!isAuthenticated) {
      return;
    }
    setSettingsInitialTab(initialSettingsTab);
    setScrollToCreditCard(initialScrollToCreditCard);
    setShowSettings(true);
    appliedInitialDeepLinkRef.current = true;
  }, [
    appliedInitialDeepLinkRef,
    initialOpenSettings,
    initialScrollToCreditCard,
    initialSettingsTab,
    isAuthenticated,
    setScrollToCreditCard,
    setSettingsInitialTab,
    setShowSettings,
  ]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesEndRef, messagesLength]);

  useEffect(() => {
    if (!isTyping || !isCancelableReply) {
      setShowSlowHint(false);
      return;
    }
    const timeoutId = window.setTimeout(() => setShowSlowHint(true), SLOW_HINT_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [isCancelableReply, isTyping, setShowSlowHint]);
}
