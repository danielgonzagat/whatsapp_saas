'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { useConversationHistory } from '@/hooks/useConversationHistory';
import { searchKloelThreads, type ThreadSearchPayload } from '@/lib/kloel-conversations';
import { cn } from '@/lib/utils';
import { ConversationsIcon } from './sidebar/ConversationsIcon';
import {
  type ConversationSearchResult,
  formatConversationSearchTime,
  groupConversationSearchResults,
  highlightPlainText,
  sanitizeMarkedHtml,
} from './search/conversation-search-utils';

export type CommandType = 'fill_chat' | 'execute' | 'execute_gate' | 'navigate';
export type CommandRisk = 'auto' | 'confirm' | 'sensitive';
export type CommandCategory =
  | 'actions'
  | 'navigate'
  | 'create'
  | 'autopilot'
  | 'diagnostic'
  | 'advanced';

export interface CommandItem {
  id: string;
  title: string;
  description?: string;
  icon?: React.ElementType;
  type: CommandType;
  risk: CommandRisk;
  category: CommandCategory;
  prompt?: string;
  action?: () => void;
  href?: string;
  keywords?: string[];
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelect: (command: CommandItem) => void;
  commands?: CommandItem[];
  initialCategory?: CommandCategory;
  initialSearch?: string;
  className?: string;
  mode?: 'full' | 'conversations';
}

function buildRecentPreview(input?: string): string {
  const text = String(input || '')
    .replace(/\s+/g, ' ')
    .trim();
  return text || 'Abra a conversa para retomar o contexto.';
}

function mapRecentConversation(conversation: {
  id: string;
  title: string;
  updatedAt?: string;
  lastMessagePreview?: string;
}): ConversationSearchResult {
  return {
    id: conversation.id,
    title: String(conversation.title || 'Nova conversa').trim() || 'Nova conversa',
    updatedAt: conversation.updatedAt,
    matchedContent: buildRecentPreview(conversation.lastMessagePreview),
    previewHtml: buildRecentPreview(conversation.lastMessagePreview),
    tags: [],
  };
}

function mapSearchPayload(payload: ThreadSearchPayload): ConversationSearchResult {
  return {
    id: payload.id,
    title: String(payload.title || 'Nova conversa').trim() || 'Nova conversa',
    updatedAt: payload.updatedAt,
    matchedContent: buildRecentPreview(payload.matchedContent),
    previewHtml: payload.previewHtml || payload.matchedContent || '',
    tags: Array.isArray(payload.tags) ? payload.tags.filter(Boolean).slice(0, 3) : [],
  };
}

