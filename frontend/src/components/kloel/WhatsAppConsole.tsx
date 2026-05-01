'use client';

import { kloelT } from '@/lib/i18n/t';
// @deprecated Legacy lateral WhatsApp console kept only for isolated e2e/debug routes.
// The production chat experience now uses AgentDesktopViewer as the primary UI.

import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { useWhatsAppSession } from '@/hooks/useWhatsAppSession';
import { type Message as InboxMessage, whatsappApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ChevronLeft, MessageCircleMore, Power, RefreshCcw, Smartphone, X } from 'lucide-react';
import Image from 'next/image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentActivity } from './AgentConsole';
import { KloelMushroomVisual } from './KloelBrand';
import { colors } from '@/lib/design-tokens';
import {
  type ChatPreview,
  extractPreviewText,
  formatClock,
  normalizeChats,
  normalizeMessages,
  toIsoDateLike,
} from './WhatsAppConsole.helpers';

/** Whats app console props shape. */
export interface WhatsAppConsoleProps {
  /** Is open property. */
  isOpen: boolean;
  /** On close property. */
  onClose: () => void;
  /** On toggle property. */
  onToggle: () => void;
  /** Activities property. */
  activities?: AgentActivity[];
  /** Is thinking property. */
  isThinking?: boolean;
  /** On connection change property. */
  onConnectionChange?: (connected: boolean) => void;
  /** Class name property. */
  className?: string;
  /** Auto connect property. */
  autoConnect?: boolean;
}

// Pure data helpers moved to WhatsAppConsole.helpers.ts
// (parseDateLike, toIsoDateLike, extractPreviewText, formatClock,
// normalizeChats, normalizeMessages, ChatPreview).

class WhatsAppConsoleErrorBoundary extends React.Component<
  { children: React.ReactNode; resetKey?: string },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; resetKey?: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('WhatsAppConsole crashed:', error);
  }

  componentDidUpdate(prevProps: { resetKey?: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <aside className="fixed right-0 top-0 z-50 flex h-full w-[340px] flex-col border-l border-[colors.border.space] bg-[colors.background.surface] px-4 py-6 shadow-2xl">
          <div className="rounded-3xl border border-[colors.ember.primary]/20 bg-[colors.background.surface] px-4 py-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">
              {kloelT(`O painel do WhatsApp caiu, mas o restante da aplicação continua vivo.`)}
            </div>
            <div className="mt-2 text-xs leading-relaxed text-slate-500">
              {kloelT(
                `Reabra o painel. O erro foi isolado para evitar que a tela inteira desapareça.`,
              )}
            </div>
          </div>
        </aside>
      );
    }

    return this.props.children;
  }
}

function getActivityTone(activity: AgentActivity) {
  switch (activity.type) {
    case 'message_sent':
      return 'bg-[colors.text.silver]/10 text-[colors.text.silver] border-[colors.text.silver]/15';
    case 'message_received':
      return 'bg-[colors.background.elevated] text-[colors.text.muted] border-[colors.border.space]';
    case 'lead_qualified':
      return 'bg-[colors.text.silver]/10 text-[colors.text.silver] border-[colors.text.silver]/15';
    case 'follow_up_scheduled':
      return 'bg-[colors.text.muted]/10 text-[colors.text.muted] border-[colors.text.muted]/15';
    case 'error':
      return 'bg-[colors.ember.primary]/10 text-[colors.ember.primary] border-[colors.ember.primary]/15';
    default:
      return 'bg-[colors.text.muted]/10 text-[colors.text.muted] border-[colors.text.muted]/15';
  }
}

