'use client';

import { kloelT } from '@/lib/i18n/t';
import { Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { KLOEL_CHAT_ROUTE } from '@/lib/kloel-dashboard-context';
import { cn } from '@/lib/utils';
import { useCommandPaletteKeyboard } from './CommandPalette.hooks';
import { COMMAND_PALETTE_STYLES } from './CommandPalette.styles';
import { CommandPaletteItem } from './search/CommandPaletteItem';
import { useCommandPalette } from './search/use-command-palette';

/** Command type type. */
export type CommandType = 'fill_chat' | 'execute' | 'execute_gate' | 'navigate';
/** Command risk type. */
export type CommandRisk = 'auto' | 'confirm' | 'sensitive';
/** Command category type. */
export type CommandCategory =
  | 'actions'
  | 'navigate'
  | 'create'
  | 'autopilot'
  | 'diagnostic'
  | 'advanced';

/** Command item shape. */
export interface CommandItem {
  /** Id property. */
  id: string;
  /** Title property. */
  title: string;
  /** Description property. */
  description?: string;
  /** Icon property. */
  icon?: React.ElementType;
  /** Type property. */
  type: CommandType;
  /** Risk property. */
  risk: CommandRisk;
  /** Category property. */
  category: CommandCategory;
  /** Prompt property. */
  prompt?: string;
  /** Action property. */
  action?: () => void;
  /** Href property. */
  href?: string;
  /** Keywords property. */
  keywords?: string[];
}

/** Command palette props shape. */
export interface CommandPaletteProps {
  /** Open property. */
  open: boolean;
  /** On close property. */
  onClose: () => void;
  /** On select property. */
  onSelect: (command: CommandItem) => void;
  /** Commands property. */
  commands?: CommandItem[] | undefined;
  initialCategory?: CommandCategory | undefined;
  initialSearch?: string | undefined;
  className?: string | undefined;
  mode?: 'full' | 'conversations' | undefined;
}

/** Command palette. */
export function CommandPalette({ open, onClose, initialSearch, className }: CommandPaletteProps) {
  const router = useRouter();
  const {
    query,
    setQuery,
    selectedIndex,
    setSelectedIndex,
    isSearching,
    results,
    groupedResults,
    inputRef,
    itemRefsRef,
    setActiveConversation,
  } = useCommandPalette({
    ...(open !== undefined ? { open } : {}),
    ...(initialSearch !== undefined ? { initialSearch } : {}),
  });

  const openConversation = useCallback(
    (conversationId: string) => {
      setActiveConversation(conversationId);
      router.push(`${KLOEL_CHAT_ROUTE}?conversationId=${encodeURIComponent(conversationId)}`);
      onClose();
    },
    [onClose, router, setActiveConversation],
  );

  const handleKeyDown = useCommandPaletteKeyboard({
    results,
    selectedIndex,
    setSelectedIndex,
    openConversation,
    onClose,
  });

  if (!open) {
    return null;
  }

  const hasQuery = query.trim().length > 0;
  const footerLabel = hasQuery
    ? kloelT(`${results.length} conversa${results.length === 1 ? '' : 's'}`)
    : kloelT(`${results.length} recente${results.length === 1 ? '' : 's'}`);

  // itemRefsRef.current slots are set by per-item ref callbacks below;
  // stale indices are harmless because navigation only reads current[selectedIndex].
  let flatIndex = -1;

  return (
    <>
      <style>{COMMAND_PALETTE_STYLES}</style>

      <div className="kloel-search-shell" onClick={onClose}>
        <div
          className={cn('kloel-search-modal', className)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={handleKeyDown}
          role="dialog"
          aria-modal="true"
          aria-label={kloelT(`Buscar conversas`)}
        >
          <div className="kloel-search-header">
            <Search size={18} color="var(--app-text-secondary)" aria-hidden="true" />
            <input
              ref={inputRef}
              className="kloel-search-input"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedIndex(0);
              }}
              placeholder={kloelT(`Buscar no conteúdo das conversas...`)}
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
                aria-label={kloelT(`Limpar busca`)}
              >
                <X size={12} aria-hidden="true" />
              </button>
            )}
            <button type="button" className="kloel-search-pill" onClick={onClose}>
              {kloelT(`ESC`)}
            </button>
          </div>

          {isSearching && <div className="kloel-search-progress" aria-hidden="true" />}

          <div className="kloel-search-body">
            {results.length === 0 ? (
              <div className="kloel-search-empty">
                <div className="kloel-search-result-icon" aria-hidden="true">
                  <Search size={18} aria-hidden="true" />
                </div>
                <div className="kloel-search-empty-title">
                  {hasQuery ? kloelT(`Nenhuma conversa encontrada`) : kloelT(`Nenhuma conversa recente`)}
                </div>
                <div className="kloel-search-empty-copy">
                  {hasQuery
                    ? kloelT(`Nada apareceu para \u201C${query.trim()}\u201D. Tenta outro termo ou uma palavra que esteja no conteúdo da conversa.`)
                    : kloelT(`Assim que você conversar com a Kloel, os históricos aparecem aqui para busca imediata.`)}
                </div>
              </div>
            ) : (
              groupedResults.map((group) => (
                <div key={group.label}>
                  <div className="kloel-search-group">{group.label}</div>
                  {group.items.map((item) => {
                    flatIndex += 1;
                    const itemIndex = flatIndex;
                    return (
                      <CommandPaletteItem
                        key={item.id}
                        ref={(node) => {
                          itemRefsRef.current[itemIndex] = node;
                        }}
                        item={item}
                        isSelected={selectedIndex === itemIndex}
                        hasQuery={hasQuery}
                        query={query}
                        groupLabel={group.label}
                        onHover={() => setSelectedIndex(itemIndex)}
                        onSelect={() => openConversation(item.id)}
                      />
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="kloel-search-footer">
            <div className="kloel-search-hints">
              <span className="kloel-search-hint">
                <span className="kloel-search-pill">{kloelT(`↑↓`)}</span>
                {kloelT(`navegar`)}
              </span>
              <span className="kloel-search-hint">
                <span className="kloel-search-pill">↵</span>
                {kloelT(`abrir`)}
              </span>
              <span className="kloel-search-hint">
                <span className="kloel-search-pill">{kloelT(`esc`)}</span>
                {kloelT(`fechar`)}
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