export function CommandPalette({ open, onClose, initialSearch, className }: CommandPaletteProps) {
  const router = useRouter();
  const { conversations, setActiveConversation } = useConversationHistory();

  const [query, setQuery] = useState(initialSearch || '');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [remoteResults, setRemoteResults] = useState<ConversationSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const recentResults = useMemo(
    () => conversations.slice(0, 20).map((conversation) => mapRecentConversation(conversation)),
    [conversations],
  );

  const localMatches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return recentResults;
    }

    return recentResults
      .filter(
        (item) =>
          item.title.toLowerCase().includes(normalizedQuery) ||
          String(item.matchedContent || '')
            .toLowerCase()
            .includes(normalizedQuery),
      )
      .slice(0, 8);
  }, [query, recentResults]);

  useEffect(() => {
    if (!open) return;

    setQuery(initialSearch || '');
    setSelectedIndex(0);
    setRemoteResults([]);
    setIsSearching(false);
  }, [initialSearch, open]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 32);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      setRemoteResults([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    setRemoteResults([]);

    const timer = window.setTimeout(async () => {
      try {
        const results = await searchKloelThreads(normalizedQuery, 20);
        if (cancelled) return;
        setRemoteResults(results.map((result) => mapSearchPayload(result)));
      } catch {
        if (cancelled) return;
        setRemoteResults([]);
      } finally {
        if (!cancelled) {
          setIsSearching(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  const results = useMemo(() => {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      return recentResults;
    }

    const primary = remoteResults.length > 0 ? remoteResults : localMatches;
    const seen = new Set(primary.map((item) => item.id));
    const extras = localMatches.filter((item) => !seen.has(item.id));
    return [...primary, ...extras].slice(0, 20);
  }, [localMatches, query, recentResults, remoteResults]);

  useEffect(() => {
    setSelectedIndex((current) => {
      if (results.length === 0) return 0;
      return Math.min(current, results.length - 1);
    });
  }, [results]);

  useEffect(() => {
    const selectedNode = itemRefs.current[selectedIndex];
    selectedNode?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIndex]);

  const groupedResults = useMemo(() => groupConversationSearchResults(results), [results]);

  const openConversation = useCallback(
    (conversationId: string) => {
      setActiveConversation(conversationId);
      router.push(`/?conversationId=${encodeURIComponent(conversationId)}`);
      onClose();
    },
    [onClose, router, setActiveConversation],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((current) => Math.min(current + 1, Math.max(results.length - 1, 0)));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((current) => Math.max(current - 1, 0));
        return;
      }

      if (event.key === 'Enter' && results[selectedIndex]) {
        event.preventDefault();
        openConversation(results[selectedIndex].id);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    },
    [onClose, openConversation, results, selectedIndex],
  );

  if (!open) return null;

  const hasQuery = query.trim().length > 0;
  const footerLabel = hasQuery
    ? `${results.length} conversa${results.length === 1 ? '' : 's'}`
    : `${results.length} recente${results.length === 1 ? '' : 's'}`;

  itemRefs.current = [];
  let flatIndex = -1;

  return (
    <>
      <style>{`
        .kloel-search-shell {
          position: fixed;
          inset: 0;
          z-index: 80;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding: 72px 16px 24px;
          background: rgba(10, 10, 12, 0.16);
        }

        .kloel-search-modal {
          width: min(680px, 100%);
          background: #111113;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          overflow: hidden;
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.03),
            0 18px 52px rgba(0, 0, 0, 0.42),
            0 6px 18px rgba(0, 0, 0, 0.28);
          animation: kloel-search-enter 180ms cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes kloel-search-enter {
          from {
            opacity: 0;
            transform: translateY(-10px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .kloel-search-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 15px 18px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .kloel-search-input {
          flex: 1;
          min-width: 0;
          background: transparent;
          border: none;
          outline: none;
          font-family: 'Sora', sans-serif;
          font-size: 15px;
          font-weight: 400;
          color: #f5f5f6;
          caret-color: #e85d30;
          letter-spacing: -0.01em;
        }

        .kloel-search-input::placeholder {
          color: #52525b;
        }

        .kloel-search-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 28px;
          height: 28px;
          padding: 0 10px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.04);
          color: #6e6e73;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
        }

        button.kloel-search-pill {
          cursor: pointer;
        }

        button.kloel-search-pill:hover {
          background: rgba(255, 255, 255, 0.07);
          border-color: rgba(255, 255, 255, 0.12);
          color: #e0ddd8;
        }

        .kloel-search-progress {
          position: relative;
          height: 1px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.04);
        }

        .kloel-search-progress::after {
          content: '';
          position: absolute;
          inset: 0 auto 0 -120px;
          width: 120px;
          background: #e85d30;
          animation: kloel-search-progress 900ms ease-in-out infinite;
        }

        @keyframes kloel-search-progress {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(calc(100vw + 240px));
          }
        }

        .kloel-search-body {
          max-height: min(56vh, 480px);
          overflow-y: auto;
          padding: 8px 8px 10px;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.08) transparent;
        }

        .kloel-search-body::-webkit-scrollbar {
          width: 6px;
        }

        .kloel-search-body::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.08);
          border-radius: 999px;
        }

        .kloel-search-group {
          position: sticky;
          top: 0;
          z-index: 1;
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0;
          padding: 10px 10px 6px;
          background: rgba(17, 17, 19, 0.96);
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: #52525b;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .kloel-search-result {
          display: grid;
          grid-template-columns: 36px minmax(0, 1fr) auto;
          gap: 12px;
          width: 100%;
          margin: 0 0 2px;
          padding: 12px;
          border: none;
          border-radius: 12px;
          background: transparent;
          text-align: left;
          cursor: pointer;
          transition: background 120ms ease, box-shadow 120ms ease;
        }

        .kloel-search-result:hover,
        .kloel-search-result[data-selected='true'] {
          background: rgba(255, 255, 255, 0.035);
        }

        .kloel-search-result[data-selected='true'] {
          box-shadow: inset 0 0 0 1px rgba(232, 93, 48, 0.12);
          background: rgba(232, 93, 48, 0.055);
        }

        .kloel-search-result mark,
        .kloel-search-result-title mark {
          color: #e85d30;
          background: transparent;
          font-weight: 600;
        }

        .kloel-search-result-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: rgba(232, 93, 48, 0.08);
          color: #e85d30;
        }

        .kloel-search-result-title {
          margin: 0 0 4px;
          font-family: 'Sora', sans-serif;
          font-size: 13.5px;
          font-weight: 500;
          color: #ece9e4;
          line-height: 1.3;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .kloel-search-result-preview {
          margin: 0;
          font-family: 'Sora', sans-serif;
          font-size: 12.5px;
          font-weight: 400;
          color: #6e6e73;
          line-height: 1.45;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .kloel-search-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
        }

        .kloel-search-tag {
          display: inline-flex;
          align-items: center;
          min-height: 20px;
          padding: 0 7px;
          border-radius: 999px;
          background: rgba(232, 93, 48, 0.08);
          color: #e85d30;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          line-height: 1;
        }

        .kloel-search-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #52525b;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          white-space: nowrap;
        }

        .kloel-search-arrow {
          opacity: 0;
          transition: opacity 120ms ease, transform 120ms ease;
          transform: translateX(-2px);
        }

        .kloel-search-result[data-selected='true'] .kloel-search-arrow,
        .kloel-search-result:hover .kloel-search-arrow {
          opacity: 1;
          transform: translateX(0);
        }

        .kloel-search-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 52px 20px;
          text-align: center;
        }

        .kloel-search-empty-title {
          font-family: 'Sora', sans-serif;
          font-size: 14px;
          font-weight: 500;
          color: #e0ddd8;
        }

        .kloel-search-empty-copy {
          max-width: 320px;
          font-family: 'Sora', sans-serif;
          font-size: 12.5px;
          line-height: 1.5;
          color: #6e6e73;
        }

        .kloel-search-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 18px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .kloel-search-hints {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }

        .kloel-search-hint {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: #52525b;
        }

        @media (max-width: 768px) {
          .kloel-search-shell {
            padding-top: 56px;
          }

          .kloel-search-modal {
            width: 100%;
          }

          .kloel-search-result {
            grid-template-columns: 34px minmax(0, 1fr);
          }

          .kloel-search-meta {
            display: none;
          }

          .kloel-search-footer {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>

      <div className="kloel-search-shell" onClick={onClose}>
        <div
          className={cn('kloel-search-modal', className)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={handleKeyDown}
          role="dialog"
          aria-modal="true"
          aria-label="Buscar conversas"
        >
          <div className="kloel-search-header">
            <Search size={18} color="#6E6E73" />
            <input
              ref={inputRef}
              className="kloel-search-input"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedIndex(0);
              }}
              placeholder="Buscar no conteúdo das conversas..."
              autoComplete="off"
              spellCheck={false}
            />
            {hasQuery && (
              <button
                type="button"
                className="kloel-search-pill"
                onClick={() => {
                  setQuery('');
                  setSelectedIndex(0);
                }}
                aria-label="Limpar busca"
              >
                <X size={12} />
              </button>
            )}
            <button type="button" className="kloel-search-pill" onClick={onClose}>
              ESC
            </button>
          </div>

          {isSearching && <div className="kloel-search-progress" aria-hidden="true" />}

          <div className="kloel-search-body">
            {results.length === 0 ? (
              <div className="kloel-search-empty">
                <div className="kloel-search-result-icon" aria-hidden="true">
                  <Search size={18} />
                </div>
                <div className="kloel-search-empty-title">
                  {hasQuery ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa recente'}
                </div>
                <div className="kloel-search-empty-copy">
                  {hasQuery
                    ? `Nada apareceu para “${query.trim()}”. Tenta outro termo ou uma palavra que esteja no conteúdo da conversa.`
                    : 'Assim que você conversar com a Kloel, os históricos aparecem aqui para busca imediata.'}
                </div>
              </div>
            ) : (
              groupedResults.map((group) => (
                <div key={group.label}>
                  <div className="kloel-search-group">{group.label}</div>
                  {group.items.map((item) => {
                    flatIndex += 1;
                    const itemIndex = flatIndex;
                    const isSelected = selectedIndex === itemIndex;
                    const titleMarkup = hasQuery
                      ? highlightPlainText(item.title, query)
                      : sanitizeMarkedHtml(item.title);
                    const rawPreview = item.previewHtml || item.matchedContent || item.title;
                    const previewMarkup = hasQuery
                      ? rawPreview.includes('<mark>')
                        ? sanitizeMarkedHtml(rawPreview)
                        : highlightPlainText(rawPreview, query)
                      : sanitizeMarkedHtml(rawPreview);

                    return (
                      <button
                        key={item.id}
                        ref={(node) => {
                          itemRefs.current[itemIndex] = node;
                        }}
                        type="button"
                        className="kloel-search-result"
                        data-selected={isSelected}
                        onMouseEnter={() => setSelectedIndex(itemIndex)}
                        onClick={() => openConversation(item.id)}
                      >
                        <div className="kloel-search-result-icon" aria-hidden="true">
                          <ConversationsIcon size={16} color="currentColor" />
                        </div>

                        <div style={{ minWidth: 0 }}>
                          <p
                            className="kloel-search-result-title"
                            dangerouslySetInnerHTML={{ __html: titleMarkup }}
                          />
                          <p
                            className="kloel-search-result-preview"
                            dangerouslySetInnerHTML={{ __html: previewMarkup }}
                          />
                          {hasQuery && item.tags && item.tags.length > 0 && (
                            <div className="kloel-search-tags">
                              {item.tags.map((tag) => (
                                <span key={`${item.id}-${tag}`} className="kloel-search-tag">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="kloel-search-meta">
                          <span>{formatConversationSearchTime(item.updatedAt) || group.label}</span>
                          <ArrowRight size={14} className="kloel-search-arrow" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="kloel-search-footer">
            <div className="kloel-search-hints">
              <span className="kloel-search-hint">
                <span className="kloel-search-pill">↑↓</span>
                navegar
              </span>
              <span className="kloel-search-hint">
                <span className="kloel-search-pill">↵</span>
                abrir
              </span>
              <span className="kloel-search-hint">
                <span className="kloel-search-pill">esc</span>
                fechar
              </span>
            </div>
            <span className="kloel-search-hint">{footerLabel}</span>
          </div>
        </div>
      </div>
    </>
  );
}

export default CommandPalette;
