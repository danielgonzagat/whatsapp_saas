'use client';

import { kloelT } from '@/lib/i18n/t';
/** Dynamic. */
export const dynamic = 'force-dynamic';

import { useAuth } from '@/components/kloel/auth/auth-provider';
import { useSocket } from '@/hooks/useSocket';
import { buildDashboardHref } from '@/lib/kloel-dashboard-context';
import { Bot, Loader2, MessageSquare, Send, User as UserIcon, XCircle } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode } from 'react';
import {
  INBOX_RESPONSIVE_VARS,
  type StatusFilter,
  type ChannelFilter,
  formatInboxTime as formatTime,
} from './inbox-workspace-utils';
import { InboxConversationListItem } from './InboxConversationListItem';
import { InboxNoWorkspaceView } from './InboxNoWorkspaceView';
import { InboxNotAuthenticatedView } from './InboxNotAuthenticatedView';
import { useInboxData } from './useInboxData';
import { useInboxRealtime } from './useInboxRealtime';

interface InboxWorkspaceProps {
  embedded?: boolean;
  title?: string;
  description?: string;
  showHeader?: boolean;
  showUtilityLinks?: boolean;
  showContextBanner?: boolean;
  headerActions?: ReactNode;
}

/** Inbox workspace. */
export function InboxWorkspace({
  embedded = false,
  title = 'Conversas',
  description = 'Converse, feche e acompanhe conversas de todos os canais.',
  showHeader = true,
  showUtilityLinks = !embedded,
  showContextBanner = !embedded,
  headerActions,
}: InboxWorkspaceProps) {
  const { isAuthenticated, isLoading, workspace, user, openAuthModal } = useAuth();
  const workspaceId = workspace?.id;
  const { isConnected, subscribe } = useSocket();

  const {
    loadingConversations,
    loadingMessages,
    error,
    conversations,
    selectedConversationId,
    messages,
    setMessages,
    agents,
    assigning,
    channelFilter,
    setChannelFilter,
    statusFilter,
    setStatusFilter,
    replyText,
    setReplyText,
    sending,
    messagesEndRef,
    sourceLabel,
    selectedConversation,
    filteredConversations,
    matchedConversationByPhone,
    visualReady,
    handleAssumir,
    handleDevolverIA,
    handleSendReply,
    handleAssignAgent,
    refreshConversations,
    handleSelectConversation,
    handleCloseConversation,
    source,
    requestedPhone,
    requestedConversationId,
    requestedDraft,
    router,
  } = useInboxData({ workspaceId, isAuthenticated, isLoading, userId: user?.id ?? '' });

  useInboxRealtime({
    workspaceId,
    isConnected,
    subscribe,
    selectedConversationId,
    setMessages,
    refreshConversations,
  });

  if (!isLoading && !isAuthenticated) {
    return (
      <InboxNotAuthenticatedView
        embedded={embedded}
        title={title}
        onLogin={() => openAuthModal('login')}
      />
    );
  }

  if (!isLoading && isAuthenticated && !workspaceId) {
    return <InboxNoWorkspaceView embedded={embedded} title={title} />;
  }

  return (
    <div
      data-testid="inbox-workspace-root"
      data-ready={visualReady ? 'true' : 'false'}
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

                  {kloelT(`Conectado em tempo real`)}
                </span>
              )}
            </div>
            <p className="mt-1 text-[length:var(--inbox-body)] text-[#6E6E73]">{description}</p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <div className="flex flex-wrap items-center gap-[var(--inbox-item-gap)]">
              {headerActions}
              {showUtilityLinks ? (
                <>
                  <Link
                    href="/followups"
                    className="text-[length:var(--inbox-body)] font-medium text-[#6E6E73] hover:text-[#E0DDD8]"
                  >
                    {kloelT(`Follow-ups`)}
                  </Link>
                  <Link
                    href="/marketing/whatsapp?mode=broadcast"
                    className="text-[length:var(--inbox-body)] font-medium text-[#6E6E73] hover:text-[#E0DDD8]"
                  >
                    {kloelT(`Broadcast`)}
                  </Link>
                  <Link
                    href="/leads"
                    className="text-[length:var(--inbox-body)] font-medium text-[#6E6E73] hover:text-[#E0DDD8]"
                  >
                    {kloelT(`Leads`)}
                  </Link>
                  <Link
                    href="/"
                    className="text-[length:var(--inbox-body)] font-medium text-[#6E6E73] hover:text-[#E0DDD8]"
                  >
                    {kloelT(`Voltar ao chat`)}
                  </Link>
                </>
              ) : null}
            </div>
            <button
              type="button"
              onClick={refreshConversations}
              disabled={loadingConversations}
              className="self-start rounded-[var(--inbox-radius)] border border-[#222226] bg-[#111113] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body)] font-semibold text-[#E0DDD8] hover:bg-[#19191C] disabled:opacity-50 sm:self-auto"
            >
              {kloelT(`Atualizar`)}
            </button>
          </div>
        </div>
      ) : null}

      {showContextBanner && (sourceLabel || requestedPhone || requestedConversationId) ? (
        <div className="mb-[var(--inbox-shell-gap)] rounded-[var(--inbox-radius)] border border-[#222226] bg-[#111113] px-[var(--inbox-panel-x)] py-[var(--inbox-panel-y)]">
          <div className="flex flex-wrap items-center justify-between gap-[var(--inbox-item-gap)]">
            <div>
              <p className="text-[length:var(--inbox-body-xs)] font-semibold uppercase tracking-[0.12em] text-[#6E6E73]">
                {kloelT(`Contexto operacional`)}
              </p>
              <p className="mt-1 text-[length:var(--inbox-body)] text-[#E0DDD8]">
                {sourceLabel
                  ? `Voce chegou aqui via ${sourceLabel.toLowerCase()}.`
                  : 'Conversa destacada para acao.'}{' '}
                {kloelT(`Assuma, responda ou devolva para a IA sem sair do fluxo comercial.`)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/flow"
                className="rounded-[var(--inbox-radius)] border border-[#222226] bg-[#19191C] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[#E0DDD8] hover:bg-[#222226]"
              >
                {kloelT(`Abrir Flow`)}
              </Link>
              <Link
                href="/analytics?tab=abandonos"
                className="rounded-[var(--inbox-radius)] border border-[#222226] bg-[#19191C] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[#E0DDD8] hover:bg-[#222226]"
              >
                {kloelT(`Ver abandonos`)}
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
            aria-hidden="true"
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
                  aria-hidden="true"
                />
                <span className="text-[length:var(--inbox-section-title)] font-semibold text-[#E0DDD8]">
                  {kloelT(`Conversas`)}
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
                  type="button"
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
                  type="button"
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
                    aria-hidden="true"
                  />
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="px-[var(--inbox-panel-x)] py-10 text-center">
                  <p className="text-[length:var(--inbox-body)] font-medium text-[#E0DDD8]">
                    {kloelT(`Sem conversas`)}
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
                      {kloelT(`Revisar leads`)}
                    </Link>
                    <Link
                      href="/marketing/whatsapp?mode=broadcast"
                      className="rounded-[var(--inbox-radius)] border border-[#222226] bg-[#19191C] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                    >
                      {kloelT(`Abrir broadcast`)}
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-[#222226]">
                  {filteredConversations.map((c) => (
                    <InboxConversationListItem
                      key={c.id}
                      conversation={c}
                      isActive={c.id === selectedConversationId}
                      onSelect={handleSelectConversation}
                    />
                  ))}
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
                        aria-hidden="true"
                      />
                      {selectedConversation.assignedAgent.name || 'Agente'}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 rounded-[calc(var(--inbox-radius)-10px)] bg-emerald-500/10 px-[var(--inbox-chip-x)] py-[var(--inbox-chip-y)] text-[length:var(--inbox-body-xs)] font-semibold text-emerald-400">
                      <Bot
                        style={{ width: 'var(--inbox-icon-sm)', height: 'var(--inbox-icon-sm)' }}
                        aria-hidden="true"
                      />
                      IA
                    </span>
                  )
                ) : null}

                {selectedConversationId && !selectedConversation?.assignedAgent ? (
                  <button
                    type="button"
                    onClick={handleAssumir}
                    disabled={assigning}
                    className="rounded-[var(--inbox-radius)] border border-[#E85D30]/30 bg-[#E85D30]/10 px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[#E85D30] hover:bg-[#E85D30]/20 disabled:opacity-50"
                  >
                    {assigning ? '...' : 'Assumir conversa'}
                  </button>
                ) : null}
                {selectedConversationId && selectedConversation?.assignedAgent ? (
                  <button
                    type="button"
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
                      await handleAssignAgent(e.target.value);
                    }}
                    className="hidden max-w-[180px] rounded-[var(--inbox-radius)] border border-[#222226] bg-[#111113] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[#E0DDD8] hover:bg-[#19191C] disabled:opacity-50 lg:block"
                    title={kloelT(`Atribuir agente`)}
                  >
                    <option value="">{kloelT(`Não atribuído`)}</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.isOnline ? '(online) ' : ''}
                        {a.name}
                      </option>
                    ))}
                  </select>
                ) : null}

                <button
                  type="button"
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
                  {kloelT(`Abrir com IA`)}
                </button>
                <button
                  type="button"
                  onClick={handleCloseConversation}
                  disabled={!selectedConversationId}
                  className="rounded-[var(--inbox-radius)] border border-[#222226] bg-[#111113] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[#E0DDD8] hover:bg-[#19191C] disabled:opacity-50"
                >
                  {kloelT(`Fechar`)}
                </button>
              </div>
            </div>

            <div className="max-h-[clamp(380px,55vh,680px)] overflow-y-auto px-[var(--inbox-panel-x)] py-[var(--inbox-panel-y)]">
              {loadingMessages ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2
                    className="animate-spin text-[#6E6E73]"
                    style={{ width: 'var(--inbox-icon-md)', height: 'var(--inbox-icon-md)' }}
                    aria-hidden="true"
                  />
                </div>
              ) : !selectedConversationId ? (
                <div className="py-10 text-center">
                  <p className="text-[length:var(--inbox-body)] font-medium text-[#E0DDD8]">
                    {kloelT(`Selecione uma conversa`)}
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
                      {kloelT(`Voltar para Leads`)}
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
                      {kloelT(`Pedir plano para IA`)}
                    </Link>
                    <Link
                      href="/followups"
                      className="rounded-[var(--inbox-radius)] border border-[#222226] bg-[#19191C] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                    >
                      {kloelT(`Abrir follow-ups`)}
                    </Link>
                    <Link
                      href="/marketing/whatsapp?mode=broadcast"
                      className="rounded-[var(--inbox-radius)] border border-[#222226] bg-[#19191C] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[#E0DDD8] hover:bg-[#222226]"
                    >
                      {kloelT(`Acionar marketing`)}
                    </Link>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-[length:var(--inbox-body)] font-medium text-[#E0DDD8]">
                    {kloelT(`Sem mensagens`)}
                  </p>
                  <p className="mt-1 text-[length:var(--inbox-body-xs)] text-[#6E6E73]">
                    {kloelT(`Esta conversa ainda não possui mensagens.`)}
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
                    placeholder={kloelT(`Escreva uma resposta...`)}
                    disabled={sending}
                    className="flex-1 rounded-[var(--inbox-radius)] border border-[#222226] bg-[#19191C] px-[var(--inbox-input-x)] py-[var(--inbox-input-y)] text-[length:var(--inbox-body)] text-[#E0DDD8] placeholder-[#6E6E73] outline-none focus:border-[#E85D30]/50 focus:ring-1 focus:ring-[#E85D30]/30 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={sending || !replyText.trim()}
                    className="flex shrink-0 items-center justify-center rounded-[var(--inbox-radius)] bg-[#E85D30] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[#0A0A0C] transition-colors hover:bg-[#E85D30]/90 disabled:opacity-40"
                    title={kloelT(`Enviar`)}
                  >
                    {sending ? (
                      <Loader2
                        className="animate-spin"
                        style={{ width: 'var(--inbox-icon-sm)', height: 'var(--inbox-icon-sm)' }}
                        aria-hidden="true"
                      />
                    ) : (
                      <Send
                        style={{ width: 'var(--inbox-icon-sm)', height: 'var(--inbox-icon-sm)' }}
                        aria-hidden="true"
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
