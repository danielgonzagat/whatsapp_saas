'use client';

// Legacy shell kept compatible with the published dashboard thread model.

import { useConversationHistory } from '@/hooks/useConversationHistory';
import {
  authApi,
  billingApi,
  getWhatsAppStatus,
  resolveWorkspaceFromAuthPayload,
  tokenStorage,
  whatsappApi,
} from '@/lib/api';
import { apiUrl } from '@/lib/http';
import {
  loadKloelThreadMessages,
  regenerateKloelConversationMessage,
  streamAuthenticatedKloelMessage,
  updateKloelMessageFeedback,
  updateKloelThreadMessage,
} from '@/lib/kloel-conversations';
import {
  appendAssistantTraceFromEvent,
  getAssistantResponseVersions,
} from '@/lib/kloel-message-ui';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { mutate } from 'swr';
import type { AgentActivity, AgentStats } from './AgentConsole';
import { AgentDesktopViewer } from './AgentDesktopViewer';
import { KloelMushroomVisual } from './KloelBrand';
import { AuthModal } from './auth/auth-modal';
import { useAuth } from './auth/auth-provider';
import { AUTH_ERROR_MESSAGES, SEED_PRODUCT_KNOWLEDGE_PROMPT } from './chat-container.data';
import { FooterMinimal } from './footer-minimal';
import { HeaderMinimal } from './header-minimal';
import { InputComposer } from './input-composer';
import { MessageBubble } from './message-bubble';
import { OnboardingModal } from './onboarding-modal';
import { PlanActivationSuccessModal } from './plan-activation-success-modal';
import { SettingsDrawer } from './settings/settings-drawer';
import { TrialPaywallModal } from './trial-paywall-modal';

const SEPARATOR_G_RE = /[_-]+/g;
const WHITESPACE_G_RE = /\s+/g;
const WORD_BOUNDARY_RE = /\b\w/g;

const SINCRONIZANDO_CONVERSA_RE = /^Sincronizando conversa \d+ de \d+\.$/i;
const COME_ANDO_A_SINCRONIZA_RE = /^Começando a sincronização de \d+ conversas\.$/i;
const ACESSANDO_SEU_WHATS_APP_RE =
  /^(Acessando seu WhatsApp|Consegui acessar seu WhatsApp|Sincronizando suas conversas)$/i;
const SENTENCE_END_RE = /[.!?]/;

const SLOW_HINT_DELAY_MS = 30_000;

function resolveActivityType(event: AgentStreamEvent): AgentActivity['type'] {
  if (event.type === 'thought' || event.type === 'typing') return 'agent_thinking';
  if (event.type === 'action' || event.type === 'proof' || event.type === 'account') {
    return 'action_executed';
  }
  if (event.type === 'contact') return 'message_sent';
  if (event.type === 'error') return 'error';
  if (event.type === 'sale') return 'lead_qualified';
  if (event.type === 'status' && (event.phase || '').includes('session')) {
    return 'connection_status';
  }
  return 'action_executed';
}

function resolveActivityStatus(event: AgentStreamEvent): AgentActivity['status'] {
  if (event.type === 'error') return 'error';
  if (event.type === 'thought' || event.type === 'typing') return 'pending';
  return 'success';
}

function extractErrorMessage(error: unknown, fallback: string): string {
  return error && typeof error === 'object' && 'message' in error
    ? String((error as { message: string }).message)
    : fallback;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  eventType?: 'tool_call' | 'tool_result';
  meta?: Record<string, unknown>;
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
  meta?: Record<string, unknown>;
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
  metadata?: Record<string, unknown> | null;
}) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    meta: message.metadata || undefined,
  } satisfies Message;
}

function normalizeMessageMeta(metadata: unknown): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }

  return metadata as Record<string, unknown>;
}

