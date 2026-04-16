'use client';

import { ArrowUp, Plus, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { adminChatApi, type AdminChatSessionView } from '@/lib/api/admin-chat-api';
import { useAdminChatHistory } from '@/lib/admin-chat-history';
import { useAdminSession } from '@/lib/auth/admin-session-context';

const ADMIN_MODULES = [
  'Home',
  'Produtos',
  'Marketing',
  'Vendas',
  'Carteira',
  'Relatórios',
  'Contas',
  'Compliance',
  'Clientes',
  'Configurações',
] as const;

function firstName(name?: string | null) {
  const trimmed = String(name || '').trim();
  return trimmed ? trimmed.split(/\s+/)[0] || 'Daniel' : 'Daniel';
}

function greetingFor(hour: number) {
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  if (hour >= 18) return 'Boa noite';
  return 'Boa madrugada';
}

function buildPayload(content: string, moduleContext: string | null) {
  const normalized = content.trim();
  if (!moduleContext) return normalized;
  return `Contexto administrativo ativo: ${moduleContext}.\n\n${normalized}`;
}

export function AdminChatView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { admin } = useAdminSession();
  const { upsertSession, setActiveSessionId, getSessionById } = useAdminChatHistory();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const requestCounterRef = useRef(0);
  const sessionId = searchParams.get('sessionId');
  const [session, setSession] = useState<AdminChatSessionView | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moduleMenuOpen, setModuleMenuOpen] = useState(false);
  const [moduleContext, setModuleContext] = useState<string | null>(null);

  const greeting = useMemo(() => greetingFor(new Date().getHours()), []);
  const displayName = useMemo(() => firstName(admin?.name), [admin?.name]);

  useEffect(() => {
    let cancelled = false;

    async function loadSession(nextSessionId: string) {
      setError(null);

      const cached = getSessionById(nextSessionId);
      if (cached && !cancelled) {
        setSession(cached.raw);
      }

      try {
        const fresh = await adminChatApi.getSession(nextSessionId);
        if (cancelled) return;
        setSession(fresh);
        upsertSession(fresh);
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error ? loadError.message : 'Não foi possível carregar a conversa.',
        );
      }
    }

    if (!sessionId) {
      setSession(null);
      setActiveSessionId(null);
      return () => {
        cancelled = true;
      };
    }

    setActiveSessionId(sessionId);
    void loadSession(sessionId);

    return () => {
      cancelled = true;
    };
  }, [getSessionById, sessionId, setActiveSessionId, upsertSession]);

  useEffect(() => {
    const handleNewChat = () => {
      setSession(null);
      setInput('');
      setError(null);
      setModuleContext(null);
      setModuleMenuOpen(false);
      setActiveSessionId(null);
      startTransition(() => {
        router.replace('/chat');
      });
      window.setTimeout(() => inputRef.current?.focus(), 50);
    };

    window.addEventListener('kloel:new-chat', handleNewChat);
    return () => window.removeEventListener('kloel:new-chat', handleNewChat);
  }, [router, setActiveSessionId]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = '26px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 208)}px`;
  }, [input]);

  async function handleSubmit() {
    const content = input.trim();
    if (!content || busy) return;

    const currentRequest = ++requestCounterRef.current;
    setBusy(true);
    setError(null);

    try {
      const nextSession = await adminChatApi.sendMessage({
        sessionId: session?.id,
        content: buildPayload(content, moduleContext),
      });

      if (requestCounterRef.current !== currentRequest) return;

      setSession(nextSession);
      upsertSession(nextSession);
      setInput('');
      setModuleMenuOpen(false);

      if (nextSession.id !== session?.id) {
        startTransition(() => {
          router.replace(`/chat?sessionId=${encodeURIComponent(nextSession.id)}`);
        });
      }
    } catch (submitError) {
      if (requestCounterRef.current !== currentRequest) return;
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Não foi possível enviar sua mensagem agora.',
      );
    } finally {
      if (requestCounterRef.current === currentRequest) {
        setBusy(false);
      }
    }
  }

  const hasMessages = Boolean(session?.messages.length);

  return (
    <div className="min-h-full bg-[var(--app-bg-primary)]">
      <div className="mx-auto flex min-h-[calc(100vh-72px)] w-full max-w-[1240px] flex-col px-4 py-6 lg:px-6 lg:py-8">
        {hasMessages ? (
          <div className="mx-auto flex w-full max-w-[820px] flex-1 flex-col">
            <div className="mb-6">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                {session?.title || 'Nova conversa'}
              </div>
              {moduleContext ? (
                <div className="inline-flex items-center rounded-full bg-[var(--app-accent-light)] px-3 py-1 text-[11px] font-medium text-[var(--app-accent)]">
                  Contexto: {moduleContext}
                </div>
              ) : null}
            </div>

            <div className="flex-1 space-y-4 pb-10">
              {session?.messages.map((message) => {
                const isUser = message.role === 'USER';
                return (
                  <div
                    key={message.id}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[78%] rounded-2xl border px-4 py-3 text-[14px] leading-7 ${
                        isUser
                          ? 'border-[var(--app-accent-medium)] bg-[var(--app-accent-light)] text-[var(--app-text-primary)]'
                          : 'border-[var(--app-border-primary)] bg-[var(--app-bg-card)] text-[var(--app-text-primary)]'
                      }`}
                    >
                      <div className="whitespace-pre-wrap break-words">{message.content}</div>
                    </div>
                  </div>
                );
              })}

              {busy ? (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-[var(--app-border-primary)] bg-[var(--app-bg-card)] px-4 py-3 text-[13px] text-[var(--app-text-secondary)]">
                    Kloel está pensando...
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="mx-auto flex w-full max-w-[760px] flex-col items-center px-2 text-center">
              <img
                src="/kloel-mushroom-animated.svg"
                alt=""
                aria-hidden="true"
                className="mb-5 h-12 w-12"
              />
              <h1 className="mb-2 text-[34px] font-bold leading-none tracking-[-0.04em] text-[var(--app-text-primary)] md:text-[42px]">
                {greeting}, <span className="text-[var(--app-accent)]">{displayName}</span>.
              </h1>
              <p className="mb-8 text-[14px] text-[var(--app-text-secondary)]">
                Painel global da plataforma Kloel. Todas as operações em tempo real.
              </p>
            </div>
          </div>
        )}

        <div className={`mx-auto w-full max-w-[760px] ${hasMessages ? 'sticky bottom-4' : ''}`}>
          <div className="relative rounded-2xl border border-[var(--app-border-primary)] bg-[var(--app-bg-card)] p-3 shadow-[var(--app-shadow-xl)]">
            {moduleMenuOpen ? (
              <div className="absolute bottom-[calc(100%+10px)] left-0 z-20 w-[280px] rounded-2xl border border-[var(--app-border-primary)] bg-[var(--app-bg-card)] p-2 shadow-[var(--app-shadow-lg)]">
                <div className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                  Contextualizar conversa
                </div>
                <div className="flex flex-col gap-1">
                  {ADMIN_MODULES.map((moduleName) => (
                    <button
                      key={moduleName}
                      type="button"
                      onClick={() => {
                        setModuleContext(moduleName);
                        setModuleMenuOpen(false);
                      }}
                      className="rounded-xl px-3 py-2 text-left text-[13px] text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-bg-hover)] hover:text-[var(--app-text-primary)]"
                    >
                      {moduleName}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {moduleContext ? (
              <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-3 py-2">
                <span className="text-[12px] font-medium text-[var(--app-text-primary)]">
                  Contexto ativo: {moduleContext}
                </span>
                <button
                  type="button"
                  onClick={() => setModuleContext(null)}
                  className="flex size-6 items-center justify-center rounded-md text-[var(--app-text-tertiary)] transition-colors hover:bg-[var(--app-bg-hover)] hover:text-[var(--app-text-primary)]"
                  aria-label="Remover contexto"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            ) : null}

            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder="Como posso ajudar você hoje?"
              className="max-h-[208px] min-h-[26px] w-full resize-none overflow-y-auto border-none bg-transparent px-1 text-[17px] leading-[26px] text-[var(--app-text-primary)] outline-none placeholder:text-[var(--app-text-placeholder)]"
            />

            <div className="mt-3 flex items-end justify-between gap-3">
              <button
                type="button"
                onClick={() => setModuleMenuOpen((current) => !current)}
                className="flex size-10 items-center justify-center rounded-xl text-[var(--app-text-primary)] transition-colors hover:bg-[var(--app-bg-hover)]"
                aria-label="Abrir módulos administrativos"
              >
                <Plus size={18} aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={busy || input.trim().length === 0}
                className="flex size-10 items-center justify-center rounded-xl bg-[var(--app-accent)] text-white transition-opacity disabled:cursor-default disabled:opacity-50"
                aria-label="Enviar mensagem"
              >
                <ArrowUp size={18} aria-hidden="true" />
              </button>
            </div>
          </div>

          {error ? (
            <div className="mt-3 rounded-xl border border-[var(--app-border-primary)] bg-[var(--app-bg-card)] px-4 py-3 text-[12px] text-[var(--app-text-secondary)]">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
