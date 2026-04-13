'use client';

export const dynamic = 'force-dynamic';

import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { mutate } from 'swr';
import { Bot, Loader2, MessageSquare, Send, User as UserIcon, XCircle } from 'lucide-react';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import { useSocket } from '@/hooks/useSocket';
import {
  listConversations,
  listInboxAgents,
  getConversationMessages,
  closeConversation,
  assignConversation,
  apiFetch,
  type Conversation,
  type Message,
  type InboxAgent,
} from '@/lib/api';
import { buildDashboardHref } from '@/lib/kloel-dashboard-context';

type ChannelFilter = 'all' | 'whatsapp' | 'email' | 'instagram';
type StatusFilter = 'open' | 'closed' | 'all';

interface InboxWorkspaceProps {
  embedded?: boolean;
  title?: string;
  description?: string;
  showHeader?: boolean;
  showUtilityLinks?: boolean;
  showContextBanner?: boolean;
  headerActions?: ReactNode;
}

function formatTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const INBOX_RESPONSIVE_VARS = {
  '--inbox-page-x': 'clamp(14px, 2vw, 24px)',
  '--inbox-page-y': 'clamp(20px, 2.8vw, 32px)',
  '--inbox-shell-gap': 'clamp(16px, 1.8vw, 24px)',
  '--inbox-radius': 'clamp(14px, 1.4vw, 18px)',
  '--inbox-panel-x': 'clamp(14px, 1.6vw, 20px)',
  '--inbox-panel-y': 'clamp(12px, 1.25vw, 18px)',
  '--inbox-title': 'clamp(18px, 1.5vw, 24px)',
  '--inbox-section-title': 'clamp(13px, 0.95vw, 15px)',
  '--inbox-body': 'clamp(12px, 0.88vw, 14px)',
  '--inbox-body-sm': 'clamp(11px, 0.76vw, 12.5px)',
  '--inbox-body-xs': 'clamp(10px, 0.66vw, 11.5px)',
  '--inbox-chip-x': 'clamp(8px, 0.8vw, 10px)',
  '--inbox-chip-y': 'clamp(4px, 0.45vw, 6px)',
  '--inbox-button-x': 'clamp(12px, 1vw, 14px)',
  '--inbox-button-y': 'clamp(8px, 0.75vw, 10px)',
  '--inbox-input-x': 'clamp(14px, 1.1vw, 16px)',
  '--inbox-input-y': 'clamp(10px, 0.9vw, 12px)',
  '--inbox-item-gap': 'clamp(10px, 1vw, 14px)',
  '--inbox-message-x': 'clamp(12px, 1.15vw, 16px)',
  '--inbox-message-y': 'clamp(10px, 0.9vw, 12px)',
  '--inbox-icon-sm': 'clamp(14px, 0.95vw, 16px)',
  '--inbox-icon-md': 'clamp(16px, 1.1vw, 18px)',
} as CSSProperties;