function createClientRequestId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `kloel_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  );
}

function readMetaString(
  meta: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = meta?.[key];
  return typeof value === 'string' ? value : undefined;
}

function readMetaNumber(
  meta: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = meta?.[key];
  return typeof value === 'number' ? value : undefined;
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

  if (SINCRONIZANDO_CONVERSA_RE.test(message) || COME_ANDO_A_SINCRONIZA_RE.test(message)) {
    return true;
  }

  if (event.type === 'thought' && ACESSANDO_SEU_WHATS_APP_RE.test(message)) {
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
    .replace(SEPARATOR_G_RE, ' ')
    .replace(WHITESPACE_G_RE, ' ')
    .trim()
    .replace(WORD_BOUNDARY_RE, (char) => char.toUpperCase());
}

function traceLabel(entry: Pick<AgentTraceEntry, 'phase' | 'type' | 'message'>) {
  return (
    formatAgentPhaseLabel(entry.phase) ||
    String(entry.message || '')
      .split(SENTENCE_END_RE)[0]
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
      .split(SENTENCE_END_RE)[0]
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
    <div
      style={{
        borderRadius: 14,
        border: `1px solid ${KLOEL_THEME.borderPrimary}`,
        background: `color-mix(in srgb, ${KLOEL_THEME.bgCard} 85%, transparent)`,
        padding: 16,
        backdropFilter: 'blur(14px)',
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: KLOEL_THEME.textSecondary,
            }}
          >
            <KloelMushroomVisual
              size={18}
              traceColor={KLOEL_THEME.textPrimary}
              animated={isThinking}
              spores={isThinking ? 'animated' : 'none'}
              ariaHidden
            />
            <span>Rastro interpretável ao vivo</span>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.65,
              color: KLOEL_THEME.textPrimary,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {latestThought || 'Aguardando novos pensamentos e ações do agente.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          style={{
            flexShrink: 0,
            borderRadius: 10,
            border: `1px solid ${KLOEL_THEME.borderPrimary}`,
            padding: '8px 12px',
            background: 'transparent',
            color: KLOEL_THEME.textSecondary,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {expanded ? 'Ocultar' : 'Expandir'}
        </button>
      </div>

      {expanded ? (
        <div
          style={{
            marginTop: 16,
            maxHeight: 256,
            overflowY: 'auto',
            borderRadius: 16,
            border: `1px solid ${KLOEL_THEME.borderPrimary}`,
            background: KLOEL_THEME.bgPrimary,
            padding: 12,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {entries.length > 0 ? (
              entries.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    borderRadius: 10,
                    background: KLOEL_THEME.bgCard,
                    border: `1px solid ${KLOEL_THEME.borderSubtle}`,
                    padding: '10px 12px',
                  }}
                >
                  <div
                    style={{
                      marginBottom: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: KLOEL_THEME.textSecondary,
                    }}
                  >
                    <span>{traceLabel(entry)}</span>
                    <span>
                      {entry.timestamp.toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 14,
                      lineHeight: 1.65,
                      color: KLOEL_THEME.textSecondary,
                    }}
                  >
                    {entry.message}
                  </p>
                </div>
              ))
            ) : (
              <p style={{ margin: 0, fontSize: 14, color: KLOEL_THEME.textSecondary }}>
                Nenhum evento do agente foi registrado hoje.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EmptyStateGreetingHeader({
  isAuthenticated,
  userName,
}: {
  isAuthenticated: boolean;
  userName?: string | null;
}) {
  return (
    <div style={{ marginBottom: 32, textAlign: 'center' }}>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center' }}>
        <KloelMushroomVisual
          size={56}
          traceColor={KLOEL_THEME.textPrimary}
          spores="none"
          ariaHidden
        />
      </div>
      <h1
        style={{
          margin: '0 0 12px',
          fontFamily: "'Sora', var(--font-serif), sans-serif",
          fontSize: 'clamp(2rem, 4vw, 2.5rem)',
          fontWeight: 600,
          lineHeight: 1.05,
          letterSpacing: '-0.03em',
          color: KLOEL_THEME.textPrimary,
        }}
      >
        {isAuthenticated && userName
          ? `De volta ao trabalho, ${userName}?`
          : 'Como posso ajudar seu negócio hoje?'}
      </h1>
      <p style={{ fontSize: 18, color: KLOEL_THEME.textSecondary }}>
        Pergunte qualquer coisa sobre seus produtos, vendas, leads ou configure o Kloel.
      </p>
    </div>
  );
}

function createAgentActivity(event: AgentStreamEvent): AgentActivity {
  const meta = event.meta;

  return {
    id: createAgentEventKey(event),
    type: resolveActivityType(event),
    title: deriveActivityTitle(event),
    description: event.message,
    timestamp: new Date(event.ts || Date.now()),
    status: resolveActivityStatus(event),
    metadata: {
      contactName: readMetaString(meta, 'contactName'),
      contactPhone: readMetaString(meta, 'phone'),
      messagePreview: event.message,
      actionType:
        readMetaString(meta, 'action') ||
        readMetaString(meta, 'actionType') ||
        readMetaString(meta, 'capabilityCode'),
      capabilityCode: readMetaString(meta, 'capabilityCode'),
      tacticCode: readMetaString(meta, 'tacticCode') || readMetaString(meta, 'selectedTactic'),
      conversationId: readMetaString(meta, 'conversationId'),
      workItemId: readMetaString(meta, 'workItemId'),
      conversationProofId: readMetaString(meta, 'conversationProofId'),
      accountProofId: readMetaString(meta, 'accountProofId'),
      cycleProofId: readMetaString(meta, 'cycleProofId'),
      selectedActionUtility: readMetaNumber(meta, 'selectedActionUtility'),
      selectedActionRank: readMetaNumber(meta, 'selectedActionRank'),
      betterActionCount: readMetaNumber(meta, 'betterActionCount'),
      betterExecutableActionCount: readMetaNumber(meta, 'betterExecutableActionCount'),
      nextBestActionType: readMetaString(meta, 'nextBestActionType'),
      nextBestActionUtility: readMetaNumber(meta, 'nextBestActionUtility'),
      selectedTactic: readMetaString(meta, 'selectedTactic'),
      selectedTacticUtility: readMetaNumber(meta, 'selectedTacticUtility'),
      selectedTacticRank: readMetaNumber(meta, 'selectedTacticRank'),
      betterTacticCount: readMetaNumber(meta, 'betterTacticCount'),
      nextBestTactic: readMetaString(meta, 'nextBestTactic'),
      nextBestTacticUtility: readMetaNumber(meta, 'nextBestTacticUtility'),
      utility: readMetaNumber(meta, 'utility'),
      state: readMetaString(meta, 'state'),
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

  useEffect(() => {
    const authError = searchParams.get('authError');
    if (!authError) return;

    // Mostra contexto para o usuário quando o OAuth falha no backend.
    const message = AUTH_ERROR_MESSAGES[authError];
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
  const [_agentStats, setAgentStats] = useState<AgentStats>(EMPTY_AGENT_STATS);
  const [_agentThoughts, setAgentThoughts] = useState<string[]>([]);
  const [currentThought, setCurrentThought] = useState('');
  const [agentTraceEntries, setAgentTraceEntries] = useState<AgentTraceEntry[]>([]);
  const [thoughtTraceExpanded, setThoughtTraceExpanded] = useState(false);
  const [isAgentThinking, setIsAgentThinking] = useState(false);
  const [_isAgentStreamConnected, setIsAgentStreamConnected] = useState(false);
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

    authKeys.forEach((key) => {
      nextParams.delete(key);
    });
    const nextQuery = nextParams.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;

    router.replace(nextUrl, { scroll: false });
  }, [isAuthenticated, pathname, router, searchParams]);
  const [isTyping, setIsTyping] = useState(false);
  const [showSlowHint, setShowSlowHint] = useState(false);
  const [isCancelableReply, setIsCancelableReply] = useState(false);
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
      const methods = Array.isArray(res.data?.paymentMethods) ? res.data.paymentMethods : [];
      setHasCard(methods.length > 0);
    } catch {
      setHasCard(false);
    }
  }, [isAuthenticated]);

  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [paywallVariant, _setPaywallVariant] = useState<'activate' | 'renew'>('activate');

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

        // biome-ignore lint/performance/noAwaitInLoops: sequential processing required
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

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: messages.length change is the intentional trigger to scroll-to-bottom; scrollToBottom reads ref imperatively
  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom, messages.length]);

  useEffect(() => {
    if (!isTyping || !isCancelableReply) {
      setShowSlowHint(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShowSlowHint(true);
    }, SLOW_HINT_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [isCancelableReply, isTyping]);

  const cancelActiveReply = useCallback(() => {
    authedChatStreamRef.current?.abort();
    authedChatStreamRef.current = null;
    setIsCancelableReply(false);
    setShowSlowHint(false);
    setIsTyping(false);
    setMessages((prev) =>
      prev.filter((message) => !(message.role === 'assistant' && message.isStreaming)),
    );
  }, []);

  const handleSendMessageRef = useRef<(content: string) => Promise<void>>(async () => {});
  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return;
    const clientRequestId = createClientRequestId();

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
      meta: { clientRequestId },
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);
    setShowSlowHint(false);
    setIsCancelableReply(false);

    // Create placeholder for assistant response
    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        isStreaming: true,
        meta: {
          clientRequestId,
        },
      },
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

        // biome-ignore lint/performance/noAwaitInLoops: chat-container SSE stream — each reader.read() chunk must append to buffer and split on '\n' to surface [DONE] and data: frames to the token renderer in order; parallel reads would interleave partial JSON across boundaries
        for (;;) {
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

      setIsCancelableReply(true);
      authedChatStreamRef.current = streamAuthenticatedKloelMessage(
        {
          message: content.trim(),
          conversationId: activeConversationId || undefined,
          mode: 'chat',
          metadata: {
            clientRequestId,
            source: 'kloel_chat_container',
          },
        },
        {
          onEvent: (event) => {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      meta: appendAssistantTraceFromEvent(message.meta, event),
                    }
                  : message,
              ),
            );
          },
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
            setIsCancelableReply(false);
            setShowSlowHint(false);
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
            setIsCancelableReply(false);
            setShowSlowHint(false);
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
    } catch (error: unknown) {
      setIsCancelableReply(false);
      setShowSlowHint(false);
      const errMsg = extractErrorMessage(
        error,
        'Desculpe, ocorreu um erro ao continuar sua conversa.',
      );
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: errMsg,
                isStreaming: false,
              }
            : m,
        ),
      );
      setIsTyping(false);
    }
  };
  handleSendMessageRef.current = handleSendMessage;

  const handleMessageRetry = useCallback(
    async (messageId: string) => {
      const sourceMessage = messages.find(
        (message) => message.id === messageId && message.role === 'user',
      );
      if (!sourceMessage) return;

      await handleSendMessageRef.current(sourceMessage.content);
    },
    [messages],
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

      await handleSendMessageRef.current(nextContent);
    },
    [activeConversationId],
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

      setIsTyping(true);
      setMessages((prev) => {
        const targetIndex = prev.findIndex((message) => message.id === messageId);
        if (targetIndex === -1) {
          return prev;
        }

        const targetMessage = prev[targetIndex];
        const preservedVersions = getAssistantResponseVersions(
          targetMessage.meta,
          targetMessage.content,
          targetMessage.id,
        );

        return [
          ...prev.slice(0, targetIndex),
          {
            ...targetMessage,
            content: '',
            isStreaming: true,
            meta: {
              ...(targetMessage.meta || {}),
              responseVersions: preservedVersions,
            },
          },
        ];
      });

      try {
        const regenerated = await regenerateKloelConversationMessage(
          activeConversationId,
          messageId,
        );
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
      } catch (error: unknown) {
        const errMsg = extractErrorMessage(
          error,
          'Desculpe, ocorreu uma instabilidade ao tentar gerar uma nova versão.',
        );
        setMessages((prev) =>
          prev.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  content: errMsg,
                  isStreaming: false,
                }
              : message,
          ),
        );
      } finally {
        setIsTyping(false);
      }
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
    } catch (error: unknown) {
      const errMsg = extractErrorMessage(error, 'erro desconhecido');
      appendAssistantMessage(`Não consegui iniciar essa ação. Motivo: ${errMsg}.`);
      setIsAgentThinking(false);
    } finally {
      setPendingAgentAction(null);
    }
  };

  const handleSeedProductKnowledge = () => {
    setInputValue(SEED_PRODUCT_KNOWLEDGE_PROMPT);
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
  const contentMaxWidth = showAgentDesktop ? 865 : 768;

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        minHeight: 0,
        flexDirection: 'column',
        overflow: 'hidden',
        background: KLOEL_THEME.bgPrimary,
      }}
    >
      <HeaderMinimal
        isWhatsAppConnected={isWhatsAppConnected}
        onOpenSettings={handleOpenSettings}
        subscriptionStatus={subscriptionStatus}
        trialDaysLeft={trialDaysLeft}
      />

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
          }}
        >
          <div
            style={{
              minHeight: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: hasMessages ? 'flex-start' : 'center',
              padding: '80px 16px 24px',
              boxSizing: 'border-box',
            }}
          >
            {!hasMessages ? (
              <div
                style={{
                  display: 'flex',
                  width: '100%',
                  maxWidth: contentMaxWidth,
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                {!showAgentDesktop && (
                  <EmptyStateGreetingHeader isAuthenticated={isAuthenticated} userName={userName} />
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
                style={{
                  width: '100%',
                  maxWidth: contentMaxWidth,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 24,
                  paddingBottom: 24,
                }}
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
                    showSlowHint={Boolean(message.isStreaming && isCancelableReply && showSlowHint)}
                    onCancelProcessing={message.isStreaming ? cancelActiveReply : undefined}
                    onMessageEdit={activeConversationId ? handleMessageEdit : undefined}
                    onMessageRetry={handleMessageRetry}
                    onAssistantFeedback={activeConversationId ? handleAssistantFeedback : undefined}
                    onAssistantRegenerate={
                      activeConversationId ? handleAssistantRegenerate : undefined
                    }
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          flexShrink: 0,
          background: KLOEL_THEME.bgPrimary,
          paddingTop: 20,
          paddingBottom: 'max(24px, env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div style={{ margin: '0 auto', maxWidth: 768, padding: '0 16px' }}>
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
