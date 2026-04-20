'use client';

import { ArrowRight, Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ConversationsIcon } from './admin-sidebar-config';
import { type AdminChatSessionSummary, useAdminChatHistory } from '@/lib/admin-chat-history';

function sessionSearchText(session: AdminChatSessionSummary) {
  const messages = session.raw.messages
    .map((message) =>
      String(message.content || '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join(' ');
  return `${session.title} ${session.lastMessagePreview} ${messages}`.trim().toLowerCase();
}

function formatTimeLabel(iso?: string) {
  if (!iso) {
    return 'Agora';
  }
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/** Admin search modal. */
export function AdminSearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { sessions, setActiveSessionId } = useAdminChatHistory();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => inputRef.current?.focus(), 32);

    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return sessions.slice(0, 20);
    }

    return sessions
      .filter((session) => sessionSearchText(session).includes(normalized))
      .slice(0, 20);
  }, [query, sessions]);

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(results.length - 1, 0)));
  }, [results]);

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIndex]);

  if (!open) {
    return null;
  }

  const hasQuery = query.trim().length > 0;

  const openSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    router.push(`/chat?sessionId=${encodeURIComponent(sessionId)}`);
    onClose();
  };

  return (
    <>
      <style>{`
        .admin-search-shell {
          position: fixed;
          inset: 0;
          z-index: 80;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 72px 16px 24px;
          background: var(--app-bg-overlay);
        }

        .admin-search-modal {
          width: min(680px, 100%);
          overflow: hidden;
          border: 1px solid var(--app-border-primary);
          border-radius: 16px;
          background: var(--app-bg-card);
          box-shadow:
            0 0 0 1px color-mix(in srgb, var(--app-border-primary) 28%, transparent),
            var(--app-shadow-lg),
            var(--app-shadow-md);
          animation: admin-search-enter 180ms cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes admin-search-enter {
          from {
            opacity: 0;
            transform: translateY(-10px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>

      <div
        className="admin-search-shell"
        onClick={onClose}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            (event.currentTarget as HTMLElement).click();
          }
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Buscar conversas"
          className="admin-search-modal"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setSelectedIndex((current) => Math.min(current + 1, Math.max(results.length - 1, 0)));
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setSelectedIndex((current) => Math.max(current - 1, 0));
            }
            if (event.key === 'Enter' && results[selectedIndex]) {
              event.preventDefault();
              openSession(results[selectedIndex].id);
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            }
          }}
        >
          <div className="flex items-center gap-3 border-b border-[var(--app-border-subtle)] px-5 py-4">
            <Search size={18} className="text-[var(--app-text-secondary)]" aria-hidden="true" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedIndex(0);
              }}
              placeholder="Buscar no conteúdo das conversas..."
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 border-none bg-transparent text-[15px] text-[var(--app-text-primary)] outline-none placeholder:text-[var(--app-text-placeholder)]"
            />
            {hasQuery ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setSelectedIndex(0);
                }}
                className="flex h-7 min-w-7 items-center justify-center rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-primary)] px-2 text-[var(--app-text-secondary)]"
                aria-label="Limpar busca"
              >
                <X size={12} aria-hidden="true" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 min-w-7 items-center justify-center rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-primary)] px-2 font-mono text-[10px] text-[var(--app-text-secondary)]"
            >
              ESC
            </button>
          </div>

          <div className="max-h-[min(56vh,480px)] overflow-y-auto p-2">
            {results.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
                <div className="flex size-10 items-center justify-center rounded-[10px] bg-[var(--app-accent-light)] text-[var(--app-accent)]">
                  <Search size={18} aria-hidden="true" />
                </div>
                <div className="text-[14px] font-medium text-[var(--app-text-primary)]">
                  {hasQuery ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa recente'}
                </div>
                <div className="max-w-xs text-[12.5px] leading-6 text-[var(--app-text-secondary)]">
                  {hasQuery
                    ? `Nada apareceu para “${query.trim()}”. Tenta outro termo ou uma palavra presente na conversa.`
                    : 'Assim que conversar com a Kloel, os históricos aparecem aqui para busca imediata.'}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <div className="px-3 pb-2 pt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--app-text-placeholder)]">
                  {hasQuery ? 'Resultados' : 'Recentes'}
                </div>
                {results.map((session, index) => {
                  const selected = index === selectedIndex;
                  return (
                    <button
                      key={session.id}
                      ref={(node) => {
                        itemRefs.current[index] = node;
                      }}
                      type="button"
                      data-selected={selected}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => openSession(session.id)}
                      className={`grid w-full grid-cols-[36px_minmax(0,1fr)_auto] gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
                        selected
                          ? 'bg-[var(--app-accent-light)] shadow-[inset_0_0_0_1px_var(--app-accent-medium)]'
                          : 'hover:bg-[var(--app-bg-hover)]'
                      }`}
                    >
                      <div className="flex size-9 items-center justify-center rounded-[10px] bg-[var(--app-accent-light)] text-[var(--app-accent)]">
                        <ConversationsIcon size={16} color="currentColor" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium text-[var(--app-text-primary)]">
                          {session.title}
                        </p>
                        <p className="mt-1 line-clamp-2 text-[12.5px] leading-5 text-[var(--app-text-secondary)]">
                          {session.lastMessagePreview}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 whitespace-nowrap font-mono text-[11px] text-[var(--app-text-placeholder)]">
                        <span>{formatTimeLabel(session.updatedAt)}</span>
                        <ArrowRight size={14} aria-hidden="true" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border-subtle)] px-5 py-3 font-mono text-[10px] text-[var(--app-text-placeholder)]">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <span className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-primary)] px-2 py-1">
                  ↑↓
                </span>
                navegar
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-primary)] px-2 py-1">
                  ↵
                </span>
                abrir
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-primary)] px-2 py-1">
                  esc
                </span>
                fechar
              </span>
            </div>
            <span>
              {results.length} {hasQuery ? 'resultado(s)' : 'recente(s)'}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
