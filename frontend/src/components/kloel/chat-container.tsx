'use client';

// Legacy shell kept compatible with the published dashboard thread model.

import { useState, useRef, useEffect, useCallback } from 'react';
import { mutate } from 'swr';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { HeaderMinimal } from './header-minimal';
import { InputComposer } from './input-composer';
import { AgentDesktopViewer } from './AgentDesktopViewer';
import { AuthModal } from './auth/auth-modal';
import { MessageBubble } from './message-bubble';
import type { AgentActivity, AgentStats } from './AgentConsole';
import { FooterMinimal } from './footer-minimal';
import { SettingsDrawer } from './settings/settings-drawer';
import { TrialPaywallModal } from './trial-paywall-modal';
import { OnboardingModal } from './onboarding-modal';
import { PlanActivationSuccessModal } from './plan-activation-success-modal';
import { KloelMushroomVisual } from './KloelBrand';
import { useAuth } from './auth/auth-provider';
import {
  authApi,
  billingApi,
  getWhatsAppStatus,
  resolveWorkspaceFromAuthPayload,
  whatsappApi,
  tokenStorage,
} from '@/lib/api';
import { useConversationHistory } from '@/hooks/useConversationHistory';
import { apiUrl } from '@/lib/http';
import {
  loadKloelThreadMessages,
  regenerateKloelConversationMessage,
  streamAuthenticatedKloelMessage,
  updateKloelMessageFeedback,
  updateKloelThreadMessage,
} from '@/lib/kloel-conversations';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  eventType?: 'tool_call' | 'tool_result';
  meta?: Record<string, any>;
}

export interface ChatContainerProps {
  initialOpenSettings?: boolean;
  initialSettingsTab?: 'account' | 'billing' | 'brain' | 'activity';
  initialScrollToCreditCard?: boolean;
}

interface AgentStreamEvent {
  type:
    | 'thought'
    | 'status'
    | 'error'
    | 'backlog'
    | 'prompt'
    | 'contact'
    | 'summary'
    | 'sale'
    | 'heartbeat'
    | 'typing'
    | 'action'
    | 'proof'
    | 'account';
  workspaceId: string;
  ts?: string;
  message: string;
  phase?: string;
  runId?: string;
  persistent?: boolean;
  streaming?: boolean;
  token?: string;
  meta?: Record<string, any>;
}

interface AgentTraceEntry {
  id: string;
  type: AgentStreamEvent['type'];
  phase?: string;
  message: string;
  timestamp: Date;
}

interface AgentCursorTarget {
  x: number;
  y: number;
  actionType?: string;
  text?: string;
  timestamp: number;
}

function mapThreadMessageToChatMessage(message: {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: Record<string, any> | null;
}) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    meta: message.metadata || undefined,
  } satisfies Message;
}

function normalizeMessageMeta(metadata: unknown): Record<string, any> | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }

  return metadata as Record<string, any>;
}

const EMPTY_AGENT_STATS: AgentStats = {
  messagesReceived: 0,
  messagesSent: 0,
  actionsExecuted: 0,
  leadsQualified: 0,
  activeConversations: 0,
  avgResponseTime: 'ao vivo',
};

function createAgentEventKey(event: AgentStreamEvent) {
  return [
    event.ts || '',
    event.type || '',
    event.phase || '',
    event.runId || '',
    event.message || '',
  ].join('::');
}

function isLowSignalSyncEvent(event: AgentStreamEvent) {
  const message = String(event.message || '').trim();
  if (!message) return true;

  if (
    /^Sincronizando conversa \d+ de \d+\.$/i.test(message) ||
    /^Começando a sincronização de \d+ conversas\.$/i.test(message)
  ) {
    return true;
  }

  if (
    event.type === 'thought' &&
    /^(Acessando seu WhatsApp|Consegui acessar seu WhatsApp|Sincronizando suas conversas)$/i.test(
      message,
    )
  ) {
    return true;
  }

  return false;
}

function isHighSignalAgentEvent(event: AgentStreamEvent) {
  return ['thought', 'typing', 'action', 'proof', 'account', 'contact', 'sale', 'error'].includes(
    event.type,
  );
}

function currentTraceDayKey() {
  return new Date().toLocaleDateString('sv-SE');
}

function formatAgentPhaseLabel(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw === 'streaming_token') return '';

  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function traceLabel(entry: Pick<AgentTraceEntry, 'phase' | 'type' | 'message'>) {
  return (
    formatAgentPhaseLabel(entry.phase) ||
    String(entry.message || '')
      .split(/[.!?]/)[0]
      .trim()
      .slice(0, 48) ||
    formatAgentPhaseLabel(entry.type) ||
    'Atividade'
  );
}

