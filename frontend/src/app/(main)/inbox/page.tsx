'use client';

// PULSE:OK — Inbox uses manual state + WebSocket real-time updates (refreshConversations/loadMessages after every write). No SWR hooks to invalidate.

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useRef, useState } from 'react';
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

/* ── Filter types ── */
type ChannelFilter = 'all' | 'whatsapp' | 'email' | 'instagram';
type StatusFilter = 'open' | 'closed' | 'all';

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

export default function InboxPage() {
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

  /* ── Filters ── */
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');

  /* ── Reply ── */
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

  /* ── Filtered conversations ── */
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      // Channel filter
      if (channelFilter !== 'all') {
        const ch = (c.channel || 'whatsapp').toLowerCase();
        if (ch !== channelFilter) return false;
      }
      // Status filter
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

  /* ── Handover helpers ── */
  const handleAssumir = async () => {
    if (!selectedConversationId || !user) return;
    setAssigning(true);
    setError(null);
    try {
      // Use current user's id as agent id for handover
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

  /* ── Reply ── */
  const handleSendReply = async () => {
    if (!selectedConversationId || !replyText.trim()) return;
    setSending(true);
    setError(null);
    try {
      // DECISÃO AUTÔNOMA: reply endpoint TBD — using POST /inbox/conversations/:id/reply
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
      // Reload messages to show the new one
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
      setConversations(Array.isArray(data) ? data : []);
      if (requestedConversationId) {
        setSelectedConversationId(requestedConversationId);
      } else if (requestedPhone) {
        const normalize = (value?: string | null) => (value || '').replace(/\D/g, '');
        const target = normalize(requestedPhone);
        const matched = (Array.isArray(data) ? data : []).find((conversation) =>
          normalize(conversation.contact?.phone).includes(target),
        );
        if (matched?.id) setSelectedConversationId(matched.id);
      } else if (!selectedConversationId && data?.[0]?.id) {
        setSelectedConversationId(data[0].id);
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
      // Agents list is optional for basic inbox usage
      setAgents([]);
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

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* ── WebSocket real-time updates ── */
  const selectedIdRef = useRef(selectedConversationId);
  selectedIdRef.current = selectedConversationId;

  useEffect(() => {
    if (!isConnected || !workspaceId) return;

    const unsubNewMsg = subscribe('message:new', (payload: any) => {
      // Always refresh conversation list (updates last message, unread count, ordering)
      refreshConversations();
      // If the message belongs to the currently-open conversation, append it
      if (
        payload?.conversationId &&
        payload.conversationId === selectedIdRef.current &&
        payload.message
      ) {
        setMessages((prev) => {
          // Avoid duplicates
          if (prev.some((m) => m.id === payload.message.id)) return prev;
          return [...prev, payload.message];
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
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-2xl border border-[#222226] bg-[#111113] p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-[#E0DDD8]">Inbox</h1>
          <p className="mt-2 text-sm text-[#6E6E73]">
            Faça login para visualizar e operar suas conversas.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={() => openAuthModal('login')}
              className="rounded-xl bg-[#E85D30] px-4 py-2 text-sm font-semibold text-[#0A0A0C]"
            >
              Entrar
            </button>
            <Link href="/" className="text-sm font-medium text-[#6E6E73] hover:text-[#E0DDD8]">
              Voltar ao chat
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoading && isAuthenticated && !workspaceId) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="rounded-2xl border border-[#222226] bg-[#111113] p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-[#E0DDD8]">Inbox</h1>
          <p className="mt-2 text-sm text-[#6E6E73]">Workspace não configurado para esta sessão.</p>
          <div className="mt-6">
            <Link href="/" className="text-sm font-medium text-[#6E6E73] hover:text-[#E0DDD8]">
              Voltar ao chat
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-[#E0DDD8]">Inbox</h1>
            {isConnected && (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Conectado em tempo real
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-[#6E6E73]">
            Converse, feche e acompanhe conversas de todos os canais.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/followups"
            className="text-sm font-medium text-[#6E6E73] hover:text-[#E0DDD8]"
          >
            Follow-ups
          </Link>
          <Link
            href="/marketing/whatsapp?mode=broadcast"
            className="text-sm font-medium text-[#6E6E73] hover:text-[#E0DDD8]"
          >
            Broadcast
          </Link>
          <Link href="/leads" className="text-sm font-medium text-[#6E6E73] hover:text-[#E0DDD8]">
            Leads
          </Link>
          <Link href="/" className="text-sm font-medium text-[#6E6E73] hover:text-[#E0DDD8]">
            Voltar ao chat
          </Link>
          <button
            onClick={refreshConversations}
            disabled={loadingConversations}
            className="rounded-xl border border-[#222226] bg-[#111113] px-4 py-2 text-sm font-semibold text-[#E0DDD8] hover:bg-[#19191C] disabled:opacity-50"
          >
            Atualizar
          </button>
        </div>
      </div>

      {(sourceLabel || requestedPhone || requestedConversationId) && (
        <div className="mb-6 rounded-2xl border border-[#222226] bg-[#111113] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6E6E73]">
                Contexto operacional
              </p>
              <p className="mt-1 text-sm text-[#E0DDD8]">
                {sourceLabel
                  ? `Voce chegou aqui via ${sourceLabel.toLowerCase()}.`
                  : 'Conversa destacada para acao.'}{' '}
                Assuma, responda ou devolva para a IA sem sair do fluxo comercial.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/flow"
                className="rounded-xl border border-[#222226] bg-[#19191C] px-3 py-2 text-xs font-semibold text-[#E0DDD8] hover:bg-[#222226]"
              >
                Abrir Flow
              </Link>
              <Link
                href="/analytics?tab=abandonos"
                className="rounded-xl border border-[#222226] bg-[#19191C] px-3 py-2 text-xs font-semibold text-[#E0DDD8] hover:bg-[#222226]"
              >
                Ver abandonos
              </Link>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <XCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: conversation list */}
        <div className="lg:col-span-4">
          <div className="rounded-2xl border border-[#222226] bg-[#111113] shadow-sm">
            <div className="flex items-center justify-between border-b border-[#222226] px-5 py-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-[#6E6E73]" />
                <span className="text-sm font-semibold text-[#E0DDD8]">Conversas</span>
              </div>
              <span className="text-xs text-[#6E6E73]">
                {filteredConversations.length}/{conversations.length}
              </span>
            </div>

            {/* ── Channel filter ── */}
            <div className="flex items-center gap-1 border-b border-[#222226] px-4 py-2">
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
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    channelFilter === value
                      ? 'bg-[#E85D30] text-[#0A0A0C]'
                      : 'bg-[#19191C] text-[#6E6E73] hover:text-[#E0DDD8]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ── Status filter ── */}
            <div className="flex items-center gap-1 border-b border-[#222226] px-4 py-2">
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
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    statusFilter === value
                      ? 'bg-[#E85D30] text-[#0A0A0C]'
                      : 'bg-[#19191C] text-[#6E6E73] hover:text-[#E0DDD8]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {loadingConversations ? (
                <div className="flex items-center justify-center px-5 py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-[#6E6E73]" />
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm font-medium text-[#E0DDD8]">Sem conversas</p>
                  <p className="mt-1 text-xs text-[#6E6E73]">
                    {requestedPhone
                      ? 'Nao encontramos uma conversa ativa para este contato ainda.'
                      : 'Quando mensagens chegarem, elas aparecem aqui.'}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <Link
                      href="/leads"
                      className="rounded-xl border border-[#222226] bg-[#19191C] px-3 py-2 text-xs font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                    >
                      Revisar leads
                    </Link>
                    <Link
                      href="/marketing/whatsapp?mode=broadcast"
                      className="rounded-xl border border-[#222226] bg-[#19191C] px-3 py-2 text-xs font-semibold text-[#E0DDD8] hover:bg-[#222226]"
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
                        className={`w-full px-5 py-4 text-left transition-colors ${isActive ? 'bg-[#19191C]' : 'hover:bg-[#19191C]'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex items-center gap-2">
                            {/* Handover indicator badge */}
                            {isHandledByHuman ? (
                              <span
                                className="flex shrink-0 items-center gap-1 rounded-full bg-[#E85D30]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#E85D30]"
                                title={c.assignedAgent?.name || 'Agente'}
                              >
                                <UserIcon className="h-3 w-3" />
                              </span>
                            ) : (
                              <span
                                className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400"
                                title="IA"
                              >
                                <Bot className="h-3 w-3" />
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[#E0DDD8]">
                                {name}
                              </p>
                              {phone && (
                                <p className="mt-0.5 truncate text-xs text-[#6E6E73]">{phone}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {c.unreadCount ? (
                              <span className="rounded-full bg-[#E85D30] px-2 py-0.5 text-[11px] font-semibold text-[#0A0A0C]">
                                {c.unreadCount}
                              </span>
                            ) : null}
                            <span className="text-[11px] text-[#6E6E73]">
                              {formatTime(c.lastMessageAt)}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-[#6E6E73]">
                          <span className="rounded-full bg-[#19191C] px-2 py-0.5">
                            {c.status || ''}
                          </span>
                          {c.channel && (
                            <span className="rounded-full bg-[#19191C] px-2 py-0.5">
                              {c.channel}
                            </span>
                          )}
                          {isHandledByHuman ? (
                            <span className="rounded-full bg-[#E85D30]/10 px-2 py-0.5 text-[#E85D30]">
                              {c.assignedAgent?.name || 'Agente'}
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-400">
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

        {/* Right: messages */}
        <div className="lg:col-span-8">
          <div className="rounded-2xl border border-[#222226] bg-[#111113] shadow-sm">
            <div className="flex items-center justify-between border-b border-[#222226] px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#E0DDD8]">
                  {selectedConversation?.contact?.name ||
                    selectedConversation?.contact?.phone ||
                    'Selecione uma conversa'}
                </p>
                <p className="mt-0.5 truncate text-xs text-[#6E6E73]">
                  {selectedConversation?.contact?.phone || ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Handover status indicator */}
                {selectedConversation &&
                  (selectedConversation.assignedAgent ? (
                    <span className="flex items-center gap-1.5 rounded-lg bg-[#E85D30]/10 px-2.5 py-1.5 text-[11px] font-semibold text-[#E85D30]">
                      <UserIcon className="h-3.5 w-3.5" />
                      {selectedConversation.assignedAgent.name || 'Agente'}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-400">
                      <Bot className="h-3.5 w-3.5" />
                      IA
                    </span>
                  ))}

                {/* Handover action buttons */}
                {selectedConversationId && !selectedConversation?.assignedAgent && (
                  <button
                    onClick={handleAssumir}
                    disabled={assigning}
                    className="rounded-xl border border-[#E85D30]/30 bg-[#E85D30]/10 px-3 py-2 text-xs font-semibold text-[#E85D30] hover:bg-[#E85D30]/20 disabled:opacity-50"
                  >
                    {assigning ? '...' : 'Assumir conversa'}
                  </button>
                )}
                {selectedConversationId && selectedConversation?.assignedAgent && (
                  <button
                    onClick={handleDevolverIA}
                    disabled={assigning}
                    className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"
                  >
                    {assigning ? '...' : 'Devolver para IA'}
                  </button>
                )}

                {/* Agent select (existing, kept for advanced usage) */}
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
                    className="hidden max-w-[180px] rounded-xl border border-[#222226] bg-[#111113] px-3 py-2 text-xs font-semibold text-[#E0DDD8] hover:bg-[#19191C] disabled:opacity-50 lg:block"
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
                      phone: selectedConversation?.contact?.phone || requestedPhone || '',
                      name: selectedConversation?.contact?.name || '',
                      draft: requestedDraft || '',
                    });
                    router.push(href);
                  }}
                  disabled={!selectedConversation && !requestedPhone}
                  className="rounded-xl border border-[#222226] bg-[#111113] px-3 py-2 text-xs font-semibold text-[#E0DDD8] hover:bg-[#19191C] disabled:opacity-50"
                >
                  Abrir com IA
                </button>
                <button
                  onClick={handleCloseConversation}
                  disabled={!selectedConversationId}
                  className="rounded-xl border border-[#222226] bg-[#111113] px-3 py-2 text-xs font-semibold text-[#E0DDD8] hover:bg-[#19191C] disabled:opacity-50"
                >
                  Fechar
                </button>
              </div>
            </div>

            <div className="max-h-[55vh] overflow-y-auto px-5 py-4">
              {loadingMessages ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-[#6E6E73]" />
                </div>
              ) : !selectedConversationId ? (
                <div className="py-10 text-center">
                  <p className="text-sm font-medium text-[#E0DDD8]">Selecione uma conversa</p>
                  <p className="mt-1 text-xs text-[#6E6E73]">
                    {requestedPhone && !matchedConversationByPhone
                      ? 'Nao existe conversa ativa para este telefone. Voce pode voltar ao lead, abrir um broadcast ou preparar um flow.'
                      : 'Escolha uma conversa à esquerda para ver as mensagens.'}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <Link
                      href="/leads"
                      className="rounded-xl border border-[#222226] bg-[#19191C] px-3 py-2 text-xs font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                    >
                      Voltar para Leads
                    </Link>
                    <Link
                      href={buildDashboardHref({
                        source: 'inbox',
                        phone: requestedPhone || '',
                        draft: requestedDraft || '',
                      })}
                      className="rounded-xl border border-[#222226] bg-[#19191C] px-3 py-2 text-xs font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                    >
                      Pedir plano para IA
                    </Link>
                    <Link
                      href="/followups"
                      className="rounded-xl border border-[#222226] bg-[#19191C] px-3 py-2 text-xs font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                    >
                      Abrir follow-ups
                    </Link>
                    <Link
                      href="/marketing/whatsapp?mode=broadcast"
                      className="rounded-xl border border-[#222226] bg-[#19191C] px-3 py-2 text-xs font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                    >
                      Acionar marketing
                    </Link>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm font-medium text-[#E0DDD8]">Sem mensagens</p>
                  <p className="mt-1 text-xs text-[#6E6E73]">
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
                          className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                            isInbound
                              ? 'bg-[#19191C] text-[#E0DDD8]'
                              : 'bg-[#E85D30] text-[#0A0A0C]'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{m.content || ''}</p>
                          <div
                            className={`mt-1 text-[11px] ${isInbound ? 'text-[#6E6E73]' : 'text-[#0A0A0C]/70'}`}
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

            {/* ── Reply input ── */}
            {selectedConversationId && (
              <div className="border-t border-[#222226] px-4 py-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendReply();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Escreva uma resposta..."
                    disabled={sending}
                    className="flex-1 rounded-xl border border-[#222226] bg-[#19191C] px-4 py-2.5 text-sm text-[#E0DDD8] placeholder-[#6E6E73] outline-none focus:border-[#E85D30]/50 focus:ring-1 focus:ring-[#E85D30]/30 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={sending || !replyText.trim()}
                    className="flex shrink-0 items-center justify-center rounded-xl bg-[#E85D30] p-2.5 text-[#0A0A0C] transition-colors hover:bg-[#E85D30]/90 disabled:opacity-40"
                    title="Enviar"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
