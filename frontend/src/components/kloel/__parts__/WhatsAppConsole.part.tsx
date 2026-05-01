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
          className="fixed right-0 top-1/2 z-40 -translate-y-1/2 rounded-l-2xl border border-r-0 border-[colors.border.space] bg-[colors.background.surface] px-3 py-2 shadow-lg transition-all hover:pr-5"
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
          'fixed right-0 top-0 z-50 flex h-full flex-col border-l border-[colors.border.space] bg-[colors.background.surface] transition-transform duration-200',
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
              <div className="text-sm font-semibold text-slate-900">{kloelT(`WhatsApp`)}</div>
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
              title={kloelT(`Desconectar WhatsApp`)}
              disabled={loading || !connected}
            >
              <Power className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
              title={kloelT(`Fechar`)}
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
                    {kloelT(`tempo real`)}
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
                    {kloelT(`Prova da melhor ação`)}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {latestProofActivity.metadata?.actionType || 'Ação em prova'}
                    {latestProofActivity.metadata?.tacticCode
                      ? ` · ${latestProofActivity.metadata.tacticCode}`
                      : ''}
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-slate-600">
                    {kloelT(`Rank da ação:`)}{' '}
                    {latestProofActivity.metadata?.selectedActionRank ?? '-'}{' '}
                    {kloelT(`·
                    melhores ações acima:`)}{' '}
                    {latestProofActivity.metadata?.betterActionCount ?? 0}{' '}
                    {kloelT(`·
                    rank da tática:`)}{' '}
                    {latestProofActivity.metadata?.selectedTacticRank ?? '-'}{' '}
                    {kloelT(`·
                    melhores táticas acima:`)}{' '}
                    {latestProofActivity.metadata?.betterTacticCount ?? 0}
                  </div>
                </div>
              ) : null}

              {latestAccountActivity ? (
                <div className="rounded-3xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {kloelT(`Conta ao vivo`)}
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

