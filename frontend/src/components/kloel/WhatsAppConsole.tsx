'use client';

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
        <aside className="fixed right-0 top-0 z-50 flex h-full w-[340px] flex-col border-l border-[#222226] bg-[#111113] px-4 py-6 shadow-2xl">
          <div className="rounded-3xl border border-[#E05252]/20 bg-[#111113] px-4 py-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">
              O painel do WhatsApp caiu, mas o restante da aplicação continua vivo.
            </div>
            <div className="mt-2 text-xs leading-relaxed text-slate-500">
              Reabra o painel. O erro foi isolado para evitar que a tela inteira desapareça.
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
      return 'bg-[#E0DDD8]/10 text-[#E0DDD8] border-[#E0DDD8]/15';
    case 'message_received':
      return 'bg-[#19191C] text-[#6E6E73] border-[#222226]';
    case 'lead_qualified':
      return 'bg-[#E0DDD8]/10 text-[#E0DDD8] border-[#E0DDD8]/15';
    case 'follow_up_scheduled':
      return 'bg-[#6E6E73]/10 text-[#6E6E73] border-[#6E6E73]/15';
    case 'error':
      return 'bg-[#E05252]/10 text-[#E05252] border-[#E05252]/15';
    default:
      return 'bg-[#6E6E73]/10 text-[#6E6E73] border-[#6E6E73]/15';
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
        <div className="rounded-[24px] bg-[#E5DDD5] overflow-hidden">
          <div className="flex items-center justify-between bg-[#075E54] px-3 pb-2 pt-3 text-white">
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

          <div className="max-h-[420px] min-h-[420px] space-y-2 overflow-y-auto bg-[linear-gradient(180deg,rgba(10,10,20,0.6),rgba(10,10,20,0.3))] px-3 py-3">
            {renderedMessages.length === 0 ? (
              <div className="rounded-md bg-[#111113]/90 px-3 py-4 text-center text-xs text-[#6E6E73] shadow-sm">
                Nenhuma conversa sincronizada ainda. Assim que a sessão estiver ativa, as mensagens
                e ações do agente aparecem aqui.
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
                      ? 'ml-auto rounded-br-md bg-[#E85D30]/20 text-[#E0DDD8]'
                      : 'mr-auto rounded-bl-md bg-[#19191C] text-[#E0DDD8]',
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
              <div className="mr-auto max-w-[65%] rounded-md rounded-bl-md bg-[#19191C] px-3 py-2 text-xs text-[#6E6E73] shadow-sm">
                digitando...
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white px-3 py-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Ações ao vivo
          </div>
          <div className="text-xs text-slate-400">{activities.length} evento(s)</div>
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
              O painel passa a refletir tudo o que a IA faz assim que o stream do agente e a sessão
              do WhatsApp estiverem ativos.
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
            <div className="text-sm font-semibold text-slate-900">Escaneie seu QR Code</div>
            <div className="text-xs text-slate-500">
              Toda a conexão do WhatsApp acontece neste painel.
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
            <div className="flex h-56 flex-col items-center justify-center rounded-md border border-dashed border-[#333338] bg-[#19191C] text-center">
              <div className="mb-3">
                <KloelMushroomVisual
                  size={44}
                  traceColor="#FFFFFF"
                  animated={connecting}
                  spores={connecting ? 'animated' : 'none'}
                />
              </div>
              <div className="text-sm font-medium text-slate-700">
                {connecting ? 'Gerando QR Code...' : 'Nenhum QR Code disponível'}
              </div>
              <div className="mt-1 max-w-[180px] text-xs leading-relaxed text-slate-500">
                Inicie a sessão para escanear pelo celular.
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2 text-sm text-slate-500">
          <div>1. Abra o WhatsApp no celular.</div>
          <div>2. Vá em aparelhos conectados.</div>
          <div>3. Escaneie o QR Code deste painel.</div>
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
        Conversas sincronizadas
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
            Nenhuma conversa foi sincronizada ainda.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function WhatsAppConsoleInner({
  isOpen,
  onClose,
  onToggle,
  activities = [],
  isThinking = false,
  onConnectionChange,
  className,
  autoConnect = false,
}: WhatsAppConsoleProps) {
  const {
    connected,
    connecting,
    error,
    isPaused,
    loading,
    qrCode,
    reset,
    status,
    statusMessage,
    connect,
    disconnect,
  } = useWhatsAppSession({
    enabled: true,
    onConnectionChange,
  });
  const [chats, setChats] = useState<ChatPreview[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const autoConnectTriggeredRef = useRef(false);

  useEffect(() => {
    if (!isOpen || !autoConnect || connected || connecting || loading) {
      if (!autoConnect) {
        autoConnectTriggeredRef.current = false;
      }
      return;
    }

    if (autoConnectTriggeredRef.current) {
      return;
    }
    autoConnectTriggeredRef.current = true;
    void connect();
  }, [autoConnect, connect, connected, connecting, isOpen, loading]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length, activities.length]);

  useEffect(() => {
    if (!isOpen || !connected) {
      return;
    }

    let cancelled = false;
    const loadChats = async () => {
      try {
        const response = await whatsappApi.getChats();
        if (cancelled) {
          return;
        }
        const nextChats = normalizeChats(response.data);
        setChats(nextChats);
        setSelectedChatId((current) => {
          if (current && nextChats.some((chat) => chat.id === current)) {
            return current;
          }
          return nextChats[0]?.id || null;
        });
      } catch (err) {
        console.error('Failed to load chats for console:', err);
      }
    };

    void loadChats();
    const interval = setInterval(() => {
      void loadChats();
    }, 8000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [connected, isOpen]);

  useEffect(() => {
    if (!isOpen || !connected || !selectedChatId) {
      return;
    }

    let cancelled = false;
    const loadMessages = async () => {
      try {
        const response = await whatsappApi.getChatMessages(selectedChatId, {
          limit: 24,
        });
        if (cancelled) {
          return;
        }
        setMessages(normalizeMessages(response.data));
      } catch (err) {
        console.error('Failed to load messages for console:', err);
      }
    };

    void loadMessages();
    const interval = setInterval(() => {
      void loadMessages();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [connected, isOpen, selectedChatId]);

  useEffect(() => {
    if (!selectedChatId || chats.length === 0) {
      return;
    }
    const latestActivity = activities[activities.length - 1];
    const hint = String(
      latestActivity?.metadata?.contactName || latestActivity?.metadata?.contactPhone || '',
    ).toLowerCase();
    if (!hint) {
      return;
    }

    const nextChat = chats.find((chat) => {
      return (
        chat.title.toLowerCase().includes(hint) ||
        String(chat.subtitle || '')
          .toLowerCase()
          .includes(hint)
      );
    });

    if (nextChat && nextChat.id !== selectedChatId) {
      setSelectedChatId(nextChat.id);
    }
  }, [activities, chats, selectedChatId]);

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) || chats[0] || null,
    [chats, selectedChatId],
  );
  const latestProofActivity = useMemo(
    () =>
      [...activities]
        .reverse()
        .find(
          (activity) =>
            activity.metadata?.conversationProofId ||
            activity.metadata?.accountProofId ||
            activity.metadata?.selectedActionRank,
        ) || null,
    [activities],
  );
  const latestAccountActivity = useMemo(
    () =>
      [...activities]
        .reverse()
        .find((activity) => activity.metadata?.workItemId || activity.metadata?.state),
    [activities],
  );

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={onToggle}
          className="fixed right-0 top-1/2 z-40 -translate-y-1/2 rounded-l-2xl border border-r-0 border-[#222226] bg-[#111113] px-3 py-2 shadow-lg transition-all hover:pr-5"
        >
          <div className="flex items-center gap-2">
            <ChevronLeft className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <WhatsAppIcon
              className={cn('h-6 w-6', connected && !isPaused ? 'animate-pulse' : undefined)}
            />
            <span className="text-xs font-medium text-slate-600">
              {connected ? (isPaused ? 'Pausado' : 'Ao vivo') : 'QR Code'}
            </span>
          </div>
        </button>
      )}

      <aside
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full flex-col border-l border-[#222226] bg-[#111113] transition-transform duration-200',
          isOpen ? 'translate-x-0' : 'translate-x-full',
          className,
        )}
        style={{ width: 340 }}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50">
              <WhatsAppIcon className="h-6 w-6" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">WhatsApp</div>
              <div className="text-xs text-slate-500">
                {connected
                  ? `${status?.pushName || 'Sessão conectada'}${status?.phone ? ` · ${status.phone}` : ''}`
                  : connecting
                    ? 'Aguardando leitura do QR Code'
                    : 'Sessão desconectada'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={disconnect}
              className="rounded-md p-2 text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
              title="Desconectar WhatsApp"
              disabled={loading || !connected}
            >
              <Power className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
              title="Fechar"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4">
          {!connected ? (
            <QrConnectCard
              qrCode={qrCode}
              connecting={connecting}
              loading={loading}
              error={error}
              statusMessage={statusMessage}
              onConnect={connect}
              onReset={reset}
            />
          ) : (
            <div className="space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'h-2.5 w-2.5 rounded-full',
                        isPaused ? 'bg-amber-400' : 'bg-emerald-500',
                      )}
                    />
                    <div className="text-sm font-semibold text-slate-900">
                      {isPaused ? 'Conectado e pausado' : 'Conectado e operando'}
                    </div>
                  </div>
                  <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                    tempo real
                  </div>
                </div>
                <div className="mt-2 text-xs leading-relaxed text-slate-500">
                  {statusMessage ||
                    'Este painel replica a sessão, as conversas e as ações da IA no WhatsApp.'}
                </div>
              </div>

              {latestProofActivity ? (
                <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    Prova da melhor ação
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {latestProofActivity.metadata?.actionType || 'Ação em prova'}
                    {latestProofActivity.metadata?.tacticCode
                      ? ` · ${latestProofActivity.metadata.tacticCode}`
                      : ''}
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-slate-600">
                    Rank da ação: {latestProofActivity.metadata?.selectedActionRank ?? '-'} ·
                    melhores ações acima: {latestProofActivity.metadata?.betterActionCount ?? 0} ·
                    rank da tática: {latestProofActivity.metadata?.selectedTacticRank ?? '-'} ·
                    melhores táticas acima: {latestProofActivity.metadata?.betterTacticCount ?? 0}
                  </div>
                </div>
              ) : null}

              {latestAccountActivity ? (
                <div className="rounded-3xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Conta ao vivo
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {latestAccountActivity.title}
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-slate-500">
                    {latestAccountActivity.description ||
                      'O agente está materializando e atualizando a conta em tempo real.'}
                  </div>
                </div>
              ) : null}

              <WhatsAppLiveView
                selectedChat={selectedChat}
                messages={messages}
                activities={activities}
                isThinking={isThinking}
                isPaused={isPaused}
              />

              <ChatsSyncList
                chats={chats}
                selectedChat={selectedChat}
                onSelect={setSelectedChatId}
              />
            </div>
          )}
        </div>
      </aside>

      {isOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden border-none p-0 cursor-pointer"
          onClick={onClose}
          aria-label="Fechar console"
        />
      ) : null}
    </>
  );
}

/** Whats app console. */
export function WhatsAppConsole(props: WhatsAppConsoleProps) {
  return (
    <WhatsAppConsoleErrorBoundary
      resetKey={`${props.isOpen ? 'open' : 'closed'}:${props.autoConnect ? 'auto' : 'manual'}`}
    >
      <WhatsAppConsoleInner {...props} />
    </WhatsAppConsoleErrorBoundary>
  );
}

/** Use whats app console. */
export function useWhatsAppConsole() {
  const [isOpen, setIsOpen] = useState(false);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((prev) => !prev),
    consoleProps: {
      isOpen,
      onClose: () => setIsOpen(false),
      onToggle: () => setIsOpen((prev) => !prev),
    },
  };
}

export default WhatsAppConsole;