function deriveActivityTitle(event: AgentStreamEvent) {
  return (
    formatAgentPhaseLabel(event.phase) ||
    String(event.message || '')
      .split(/[.!?]/)[0]
      .trim()
      .slice(0, 72) ||
    'Atividade'
  );
}

function isStreamingAgentEvent(event: AgentStreamEvent) {
  return (
    event.streaming === true || event.phase === 'streaming_token' || event.meta?.streaming === true
  );
}

function ReasoningTraceBar({
  latestThought,
  entries,
  expanded,
  onToggle,
  isThinking,
}: {
  latestThought: string;
  entries: AgentTraceEntry[];
  expanded: boolean;
  onToggle: () => void;
  isThinking: boolean;
}) {
  if (!latestThought && entries.length === 0) return null;

  return (
    <div className="rounded-md border border-gray-200 bg-[#111113]/85 p-4 backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-gray-500">
            <KloelMushroomVisual
              size={18}
              traceColor="#FFFFFF"
              animated={isThinking}
              spores={isThinking ? 'animated' : 'none'}
              ariaHidden
            />
            <span>Rastro interpretavel ao vivo</span>
          </div>
          <p className="truncate text-sm leading-relaxed text-[#E0DDD8]">
            {latestThought || 'Aguardando novos pensamentos e acoes do agente.'}
          </p>
        </div>
        <button
          onClick={onToggle}
          className="shrink-0 rounded-md border border-[#222226] px-3 py-2 text-xs font-medium text-[#6E6E73] transition hover:bg-[#19191C]"
        >
          {expanded ? 'Ocultar' : 'Expandir'}
        </button>
      </div>

      {expanded ? (
        <div className="mt-4 max-h-64 overflow-y-auto rounded-2xl border border-[#222226] bg-[#0A0A0C] px-3 py-3">
          <div className="space-y-2">
            {entries.length > 0 ? (
              entries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-md bg-[#111113] px-3 py-2 border border-[#19191C]"
                >
                  <div className="mb-1 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.14em] text-gray-400">
                    <span>{traceLabel(entry)}</span>
                    <span>
                      {entry.timestamp.toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-[#6E6E73]">{entry.message}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">Nenhum evento do agente foi registrado hoje.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function createAgentActivity(event: AgentStreamEvent): AgentActivity {
  const activityType =
    event.type === 'thought'
      ? 'agent_thinking'
      : event.type === 'typing'
        ? 'agent_thinking'
        : event.type === 'action' || event.type === 'proof' || event.type === 'account'
          ? 'action_executed'
          : event.type === 'contact'
            ? 'message_sent'
            : event.type === 'error'
              ? 'error'
              : event.type === 'sale'
                ? 'lead_qualified'
                : event.type === 'status' && (event.phase || '').includes('session')
                  ? 'connection_status'
                  : 'action_executed';

  return {
    id: createAgentEventKey(event),
    type: activityType,
    title: deriveActivityTitle(event),
    description: event.message,
    timestamp: new Date(event.ts || Date.now()),
    status:
      event.type === 'error'
        ? 'error'
        : event.type === 'thought' || event.type === 'typing'
          ? 'pending'
          : 'success',
    metadata: {
      contactName: event.meta?.contactName,
      contactPhone: event.meta?.phone,
      messagePreview: event.message,
      actionType: event.meta?.action || event.meta?.actionType || event.meta?.capabilityCode,
      capabilityCode: event.meta?.capabilityCode,
      tacticCode: event.meta?.tacticCode || event.meta?.selectedTactic,
      conversationId: event.meta?.conversationId,
      workItemId: event.meta?.workItemId,
      conversationProofId: event.meta?.conversationProofId,
      accountProofId: event.meta?.accountProofId,
      cycleProofId: event.meta?.cycleProofId,
      selectedActionUtility: event.meta?.selectedActionUtility,
      selectedActionRank: event.meta?.selectedActionRank,
      betterActionCount: event.meta?.betterActionCount,
      betterExecutableActionCount: event.meta?.betterExecutableActionCount,
      nextBestActionType: event.meta?.nextBestActionType,
      nextBestActionUtility: event.meta?.nextBestActionUtility,
      selectedTactic: event.meta?.selectedTactic,
      selectedTacticUtility: event.meta?.selectedTacticUtility,
      selectedTacticRank: event.meta?.selectedTacticRank,
      betterTacticCount: event.meta?.betterTacticCount,
      nextBestTactic: event.meta?.nextBestTactic,
      nextBestTacticUtility: event.meta?.nextBestTacticUtility,
      utility: event.meta?.utility,
      state: event.meta?.state,
      errorMessage: event.type === 'error' ? event.message : undefined,
    },
  };
}

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
    justSignedUp,
    hasCompletedOnboarding,
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

  useEffect(() => {
    const authError = searchParams.get('authError');
    if (!authError) return;

    // Mostra contexto para o usuário quando o OAuth falha no backend.
    const messageByCode: Record<string, string> = {
      email_exists: 'E-mail já cadastrado. Faça login para continuar.',
      access_blocked: 'Acesso bloqueado. Contate o suporte.',
      service_unavailable: 'Serviço indisponível no momento. Tente novamente em instantes.',
      rate_limit_exceeded:
        'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.',
      oauth_backend_error_detailed:
        'Não foi possível concluir o login com o provedor. Tente novamente mais tarde.',
      oauth_network_error:
        'Falha de rede ao concluir o login. Verifique sua conexão e tente novamente.',
    };
    const message = messageByCode[authError];
    if (message) {
      setMessages((prev) => {
        const id = `auth_error_${authError}`;
        if (prev.some((m) => m.id === id)) return prev;
        return [
          ...prev,
          {
            id,
            role: 'assistant',
            content: message,
          },
        ];
      });
    }

    openAuthModal('login');
  }, [searchParams, openAuthModal]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isWhatsAppConnected, setIsWhatsAppConnected] = useState(false);
  const [showAgentDesktop, setShowAgentDesktop] = useState(false);
  const [agentActivities, setAgentActivities] = useState<AgentActivity[]>([]);
  const [agentStats, setAgentStats] = useState<AgentStats>(EMPTY_AGENT_STATS);
  const [agentThoughts, setAgentThoughts] = useState<string[]>([]);
  const [currentThought, setCurrentThought] = useState('');
  const [agentTraceEntries, setAgentTraceEntries] = useState<AgentTraceEntry[]>([]);
  const [thoughtTraceExpanded, setThoughtTraceExpanded] = useState(false);
  const [isAgentThinking, setIsAgentThinking] = useState(false);
  const [isAgentStreamConnected, setIsAgentStreamConnected] = useState(false);
  const [agentStreamEnabled, setAgentStreamEnabled] = useState(false);
  const [cursorTarget, setCursorTarget] = useState<AgentCursorTarget | null>(null);
  const [pendingAgentAction, setPendingAgentAction] = useState<string | null>(null);
  const seenAgentEventsRef = useRef(new Set<string>());
  const agentTraceEntriesRef = useRef<AgentTraceEntry[]>([]);
  const thoughtTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const traceDayRef = useRef(currentTraceDayKey());

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
  const [isTyping, setIsTyping] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const authedChatStreamRef = useRef<{ abort: () => void } | null>(null);

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

  useEffect(() => {
    if (!isAuthenticated) return;

    const targetConversationId =
      requestedConversationId || activeConversationId || activeConv || null;

    if (!targetConversationId) return;
    if (loadedConversationIdRef.current === targetConversationId && messages.length > 0) {
      return;
    }

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

  // Use subscription from auth context
  const subscriptionStatus = subscription?.status || 'none';
  const trialDaysLeft = subscription?.trialDaysLeft || 0;
  const creditsBalance = subscription?.creditsBalance || 0;
  const [hasCard, setHasCard] = useState(false);

  const refreshHasCard = useCallback(async () => {
    if (!isAuthenticated) {
      setHasCard(false);
      return;
    }

    try {
      const res = await billingApi.getPaymentMethods();
      const methods = (res.data as Record<string, any> | undefined)?.paymentMethods || [];
      setHasCard(methods.length > 0);
    } catch {
      setHasCard(false);
    }
  }, [isAuthenticated]);

  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [paywallVariant, setPaywallVariant] = useState<'activate' | 'renew'>('activate');

  const [settingsInitialTab, setSettingsInitialTab] = useState<
    'account' | 'billing' | 'brain' | 'activity'
  >(initialSettingsTab);
  const [scrollToCreditCard, setScrollToCreditCard] = useState(initialScrollToCreditCard);

  const appliedInitialDeepLink = useRef(false);

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showActivationSuccess, setShowActivationSuccess] = useState(false);

  const [guestSessionId, setGuestSessionId] = useState<string | null>(null);

  useEffect(() => {
    const storageKey = 'kloel_guest_session';
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      setGuestSessionId(stored);
      return;
    }
    const newSession = `guest_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem(storageKey, newSession);
    setGuestSessionId(newSession);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      setAgentStreamEnabled(true);
      return;
    }

    if (typeof window === 'undefined') return;
    if (tokenStorage.getToken() && tokenStorage.getWorkspaceId()) {
      setAgentStreamEnabled(true);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      refreshHasCard();
    }
  }, [isAuthenticated, refreshHasCard]);

  useEffect(() => {
    if (showSettings && isAuthenticated) {
      refreshHasCard();
    }
  }, [showSettings, isAuthenticated, refreshHasCard]);

  const resolveWorkspaceIdForSession = useCallback(async () => {
    const storedWorkspaceId = tokenStorage.getWorkspaceId() || '';
    if (storedWorkspaceId) {
      return storedWorkspaceId;
    }

    const token = tokenStorage.getToken();
    if (!token) {
      return '';
    }

    try {
      const res = await authApi.getMe();
      const recoveredWorkspaceId = resolveWorkspaceFromAuthPayload(res.data)?.id || '';

      if (recoveredWorkspaceId) {
        tokenStorage.setWorkspaceId(recoveredWorkspaceId);
      }

      return recoveredWorkspaceId;
    } catch (error) {
      console.error('Failed to recover workspace for WhatsApp session:', error);
      return '';
    }
  }, []);

  const checkWhatsAppStatus = useCallback(async () => {
    try {
      const workspaceId = await resolveWorkspaceIdForSession();
      if (!workspaceId) return;

      const status = await getWhatsAppStatus(workspaceId);
      if (status.connected) {
        setIsWhatsAppConnected(true);
        setAgentStreamEnabled(true);
      } else {
        setIsWhatsAppConnected(false);
      }
    } catch {
      // Ignore errors
    }
  }, [resolveWorkspaceIdForSession]);

  // Check WhatsApp connection status on mount
  useEffect(() => {
    if (isAuthenticated) {
      void checkWhatsAppStatus();
    }
  }, [checkWhatsAppStatus, isAuthenticated]);

  useEffect(() => {
    const syncWhatsAppConnection = () => {
      if (!tokenStorage.getToken()) {
        setIsWhatsAppConnected(false);
        return;
      }

      void checkWhatsAppStatus();
    };

    window.addEventListener('storage', syncWhatsAppConnection);
    window.addEventListener('kloel-storage-changed', syncWhatsAppConnection);

    return () => {
      window.removeEventListener('storage', syncWhatsAppConnection);
      window.removeEventListener('kloel-storage-changed', syncWhatsAppConnection);
    };
  }, [checkWhatsAppStatus]);

  const appendAssistantMessage = useCallback((content: string, meta?: Record<string, any>) => {
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
    setAgentStats((prev) => {
      const next = { ...prev };

      if (event.type === 'contact') {
        next.messagesSent += 1;
        next.actionsExecuted += 1;
        if (typeof event.meta?.remaining === 'number') {
          next.activeConversations = event.meta.remaining;
        }
      }

      if (event.type === 'sale') {
        next.leadsQualified += 1;
        next.actionsExecuted += 1;
      }

      if (event.type === 'action' || event.type === 'proof' || event.type === 'account') {
        next.actionsExecuted += 1;
      }

      if (event.type === 'backlog' || event.type === 'prompt') {
        if (typeof event.meta?.pendingConversations === 'number') {
          next.activeConversations = event.meta.pendingConversations;
        }
        if (typeof event.meta?.pendingMessages === 'number') {
          next.messagesReceived = Math.max(next.messagesReceived, event.meta.pendingMessages);
        }
      }

      if (event.type === 'status' && typeof event.meta?.importedMessages === 'number') {
        next.messagesReceived = Math.max(next.messagesReceived, event.meta.importedMessages);
      }

      if (event.type === 'summary') {
        next.activeConversations = 0;
      }

      return next;
    });
  }, []);

  const handleAgentEvent = useCallback(
    (event: AgentStreamEvent) => {
      if (!event?.type || !event?.message) return;
      const eventTimestamp = new Date(event.ts || Date.now());

      if (
        event.type === 'heartbeat' ||
        event.phase === 'stream_ready' ||
        event.phase === 'live_stream_ready'
      ) {
        setIsAgentStreamConnected(true);
        return;
      }

      if (isStreamingAgentEvent(event)) {
        setIsAgentStreamConnected(true);

        setAgentTraceEntries((prev) => {
          const last = prev[prev.length - 1];
          const nextEntry = {
            id: `stream::${event.type}::${event.phase || ''}::${event.runId || ''}`,
            type: event.type,
            phase: event.phase,
            message: event.message,
            timestamp: eventTimestamp,
          };

          const next =
            last &&
            isStreamingAgentEvent({
              type: last.type,
              workspaceId: event.workspaceId,
              message: last.message,
              phase: last.phase,
            } as AgentStreamEvent) &&
            last.type === event.type &&
            (last.phase || '') === (event.phase || '')
              ? [...prev.slice(0, -1), nextEntry]
              : [...prev.slice(-499), nextEntry];

          agentTraceEntriesRef.current = next;
          return next;
        });

        setCurrentThought(event.message);
        setAgentThoughts((prev) => {
          if (prev.length === 0) return [event.message];
          const next = [...prev];
          next[next.length - 1] = event.message;
          return next;
        });
        setIsAgentThinking(true);

        if (thoughtTimerRef.current) {
          clearTimeout(thoughtTimerRef.current);
        }

        thoughtTimerRef.current = setTimeout(() => {
          setIsAgentThinking(false);
        }, 4000);

        return;
      }

      const eventKey = createAgentEventKey(event);
      if (seenAgentEventsRef.current.has(eventKey)) return;
      seenAgentEventsRef.current.add(eventKey);

      const nextDayKey = currentTraceDayKey();
      if (traceDayRef.current !== nextDayKey) {
        traceDayRef.current = nextDayKey;
        agentTraceEntriesRef.current = [];
        setAgentTraceEntries([]);
        setAgentThoughts([]);
        setCurrentThought('');
      }

      const previousEntry = agentTraceEntriesRef.current[agentTraceEntriesRef.current.length - 1];
      const previousTimestamp = previousEntry?.timestamp?.getTime?.() || 0;
      const isRepeatedLowSignalMessage =
        previousEntry?.message === event.message &&
        eventTimestamp.getTime() - previousTimestamp < 30_000;

      if (isLowSignalSyncEvent(event) || isRepeatedLowSignalMessage) {
        updateAgentStats(event);
        return;
      }

      setIsAgentStreamConnected(true);
      setAgentActivities((prev) => [...prev.slice(-119), createAgentActivity(event)]);
      setAgentTraceEntries((prev) => {
        const next = [
          ...prev.slice(-499),
          {
            id: eventKey,
            type: event.type,
            phase: event.phase,
            message: event.message,
            timestamp: eventTimestamp,
          },
        ];
        agentTraceEntriesRef.current = next;
        return next;
      });
      updateAgentStats(event);

      if (typeof event.meta?.cursorX === 'number' && typeof event.meta?.cursorY === 'number') {
        setCursorTarget({
          x: event.meta.cursorX,
          y: event.meta.cursorY,
          actionType:
            typeof event.meta?.actionType === 'string' ? event.meta.actionType : undefined,
          text: typeof event.meta?.text === 'string' ? event.meta.text : undefined,
          timestamp: Date.now(),
        });
      }

      if (isHighSignalAgentEvent(event)) {
        setCurrentThought(event.message);
        setAgentThoughts((prev) => [...prev.slice(-4), event.message]);
        setIsAgentThinking(true);

        if (thoughtTimerRef.current) {
          clearTimeout(thoughtTimerRef.current);
        }

        thoughtTimerRef.current = setTimeout(() => {
          setIsAgentThinking(false);
        }, 4000);
        return;
      }

      setIsAgentThinking(false);
    },
    [updateAgentStats],
  );

  useEffect(() => {
    if (!agentStreamEnabled) return;

    const token = tokenStorage.getToken();
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!token || !workspaceId) return;

    let isCancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    const connect = async () => {
      controller = new AbortController();

      try {
        const response = await fetch('/api/whatsapp-api/live', {
          method: 'GET',
          headers: {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${tokenStorage.getToken() || token}`,
            'x-kloel-access-token': tokenStorage.getToken() || token,
            'x-workspace-id': tokenStorage.getWorkspaceId() || workspaceId,
            'x-kloel-workspace-id': tokenStorage.getWorkspaceId() || workspaceId,
          },
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`);
        }

        setIsAgentStreamConnected(true);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!isCancelled) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;

            const data = line.slice(6);
            if (!data || data === '[DONE]') continue;

            try {
              handleAgentEvent(JSON.parse(data) as AgentStreamEvent);
            } catch {
              // ignore malformed events
            }
          }
        }
      } catch (error) {
        if (isCancelled || controller?.signal.aborted) return;

        console.error('Agent stream error:', error);
        setIsAgentStreamConnected(false);
        retryTimer = setTimeout(connect, 2500);
      }
    };

    connect();

    return () => {
      isCancelled = true;
      setIsAgentStreamConnected(false);
      if (retryTimer) clearTimeout(retryTimer);
      controller?.abort();
    };
  }, [agentStreamEnabled, handleAgentEvent]);

  useEffect(() => {
    return () => {
      if (thoughtTimerRef.current) {
        clearTimeout(thoughtTimerRef.current);
      }
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

  // Onboarding modal removido - não abre automaticamente
  // useEffect(() => {
  //   if (isAuthenticated && justSignedUp && !hasCompletedOnboarding) {
  //     const timer = setTimeout(() => setShowOnboarding(true), 500)
  //     return () => clearTimeout(timer)
  //   }
  // }, [isAuthenticated, justSignedUp, hasCompletedOnboarding])

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // Create placeholder for assistant response
    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '', isStreaming: true },
    ]);

    const workspaceId = tokenStorage.getWorkspaceId();
    const canUseAuthedChat = isAuthenticated && !!workspaceId;

    if (!canUseAuthedChat) {
      try {
        const response = await fetch(apiUrl('/chat/guest'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            'X-Session-Id': guestSessionId || '',
          },
          body: JSON.stringify({ message: content.trim(), sessionId: guestSessionId }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        mutate((key: unknown) => typeof key === 'string' && key.startsWith('/chat'));

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Stream not available');
        }

        const decoder = new TextDecoder();
        let fullContent = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                fullContent = String(
                  parsed.content ??
                    parsed.chunk ??
                    parsed.message ??
                    'Desculpe, tive uma instabilidade agora. Tenta de novo em alguns segundos.',
                );
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: fullContent, isStreaming: false } : m,
                  ),
                );
                throw new Error(fullContent);
              }
              const chunk = parsed.content ?? parsed.chunk;
              if (chunk) {
                fullContent += chunk;
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, content: fullContent } : m)),
                );
              }
            } catch {
              // ignore
            }
          }
        }

        if (!fullContent.trim()) {
          throw new Error('empty_stream');
        }

        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m)),
        );
        setIsTyping(false);
        return;
      } catch (error) {
        console.error('Guest chat error:', error);

        try {
          const syncResponse = await fetch(apiUrl('/chat/guest/sync'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Session-Id': guestSessionId || '',
            },
            body: JSON.stringify({ message: content.trim(), sessionId: guestSessionId }),
          });

          if (syncResponse.ok) {
            const data = await syncResponse.json();
            const reply = data.reply ?? data.response ?? 'Sem resposta';
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: reply, isStreaming: false } : m,
              ),
            );
            setIsTyping(false);
            return;
          }
        } catch {
          // ignore
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    'Desculpe, estou com dificuldades no momento. Tente novamente em alguns segundos.',
                  isStreaming: false,
                }
              : m,
          ),
        );
        setIsTyping(false);
        return;
      }
    }

    try {
      let streamedReply = '';
      let nextConversationId = activeConversationId || null;
      let nextTitle =
        conversations.find((conversation) => conversation.id === activeConversationId)?.title ||
        'Nova conversa';

      authedChatStreamRef.current = streamAuthenticatedKloelMessage(
        {
          message: content.trim(),
          conversationId: activeConversationId || undefined,
          mode: 'chat',
        },
        {
          onChunk: (chunk) => {
            streamedReply += chunk;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: streamedReply, isStreaming: true } : m,
              ),
            );
          },
          onThread: (thread) => {
            nextConversationId = thread.conversationId;
            nextTitle =
              thread.title ||
              conversations.find((conversation) => conversation.id === thread.conversationId)
                ?.title ||
              nextTitle ||
              'Nova conversa';

            loadedConversationIdRef.current = thread.conversationId;
            setActiveConversationId(thread.conversationId);
            setActiveConversation(thread.conversationId);
            upsertConversation({
              id: thread.conversationId,
              title: nextTitle,
              updatedAt: new Date().toISOString(),
            });
          },
          onDone: () => {
            authedChatStreamRef.current = null;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m)),
            );

            if (nextConversationId) {
              upsertConversation({
                id: nextConversationId,
                title: nextTitle,
                updatedAt: new Date().toISOString(),
              });
              void refreshConversations();
              void loadConversation(nextConversationId);
            }

            setIsTyping(false);
          },
          onError: (error) => {
            authedChatStreamRef.current = null;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content:
                        streamedReply.trim() ||
                        error ||
                        'Desculpe, ocorreu um erro ao continuar sua conversa.',
                      isStreaming: false,
                    }
                  : m,
              ),
            );
            setIsTyping(false);
          },
        },
      );
    } catch (error: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: error?.message || 'Desculpe, ocorreu um erro ao continuar sua conversa.',
                isStreaming: false,
              }
            : m,
        ),
      );
      setIsTyping(false);
    }
  };

  const handleMessageRetry = useCallback(
    async (messageId: string) => {
      const sourceMessage = messages.find(
        (message) => message.id === messageId && message.role === 'user',
      );
      if (!sourceMessage) return;

      await handleSendMessage(sourceMessage.content);
    },
    [handleSendMessage, messages],
  );

  const handleMessageEdit = useCallback(
    async (messageId: string, nextContent: string) => {
      if (!activeConversationId) return;

      const updated = await updateKloelThreadMessage(messageId, nextContent);
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId
            ? {
                ...message,
                content: updated.content,
                meta: normalizeMessageMeta(updated.metadata),
              }
            : message,
        ),
      );

      await handleSendMessage(nextContent);
    },
    [activeConversationId, handleSendMessage],
  );

  const handleAssistantFeedback = useCallback(
    async (messageId: string, type: 'positive' | 'negative' | null) => {
      if (!activeConversationId) return;

      const updated = await updateKloelMessageFeedback(messageId, type);
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId
            ? {
                ...message,
                meta: normalizeMessageMeta(updated.metadata),
              }
            : message,
        ),
      );
    },
    [activeConversationId],
  );

  const handleAssistantRegenerate = useCallback(
    async (messageId: string) => {
      if (!activeConversationId) return;

      const regenerated = await regenerateKloelConversationMessage(activeConversationId, messageId);
      setMessages((prev) => {
        const targetIndex = prev.findIndex((message) => message.id === messageId);
        if (targetIndex === -1) {
          return prev;
        }

        return [
          ...prev.slice(0, targetIndex),
          {
            id: regenerated.id,
            role: 'assistant',
            content: regenerated.content,
            meta: normalizeMessageMeta(regenerated.metadata),
          },
        ];
      });
      void refreshConversations();
    },
    [activeConversationId, refreshConversations],
  );

  const handleWhatsAppConnect = () => {
    setShowAgentDesktop(true);
  };

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
      ...prev.map((message) =>
        Array.isArray(message.meta?.quickActions) && message.meta.quickActions.length > 0
          ? {
              ...message,
              meta: {
                ...message.meta,
                quickActions: [],
              },
            }
          : message,
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
      if (response.error) {
        throw new Error(response.error);
      }
    } catch (error: any) {
      appendAssistantMessage(
        `Não consegui iniciar essa ação. Motivo: ${error?.message || 'erro desconhecido'}.`,
      );
      setIsAgentThinking(false);
    } finally {
      setPendingAgentAction(null);
    }
  };

  const handleSeedProductKnowledge = () => {
    const teachPrompt = `Kloel, agora irei te ensinar sobre meus produtos e preciso que voce salve todas as respostas dentro da sua memoria permanente:

Quais sao os meus produtos?
O que eu vendo?
Como eu vendo?
O que eu entrego?
Como eu entrego?
Quando eu entrego?
O que eu ofereco?
Como eu ofereco?
Quem sao os meus clientes?
Como sao os meus clientes?
Quais os problemas dos meus clientes?
Qual a idade dos meus clientes?
Qual o genero dos meus clientes?
O que meus clientes esperam de mim?
Quais sao as perguntas que meus clientes sempre me fazem?
Quais sao as respostas para essas perguntas?
Como devo agir para ser o melhor vendedor da sua empresa?
Como devo agir para ser o melhor agente comercial possivel?
O que eu nao posso esquecer jamais?
Como devo agir quando nao tenho respostas?
Como devo me apresentar?
Voce quer que eu me apresente como inteligencia artificial comercial autonoma da sua empresa ou prefere outro modo?

Lembre-se de subir arquivos, fotos, PDFs e tudo que voce possui sobre o seu negocio. Quanto mais informacoes voce enviar, melhor o Kloel ira operar.`;

    setInputValue(teachPrompt);
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

  const hasMessages = messages.length > 0;
  const latestTraceLine =
    currentThought || agentTraceEntries[agentTraceEntries.length - 1]?.message || '';

  return (
    <div className="flex min-h-screen flex-col">
      <HeaderMinimal
        isWhatsAppConnected={isWhatsAppConnected}
        onOpenSettings={handleOpenSettings}
        subscriptionStatus={subscriptionStatus}
        trialDaysLeft={trialDaysLeft}
      />

      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-32 pt-20">
        {!hasMessages ? (
          <div
            className={`flex w-full flex-col items-center ${showAgentDesktop ? 'max-w-[865px]' : 'max-w-3xl'}`}
          >
            {!showAgentDesktop && (
              <div className="mb-8 text-center">
                <div className="mb-5 flex justify-center">
                  <KloelMushroomVisual size={56} traceColor="#FFFFFF" spores="none" ariaHidden />
                </div>
                <h1
                  className="mb-3 text-3xl font-semibold tracking-tight text-[#E0DDD8] md:text-4xl"
                  style={{ fontFamily: "'Sora', var(--font-serif), sans-serif" }}
                >
                  {isAuthenticated && userName
                    ? `De volta ao trabalho, ${userName}?`
                    : 'Como posso ajudar seu negocio hoje?'}
                </h1>
                <p className="text-lg text-[#6E6E73]">
                  Pergunte qualquer coisa sobre seus produtos, vendas, leads ou configure o Kloel.
                </p>
              </div>
            )}

            {showAgentDesktop ? (
              <AgentDesktopViewer
                isVisible={showAgentDesktop}
                latestThought={latestTraceLine}
                isThinking={isAgentThinking}
                traceEntries={agentTraceEntries}
                cursorTarget={cursorTarget}
                autoConnect={true}
                onClose={() => setShowAgentDesktop(false)}
                onConnectionChange={(connected) => {
                  setIsWhatsAppConnected(connected);
                  if (connected) {
                    setAgentStreamEnabled(true);
                  }
                }}
              />
            ) : (
              <ReasoningTraceBar
                latestThought={latestTraceLine}
                entries={agentTraceEntries}
                expanded={thoughtTraceExpanded}
                onToggle={() => setThoughtTraceExpanded((prev) => !prev)}
                isThinking={isAgentThinking}
              />
            )}
          </div>
        ) : (
          <div
            className={`w-full space-y-6 pb-4 ${showAgentDesktop ? 'max-w-[865px]' : 'max-w-3xl'}`}
          >
            {showAgentDesktop ? (
              <AgentDesktopViewer
                isVisible={showAgentDesktop}
                latestThought={latestTraceLine}
                isThinking={isAgentThinking}
                traceEntries={agentTraceEntries}
                cursorTarget={cursorTarget}
                autoConnect={true}
                onClose={() => setShowAgentDesktop(false)}
                onConnectionChange={(connected) => {
                  setIsWhatsAppConnected(connected);
                  if (connected) {
                    setAgentStreamEnabled(true);
                  }
                }}
              />
            ) : (
              <ReasoningTraceBar
                latestThought={latestTraceLine}
                entries={agentTraceEntries}
                expanded={thoughtTraceExpanded}
                onToggle={() => setThoughtTraceExpanded((prev) => !prev)}
                isThinking={isAgentThinking}
              />
            )}

            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onQuickAction={handleAgentQuickAction}
                pendingActionId={pendingAgentAction}
                isBusy={isTyping}
                onMessageEdit={activeConversationId ? handleMessageEdit : undefined}
                onMessageRetry={handleMessageRetry}
                onAssistantFeedback={activeConversationId ? handleAssistantFeedback : undefined}
                onAssistantRegenerate={activeConversationId ? handleAssistantRegenerate : undefined}
              />
            ))}
            {isTyping && (
              <div className="flex items-start">
                <div className="flex items-center gap-3 rounded-2xl border border-[#222226] bg-[#19191C] px-4 py-3">
                  <KloelMushroomVisual size={24} traceColor="#FFFFFF" animated spores="animated" />
                  <span className="text-sm text-[#6E6E73]">kloel esta pensando</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[#0A0A0C] via-[#0A0A0C] to-transparent pb-6 pt-8">
        <div className="mx-auto max-w-3xl px-4">
          <InputComposer
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSendMessage}
            onConnectWhatsApp={handleWhatsAppConnect}
            showActionButtons={true}
          />
          <FooterMinimal />
        </div>
      </div>

      <AuthModal
        isOpen={authModalOpen}
        onClose={closeAuthModal}
        initialMode={authModalMode}
        initialEmail={authPrefillEmail || undefined}
      />

      <SettingsDrawer
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onOpen={() => setShowSettings(true)}
        subscriptionStatus={subscriptionStatus}
        trialDaysLeft={trialDaysLeft}
        creditsBalance={creditsBalance}
        hasCard={hasCard}
        onActivateTrial={handleActivateTrial}
        initialTab={settingsInitialTab}
        scrollToCreditCard={scrollToCreditCard}
        side="left"
        showHandle={false}
        activityFeed={agentActivities}
      />

      <TrialPaywallModal
        isOpen={showPaywallModal}
        onClose={() => setShowPaywallModal(false)}
        onActivateTrial={handlePaywallActivate}
        variant={paywallVariant}
      />

      <OnboardingModal
        isOpen={showOnboarding}
        onComplete={handleOnboardingComplete}
        onClose={handleOnboardingClose}
        onTeachProducts={() => {
          handleSeedProductKnowledge();
        }}
        onConnectWhatsApp={handleWhatsAppConnect}
      />

      <PlanActivationSuccessModal
        isOpen={showActivationSuccess}
        onClose={() => setShowActivationSuccess(false)}
        onTestKloel={() => {}}
        onOpenSettings={handleOpenBrainSettings}
        onChatWithKloel={() => {}}
      />
    </div>
  );
}