function WhatsAppLiveView({
  selectedChat,
  messages,
  activities,
  isThinking,
  isPaused,
}: {
  selectedChat: ChatPreview | null;
  messages: InboxMessage[];
  activities: AgentActivity[];
  isThinking: boolean;
  isPaused: boolean;
}) {
  const renderedMessages = messages.slice(-16);
  const renderedActivities = activities.slice(-5).reverse();

  return (
    <div className="space-y-3">
      <div className="mx-auto w-full max-w-[270px] rounded-[32px] border-[8px] border-slate-900 bg-slate-900 p-1 shadow-2xl">
        <div className="rounded-[24px] bg-[colors.background.surface] overflow-hidden">
          <div className="flex items-center justify-between bg-[colors.background.elevated] px-3 pb-2 pt-3 text-white">
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-white/70">
                {isPaused ? 'IA pausada' : 'IA ativa'}
              </div>
              <div className="text-sm font-semibold">
                {selectedChat?.title || 'WhatsApp ao vivo'}
              </div>
            </div>
            <div className="text-[11px] text-white/80">
              {selectedChat?.lastMessageAt
                ? formatClock(selectedChat.lastMessageAt)
                : formatClock(new Date())}
            </div>
          </div>

          <div className="max-h-[420px] min-h-[420px] space-y-2 overflow-y-auto bg-[colors.background.surface] px-3 py-3">
            {renderedMessages.length === 0 ? (
              <div className="rounded-md bg-[colors.background.surface]/90 px-3 py-4 text-center text-xs text-[colors.text.muted] shadow-sm">
                {kloelT(`Nenhuma conversa sincronizada ainda. Assim que a sessão estiver ativa, as mensagens
                e ações do agente aparecem aqui.`)}
              </div>
            ) : null}

            {renderedMessages.map((message) => {
              const outbound = message.direction === 'OUTBOUND';
              return (
                <div
                  key={message.id}
                  className={cn(
                    'max-w-[82%] rounded-md px-3 py-2 text-[13px] leading-relaxed shadow-sm',
                    outbound
                      ? 'ml-auto rounded-br-md bg-[colors.ember.primary]/20 text-[colors.text.silver]'
                      : 'mr-auto rounded-bl-md bg-[colors.background.elevated] text-[colors.text.silver]',
                  )}
                >
                  <div>{message.content || '[mensagem sem texto]'}</div>
                  <div className="mt-1 text-right text-[10px] text-slate-400">
                    {formatClock(message.createdAt)}
                  </div>
                </div>
              );
            })}

            {renderedActivities.map((activity) => (
              <div
                key={activity.id}
                className={cn(
                  'mx-auto max-w-[92%] rounded-md border px-3 py-2 text-[11px] shadow-sm',
                  getActivityTone(activity),
                )}
              >
                <div className="font-semibold">{activity.title}</div>
                {activity.description ? <div className="mt-1">{activity.description}</div> : null}
              </div>
            ))}

            {isThinking && !isPaused ? (
              <div className="mr-auto max-w-[65%] rounded-md rounded-bl-md bg-[colors.background.elevated] px-3 py-2 text-xs text-[colors.text.muted] shadow-sm">
                {kloelT(`digitando...`)}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white px-3 py-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {kloelT(`Ações ao vivo`)}
          </div>
          <div className="text-xs text-slate-400">
            {activities.length} {kloelT(`evento(s)`)}
          </div>
        </div>
        <div className="space-y-2">
          {activities
            .slice(-4)
            .reverse()
            .map((activity) => (
              <div key={activity.id} className="rounded-md bg-slate-50 px-3 py-2">
                <div className="text-sm font-medium text-slate-900">{activity.title}</div>
                {activity.description ? (
                  <div className="mt-1 text-xs leading-relaxed text-slate-500">
                    {activity.description}
                  </div>
                ) : null}
              </div>
            ))}
          {activities.length === 0 ? (
            <div className="rounded-md bg-slate-50 px-3 py-3 text-xs text-slate-500">
              {kloelT(`O painel passa a refletir tudo o que a IA faz assim que o stream do agente e a sessão
              do WhatsApp estiverem ativos.`)}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function QrConnectCard({
  qrCode,
  connecting,
  loading,
  error,
  statusMessage,
  onConnect,
  onReset,
}: {
  qrCode: string | null;
  connecting: boolean;
  loading: boolean;
  error: string | null;
  statusMessage: string | null;
  onConnect: () => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-3">
          <div className="rounded-md bg-emerald-50 p-2">
            <Smartphone className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">
              {kloelT(`Escaneie seu QR Code`)}
            </div>
            <div className="text-xs text-slate-500">
              {kloelT(`Toda a conexão do WhatsApp acontece neste painel.`)}
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-slate-50 px-4 py-4">
          {qrCode ? (
            <Image
              src={qrCode}
              alt="QR Code do WhatsApp"
              width={224}
              height={224}
              unoptimized
              className="mx-auto h-56 w-56 rounded-md bg-white p-3 shadow-sm"
            />
          ) : (
            <div className="flex h-56 flex-col items-center justify-center rounded-md border border-dashed border-[colors.border.default] bg-[colors.background.elevated] text-center">
              <div className="mb-3">
                <KloelMushroomVisual
                  size={44}
                  traceColor={colors.text.silver}
                  animated={connecting}
                  spores={connecting ? 'animated' : 'none'}
                />
              </div>
              <div className="text-sm font-medium text-slate-700">
                {connecting ? 'Gerando QR Code...' : 'Nenhum QR Code disponível'}
              </div>
              <div className="mt-1 max-w-[180px] text-xs leading-relaxed text-slate-500">
                {kloelT(`Inicie a sessão para escanear pelo celular.`)}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2 text-sm text-slate-500">
          <div>{kloelT(`1. Abra o WhatsApp no celular.`)}</div>
          <div>{kloelT(`2. Vá em aparelhos conectados.`)}</div>
          <div>{kloelT(`3. Escaneie o QR Code deste painel.`)}</div>
        </div>

        {statusMessage ? (
          <div className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {statusMessage}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</div>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onConnect}
            disabled={loading}
            className="flex-1 rounded-md bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {connecting ? 'Aguardando leitura' : 'Conectar WhatsApp'}
          </button>
          <button
            type="button"
            onClick={onReset}
            disabled={loading}
            className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatsSyncList({
  chats,
  selectedChat,
  onSelect,
}: {
  chats: ChatPreview[];
  selectedChat: ChatPreview | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {kloelT(`Conversas sincronizadas`)}
      </div>
      <div className="space-y-2">
        {chats.slice(0, 4).map((chat) => (
          <button
            type="button"
            key={chat.id}
            onClick={() => onSelect(chat.id)}
            className={cn(
              'flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition',
              selectedChat?.id === chat.id ? 'bg-emerald-50' : 'bg-slate-50 hover:bg-slate-100',
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <MessageCircleMore className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-900">{chat.title}</div>
              <div className="truncate text-xs text-slate-500">
                {chat.subtitle || 'Sem prévia da última mensagem.'}
              </div>
            </div>
          </button>
        ))}
        {chats.length === 0 ? (
          <div className="rounded-md bg-slate-50 px-3 py-3 text-xs text-slate-500">
            {kloelT(`Nenhuma conversa foi sincronizada ainda.`)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
import "./__parts__/WhatsAppConsole.part";