export function InboxWorkspace({
  embedded = false,
  title = 'Conversas',
  description = 'Converse, feche e acompanhe conversas de todos os canais.',
  showHeader = true,
  showUtilityLinks = !embedded,
  showContextBanner = !embedded,
  headerActions,
}: InboxWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading, workspace, user, openAuthModal } = useAuth();
  const { isConnected, subscribe } = useSocket();

  const workspaceId = workspace?.id;

  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const [agents, setAgents] = useState<InboxAgent[]>([]);
  const [assigning, setAssigning] = useState(false);

  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');

  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const requestedConversationId = searchParams?.get('conversationId');
  const requestedPhone = searchParams?.get('phone');
  const source = searchParams?.get('source') || '';
  const requestedDraft = searchParams?.get('draft');

  const sourceLabel = useMemo(() => {
    const labels: Record<string, string> = {
      leads: 'Leads',
      followups: 'Follow-ups',
      marketing: 'Marketing',
      scrapers: 'Scrapers',
      flow: 'Flow',
    };
    return labels[source] || '';
  }, [source]);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedConversationId) || null,
    [conversations, selectedConversationId],
  );

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      if (channelFilter !== 'all') {
        const ch = (c.channel || 'whatsapp').toLowerCase();
        if (ch !== channelFilter) return false;
      }
      if (statusFilter !== 'all') {
        const st = (c.status || 'open').toLowerCase();
        if (statusFilter === 'open' && st !== 'open') return false;
        if (statusFilter === 'closed' && st !== 'closed') return false;
      }
      return true;
    });
  }, [conversations, channelFilter, statusFilter]);

  const matchedConversationByPhone = useMemo(() => {
    const normalize = (value?: string | null) => (value || '').replace(/\D/g, '');
    if (!requestedPhone) return null;
    const target = normalize(requestedPhone);
    if (!target) return null;
    return (
      conversations.find((conversation) =>
        normalize(conversation.contact?.phone).includes(target),
      ) || null
    );
  }, [conversations, requestedPhone]);

  const handleAssumir = async () => {
    if (!selectedConversationId || !user) return;
    setAssigning(true);
    setError(null);
    try {
      await assignConversation(selectedConversationId, user.id);
      await refreshConversations();
    } catch (err: any) {
      setError(err?.message || 'Falha ao assumir conversa');
    } finally {
      setAssigning(false);
    }
  };

  const handleDevolverIA = async () => {
    if (!selectedConversationId) return;
    setAssigning(true);
    setError(null);
    try {
      await assignConversation(selectedConversationId, '');
      await refreshConversations();
    } catch (err: any) {
      setError(err?.message || 'Falha ao devolver para IA');
    } finally {
      setAssigning(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    setError(null);
    setLoadingMessages(true);
    try {
      const data = await getConversationMessages(conversationId);
      setMessages(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar mensagens');
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSendReply = async () => {
    if (!selectedConversationId || !replyText.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/inbox/conversations/${encodeURIComponent(selectedConversationId)}/reply`,
        {
          method: 'POST',
          body: { content: replyText.trim() },
        },
      );
      if (res.error) throw new Error(res.error);
      setReplyText('');
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/inbox'));
      await loadMessages(selectedConversationId);
    } catch (err: any) {
      setError(err?.message || 'Falha ao enviar mensagem');
    } finally {
      setSending(false);
    }
  };

  const refreshConversations = async () => {
    if (!workspaceId) return;
    setError(null);
    setLoadingConversations(true);
    try {
      const data = await listConversations(workspaceId);
      const next = Array.isArray(data) ? data : [];
      setConversations(next);
      if (requestedConversationId) {
        setSelectedConversationId(requestedConversationId);
      } else if (requestedPhone) {
        const normalize = (value?: string | null) => (value || '').replace(/\D/g, '');
        const target = normalize(requestedPhone);
        const matched = next.find((conversation) =>
          normalize(conversation.contact?.phone).includes(target),
        );
        if (matched?.id) setSelectedConversationId(matched.id);
      } else if (!selectedConversationId && next[0]?.id) {
        setSelectedConversationId(next[0].id);
      }
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar conversas');
    } finally {
      setLoadingConversations(false);
    }
  };

  const refreshAgents = async () => {
    if (!workspaceId) return;
    try {
      const data = await listInboxAgents(workspaceId);
      setAgents(Array.isArray(data) ? data : []);
    } catch {
      setAgents([]);
    }
  };

  const handleSelectConversation = async (conversationId: string) => {
    setSelectedConversationId(conversationId);
    await loadMessages(conversationId);
    await refreshConversations();
  };

  const handleCloseConversation = async () => {
    if (!selectedConversationId) return;
    setError(null);
    try {
      await closeConversation(selectedConversationId);
      await refreshConversations();
    } catch (e: any) {
      setError(e?.message || 'Falha ao fechar conversa');
    }
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated && workspaceId) {
      refreshConversations();
      refreshAgents();
    }
  }, [isLoading, isAuthenticated, workspaceId]);

  useEffect(() => {
    if (!selectedConversationId) return;
    loadMessages(selectedConversationId);
  }, [selectedConversationId]);

  useEffect(() => {
    if (requestedDraft && !replyText) {
      setReplyText(requestedDraft);
    }
  }, [requestedDraft, replyText]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectedIdRef = useRef(selectedConversationId);
  selectedIdRef.current = selectedConversationId;

  useEffect(() => {
    if (!isConnected || !workspaceId) return;

    const unsubNewMsg = subscribe('message:new', (payload: any) => {
      refreshConversations();
      const newMsg = payload.message || payload;
      const convId = payload.conversationId ?? newMsg.conversationId;
      if (convId && convId === selectedIdRef.current && newMsg?.id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      }
    });

    const unsubConvUpdate = subscribe('conversation:update', () => {
      refreshConversations();
    });

    return () => {
      unsubNewMsg();
      unsubConvUpdate();
    };
  }, [isConnected, workspaceId, subscribe]);

  if (!isLoading && !isAuthenticated) {
    return (
      <div className={embedded ? 'w-full' : 'mx-auto max-w-3xl px-6 py-10'}>
        <div className="rounded-2xl border border-[#222226] bg-[#111113] p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-[#E0DDD8]">{title}</h1>
          <p className="mt-2 text-base text-[#6E6E73]">
            Faça login para visualizar e operar suas conversas.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={() => openAuthModal('login')}
              className="rounded-xl bg-[#E85D30] px-4 py-2 text-base font-semibold text-[#0A0A0C]"
            >
              Entrar
            </button>
            <Link href="/" className="text-base font-medium text-[#6E6E73] hover:text-[#E0DDD8]">
              Voltar ao chat
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoading && isAuthenticated && !workspaceId) {
    return (
      <div className={embedded ? 'w-full' : 'mx-auto max-w-3xl px-6 py-10'}>
        <div className="rounded-2xl border border-[#222226] bg-[#111113] p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-[#E0DDD8]">{title}</h1>
          <p className="mt-2 text-base text-[#6E6E73]">
            Workspace não configurado para esta sessão.
          </p>
          <div className="mt-6">
            <Link href="/" className="text-base font-medium text-[#6E6E73] hover:text-[#E0DDD8]">
              Voltar ao chat
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={embedded ? 'w-full' : 'mx-auto max-w-6xl'}
      style={{
        ...INBOX_RESPONSIVE_VARS,
        ...(embedded ? {} : { padding: 'var(--inbox-page-y) var(--inbox-page-x)' }),
      }}
    >
      {showHeader ? (
        <div className="mb-[var(--inbox-shell-gap)] flex flex-wrap items-center justify-between gap-[var(--inbox-item-gap)]">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[length:var(--inbox-title)] font-semibold text-[#E0DDD8]">
                {title}
              </h1>
              {isConnected && (
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-[var(--inbox-chip-x)] py-[var(--inbox-chip-y)] text-[length:var(--inbox-body-xs)] font-medium text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Conectado em tempo real
                </span>
              )}
            </div>
            <p className="mt-1 text-[length:var(--inbox-body)] text-[#6E6E73]">{description}</p>
          </div>

          <div className="flex flex-wrap items-center gap-[var(--inbox-item-gap)]">
            {headerActions}
            {showUtilityLinks ? (
              <>
                <Link
                  href="/followups"
                  className="text-[length:var(--inbox-body)] font-medium text-[#6E6E73] hover:text-[#E0DDD8]"
                >
                  Follow-ups
                </Link>
                <Link
                  href="/marketing/whatsapp?mode=broadcast"
                  className="text-[length:var(--inbox-body)] font-medium text-[#6E6E73] hover:text-[#E0DDD8]"
                >
                  Broadcast
                </Link>
                <Link
                  href="/leads"
                  className="text-[length:var(--inbox-body)] font-medium text-[#6E6E73] hover:text-[#E0DDD8]"
                >
                  Leads
                </Link>
                <Link
                  href="/"
                  className="text-[length:var(--inbox-body)] font-medium text-[#6E6E73] hover:text-[#E0DDD8]"
                >
                  Voltar ao chat
                </Link>
              </>
            ) : null}
            <button
              onClick={refreshConversations}
              disabled={loadingConversations}
              className="rounded-[var(--inbox-radius)] border border-[#222226] bg-[#111113] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body)] font-semibold text-[#E0DDD8] hover:bg-[#19191C] disabled:opacity-50"
            >
              Atualizar
            </button>
          </div>
        </div>
      ) : null}

      {showContextBanner && (sourceLabel || requestedPhone || requestedConversationId) ? (
        <div className="mb-[var(--inbox-shell-gap)] rounded-[var(--inbox-radius)] border border-[#222226] bg-[#111113] px-[var(--inbox-panel-x)] py-[var(--inbox-panel-y)]">
          <div className="flex flex-wrap items-center justify-between gap-[var(--inbox-item-gap)]">
            <div>
              <p className="text-[length:var(--inbox-body-xs)] font-semibold uppercase tracking-[0.12em] text-[#6E6E73]">
                Contexto operacional
              </p>
              <p className="mt-1 text-[length:var(--inbox-body)] text-[#E0DDD8]">
                {sourceLabel
                  ? `Voce chegou aqui via ${sourceLabel.toLowerCase()}.`
                  : 'Conversa destacada para acao.'}{' '}
                Assuma, responda ou devolva para a IA sem sair do fluxo comercial.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/flow"
                className="rounded-[var(--inbox-radius)] border border-[#222226] bg-[#19191C] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[#E0DDD8] hover:bg-[#222226]"
              >
                Abrir Flow
              </Link>
              <Link
                href="/analytics?tab=abandonos"
                className="rounded-[var(--inbox-radius)] border border-[#222226] bg-[#19191C] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[#E0DDD8] hover:bg-[#222226]"
              >
                Ver abandonos
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mb-[var(--inbox-shell-gap)] flex items-center gap-3 rounded-[var(--inbox-radius)] border border-red-200 bg-red-50 px-[var(--inbox-panel-x)] py-[var(--inbox-panel-y)] text-[length:var(--inbox-body)] text-red-700">
          <XCircle
            className="text-red-700"
            style={{ width: 'var(--inbox-icon-sm)', height: 'var(--inbox-icon-sm)' }}
          />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-[var(--inbox-shell-gap)] lg:grid-cols-12">
        <div className="lg:col-span-4">
          <div className="rounded-[var(--inbox-radius)] border border-[#222226] bg-[#111113] shadow-sm">
            <div className="flex items-center justify-between border-b border-[#222226] px-[var(--inbox-panel-x)] py-[var(--inbox-panel-y)]">
              <div className="flex items-center gap-2">
                <MessageSquare
                  className="text-[#6E6E73]"
                  style={{ width: 'var(--inbox-icon-sm)', height: 'var(--inbox-icon-sm)' }}
                />
                <span className="text-[length:var(--inbox-section-title)] font-semibold text-[#E0DDD8]">
                  Conversas
                </span>
              </div>
              <span className="text-[length:var(--inbox-body-xs)] text-[#6E6E73]">
                {filteredConversations.length}/{conversations.length}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1 border-b border-[#222226] px-[var(--inbox-panel-x)] py-[calc(var(--inbox-chip-y)+2px)]">
              {(
                [
                  ['all', 'Todos'],
                  ['whatsapp', 'WhatsApp'],
                  ['email', 'Email'],
                  ['instagram', 'Instagram'],
                ] as [ChannelFilter, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setChannelFilter(value)}
                  className={`rounded-[calc(var(--inbox-radius)-10px)] px-[var(--inbox-chip-x)] py-[var(--inbox-chip-y)] text-[length:var(--inbox-body-xs)] font-semibold transition-colors ${
                    channelFilter === value
                      ? 'bg-[#E85D30] text-[#0A0A0C]'
                      : 'bg-[#19191C] text-[#6E6E73] hover:text-[#E0DDD8]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1 border-b border-[#222226] px-[var(--inbox-panel-x)] py-[calc(var(--inbox-chip-y)+2px)]">
              {(
                [
                  ['open', 'Abertas'],
                  ['closed', 'Fechadas'],
                  ['all', 'Todas'],
                ] as [StatusFilter, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setStatusFilter(value)}
                  className={`rounded-[calc(var(--inbox-radius)-10px)] px-[var(--inbox-chip-x)] py-[var(--inbox-chip-y)] text-[length:var(--inbox-body-xs)] font-semibold transition-colors ${
                    statusFilter === value
                      ? 'bg-[#E85D30] text-[#0A0A0C]'
                      : 'bg-[#19191C] text-[#6E6E73] hover:text-[#E0DDD8]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="max-h-[clamp(420px,60vh,720px)] overflow-y-auto">
              {loadingConversations ? (
                <div className="flex items-center justify-center px-[var(--inbox-panel-x)] py-10">
                  <Loader2
                    className="animate-spin text-[#6E6E73]"
                    style={{ width: 'var(--inbox-icon-md)', height: 'var(--inbox-icon-md)' }}
                  />
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="px-[var(--inbox-panel-x)] py-10 text-center">
                  <p className="text-[length:var(--inbox-body)] font-medium text-[#E0DDD8]">
                    Sem conversas
                  </p>
                  <p className="mt-1 text-[length:var(--inbox-body-xs)] text-[#6E6E73]">
                    {requestedPhone
                      ? 'Nao encontramos uma conversa ativa para este contato ainda.'
                      : 'Quando mensagens chegarem, elas aparecem aqui.'}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <Link
                      href="/leads"
                      className="rounded-[var(--inbox-radius)] border border-[#222226] bg-[#19191C] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                    >
                      Revisar leads
                    </Link>
                    <Link
                      href="/marketing/whatsapp?mode=broadcast"
                      className="rounded-[var(--inbox-radius)] border border-[#222226] bg-[#19191C] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                    >
                      Abrir broadcast
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-[#222226]">
                  {filteredConversations.map((c) => {
                    const isActive = c.id === selectedConversationId;
                    const name = c.contact?.name || c.contact?.phone || 'Contato';
                    const phone = c.contact?.phone || '';
                    const isHandledByHuman = !!c.assignedAgent;
                    return (
                      <button
                        key={c.id}
                        onClick={() => handleSelectConversation(c.id)}
                        className={`w-full px-[var(--inbox-panel-x)] py-[var(--inbox-panel-y)] text-left transition-colors ${isActive ? 'bg-[#19191C]' : 'hover:bg-[#19191C]'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex items-center gap-2">
                            {isHandledByHuman ? (
                              <span
                                className="flex shrink-0 items-center gap-1 rounded-full bg-[#E85D30]/15 px-[var(--inbox-chip-x)] py-[2px] text-[length:var(--inbox-body-xs)] font-semibold text-[#E85D30]"
                                title={c.assignedAgent?.name || 'Agente'}
                              >
                                <UserIcon
                                  style={{
                                    width: 'calc(var(--inbox-icon-sm) - 2px)',
                                    height: 'calc(var(--inbox-icon-sm) - 2px)',
                                  }}
                                />
                              </span>
                            ) : (
                              <span
                                className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-[var(--inbox-chip-x)] py-[2px] text-[length:var(--inbox-body-xs)] font-semibold text-emerald-400"
                                title="IA"
                              >
                                <Bot
                                  style={{
                                    width: 'calc(var(--inbox-icon-sm) - 2px)',
                                    height: 'calc(var(--inbox-icon-sm) - 2px)',
                                  }}
                                />
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-[length:var(--inbox-body)] font-semibold text-[#E0DDD8]">
                                {name}
                              </p>
                              {phone ? (
                                <p className="mt-0.5 truncate text-[length:var(--inbox-body-xs)] text-[#6E6E73]">
                                  {phone}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {c.unreadCount ? (
                              <span className="rounded-full bg-[#E85D30] px-[var(--inbox-chip-x)] py-[2px] text-[length:var(--inbox-body-xs)] font-semibold text-[#0A0A0C]">
                                {c.unreadCount}
                              </span>
                            ) : null}
                            <span className="text-[length:var(--inbox-body-xs)] text-[#6E6E73]">
                              {formatTime(c.lastMessageAt)}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[length:var(--inbox-body-xs)] text-[#6E6E73]">
                          <span className="rounded-full bg-[#19191C] px-[var(--inbox-chip-x)] py-[2px]">
                            {c.status || ''}
                          </span>
                          {c.channel ? (
                            <span className="rounded-full bg-[#19191C] px-[var(--inbox-chip-x)] py-[2px]">
                              {c.channel}
                            </span>
                          ) : null}
                          {isHandledByHuman ? (
                            <span className="rounded-full bg-[#E85D30]/10 px-[var(--inbox-chip-x)] py-[2px] text-[#E85D30]">
                              {c.assignedAgent?.name || 'Agente'}
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-500/10 px-[var(--inbox-chip-x)] py-[2px] text-emerald-400">
                              IA
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-8">
          <div className="rounded-[var(--inbox-radius)] border border-[#222226] bg-[#111113] shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-[var(--inbox-item-gap)] border-b border-[#222226] px-[var(--inbox-panel-x)] py-[var(--inbox-panel-y)]">
              <div className="min-w-0">
                <p className="truncate text-[length:var(--inbox-section-title)] font-semibold text-[#E0DDD8]">
                  {selectedConversation?.contact?.name ||
                    selectedConversation?.contact?.phone ||
                    'Selecione uma conversa'}
                </p>
                <p className="mt-0.5 truncate text-[length:var(--inbox-body-xs)] text-[#6E6E73]">
                  {selectedConversation?.contact?.phone || ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {selectedConversation ? (
                  selectedConversation.assignedAgent ? (
                    <span className="flex items-center gap-1.5 rounded-[calc(var(--inbox-radius)-10px)] bg-[#E85D30]/10 px-[var(--inbox-chip-x)] py-[var(--inbox-chip-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[#E85D30]">
                      <UserIcon
                        style={{ width: 'var(--inbox-icon-sm)', height: 'var(--inbox-icon-sm)' }}
                      />
                      {selectedConversation.assignedAgent.name || 'Agente'}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 rounded-[calc(var(--inbox-radius)-10px)] bg-emerald-500/10 px-[var(--inbox-chip-x)] py-[var(--inbox-chip-y)] text-[length:var(--inbox-body-xs)] font-semibold text-emerald-400">
                      <Bot
                        style={{ width: 'var(--inbox-icon-sm)', height: 'var(--inbox-icon-sm)' }}
                      />
                      IA
                    </span>
                  )
                ) : null}

                {selectedConversationId && !selectedConversation?.assignedAgent ? (
                  <button
                    onClick={handleAssumir}
                    disabled={assigning}
                    className="rounded-[var(--inbox-radius)] border border-[#E85D30]/30 bg-[#E85D30]/10 px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[#E85D30] hover:bg-[#E85D30]/20 disabled:opacity-50"
                  >
                    {assigning ? '...' : 'Assumir conversa'}
                  </button>
                ) : null}
                {selectedConversationId && selectedConversation?.assignedAgent ? (
                  <button
                    onClick={handleDevolverIA}
                    disabled={assigning}
                    className="rounded-[var(--inbox-radius)] border border-emerald-500/30 bg-emerald-500/10 px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"
                  >
                    {assigning ? '...' : 'Devolver para IA'}
                  </button>
                ) : null}

                {selectedConversationId && agents.length > 0 ? (
                  <select
                    value={selectedConversation?.assignedAgent?.id || ''}
                    disabled={assigning}
                    onChange={async (e) => {
                      if (!selectedConversationId) return;
                      setAssigning(true);
                      setError(null);
                      try {
                        await assignConversation(selectedConversationId, e.target.value);
                        await refreshConversations();
                      } catch (err: any) {
                        setError(err?.message || 'Falha ao atribuir agente');
                      } finally {
                        setAssigning(false);
                      }
                    }}
                    className="hidden max-w-[180px] rounded-[var(--inbox-radius)] border border-[#222226] bg-[#111113] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[#E0DDD8] hover:bg-[#19191C] disabled:opacity-50 lg:block"
                    title="Atribuir agente"
                  >
                    <option value="">Não atribuído</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.isOnline ? '(online) ' : ''}
                        {a.name}
                      </option>
                    ))}
                  </select>
                ) : null}

                <button
                  onClick={() => {
                    const href = buildDashboardHref({
                      source: 'inbox',
                      leadId: selectedConversation?.contactId || '',
                      phone: selectedConversation?.contact?.phone || requestedPhone || '',
                      name: selectedConversation?.contact?.name || '',
                      purpose: 'handoff',
                      draft: requestedDraft || '',
                    });
                    router.push(href);
                  }}
                  disabled={!selectedConversation && !requestedPhone}
                  className="rounded-[var(--inbox-radius)] border border-[#222226] bg-[#111113] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[#E0DDD8] hover:bg-[#19191C] disabled:opacity-50"
                >
                  Abrir com IA
                </button>
                <button
                  onClick={handleCloseConversation}
                  disabled={!selectedConversationId}
                  className="rounded-[var(--inbox-radius)] border border-[#222226] bg-[#111113] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[#E0DDD8] hover:bg-[#19191C] disabled:opacity-50"
                >
                  Fechar
                </button>
              </div>
            </div>

            <div className="max-h-[clamp(380px,55vh,680px)] overflow-y-auto px-[var(--inbox-panel-x)] py-[var(--inbox-panel-y)]">
              {loadingMessages ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2
                    className="animate-spin text-[#6E6E73]"
                    style={{ width: 'var(--inbox-icon-md)', height: 'var(--inbox-icon-md)' }}
                  />
                </div>
              ) : !selectedConversationId ? (
                <div className="py-10 text-center">
                  <p className="text-[length:var(--inbox-body)] font-medium text-[#E0DDD8]">
                    Selecione uma conversa
                  </p>
                  <p className="mt-1 text-[length:var(--inbox-body-xs)] text-[#6E6E73]">
                    {requestedPhone && !matchedConversationByPhone
                      ? 'Nao existe conversa ativa para este telefone. Voce pode voltar ao lead, abrir um broadcast ou preparar um flow.'
                      : 'Escolha uma conversa à esquerda para ver as mensagens.'}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <Link
                      href="/leads"
                      className="rounded-[var(--inbox-radius)] border border-[#222226] bg-[#19191C] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                    >
                      Voltar para Leads
                    </Link>
                    <Link
                      href={buildDashboardHref({
                        source: 'inbox',
                        leadId: selectedConversation?.contactId || '',
                        phone: requestedPhone || '',
                        purpose: 'handoff',
                        draft: requestedDraft || '',
                      })}
                      className="rounded-[var(--inbox-radius)] border border-[#222226] bg-[#19191C] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                    >
                      Pedir plano para IA
                    </Link>
                    <Link
                      href="/followups"
                      className="rounded-[var(--inbox-radius)] border border-[#222226] bg-[#19191C] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                    >
                      Abrir follow-ups
                    </Link>
                    <Link
                      href="/marketing/whatsapp?mode=broadcast"
                      className="rounded-[var(--inbox-radius)] border border-[#222226] bg-[#19191C] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                    >
                      Acionar marketing
                    </Link>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-[length:var(--inbox-body)] font-medium text-[#E0DDD8]">
                    Sem mensagens
                  </p>
                  <p className="mt-1 text-[length:var(--inbox-body-xs)] text-[#6E6E73]">
                    Esta conversa ainda não possui mensagens.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((m) => {
                    const isInbound = m.direction === 'INBOUND';
                    return (
                      <div
                        key={m.id}
                        className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`max-w-[90%] rounded-[calc(var(--inbox-radius)-4px)] px-[var(--inbox-message-x)] py-[var(--inbox-message-y)] text-[length:var(--inbox-body)] ${
                            isInbound
                              ? 'bg-[#19191C] text-[#E0DDD8]'
                              : 'bg-[#E85D30] text-[#0A0A0C]'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{m.content || ''}</p>
                          <div
                            className={`mt-1 text-[length:var(--inbox-body-xs)] ${isInbound ? 'text-[#6E6E73]' : 'text-[#0A0A0C]/70'}`}
                          >
                            {formatTime(m.createdAt)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {selectedConversationId ? (
              <div className="border-t border-[#222226] px-[var(--inbox-panel-x)] py-[var(--inbox-panel-y)]">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendReply();
                  }}
                  className="flex flex-col gap-2 sm:flex-row sm:items-center"
                >
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Escreva uma resposta..."
                    disabled={sending}
                    className="flex-1 rounded-[var(--inbox-radius)] border border-[#222226] bg-[#19191C] px-[var(--inbox-input-x)] py-[var(--inbox-input-y)] text-[length:var(--inbox-body)] text-[#E0DDD8] placeholder-[#6E6E73] outline-none focus:border-[#E85D30]/50 focus:ring-1 focus:ring-[#E85D30]/30 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={sending || !replyText.trim()}
                    className="flex shrink-0 items-center justify-center rounded-[var(--inbox-radius)] bg-[#E85D30] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[#0A0A0C] transition-colors hover:bg-[#E85D30]/90 disabled:opacity-40"
                    title="Enviar"
                  >
                    {sending ? (
                      <Loader2
                        className="animate-spin"
                        style={{ width: 'var(--inbox-icon-sm)', height: 'var(--inbox-icon-sm)' }}
                      />
                    ) : (
                      <Send
                        style={{ width: 'var(--inbox-icon-sm)', height: 'var(--inbox-icon-sm)' }}
                      />
                    )}
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default InboxWorkspace;
