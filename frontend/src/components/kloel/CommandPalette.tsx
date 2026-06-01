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
export function CommandPalette({
  open,
  onClose,
  initialSearch,
  className,
  mode = 'full',
}: CommandPaletteProps) {
  const router = useRouter();
  const {
    query,
    setQuery,
    selectedIndex,
    setSelectedIndex,
    isSearching,
    searchError,
    results,
    groupedResults,
    inputRef,
    itemRefsRef,
    setActiveConversation,
  } = useCommandPalette({
    ...(open !== undefined ? { open } : {}),
    ...(initialSearch !== undefined ? { initialSearch } : {}),
    mode,
  });

  const openResult = useCallback(
    (item: { id: string; href?: string | undefined; type?: string | undefined }) => {
      if (item.type === 'conversation') {
        setActiveConversation(item.id);
      }
      const fallbackHref =
        item.type === 'conversation'
          ? `${KLOEL_CHAT_ROUTE}?conversationId=${encodeURIComponent(item.id)}`
          : KLOEL_CHAT_ROUTE;
      router.push(item.href || fallbackHref);
      onClose();
    },
    [onClose, router, setActiveConversation],
  );

  const handleKeyDown = useCommandPaletteKeyboard({
    results,
    selectedIndex,
    setSelectedIndex,
    openResult,
    onClose,
  });

  if (!open) {
    return null;
  }

  const isConversationMode = mode === 'conversations';
  const hasQuery = query.trim().length > 0;
  const hasActionableQuery = query.trim().length >= 2;
  const resultNoun = isConversationMode ? 'conversa' : 'resultado';
  const footerLabel = hasQuery
    ? kloelT(`${results.length} ${resultNoun}${results.length === 1 ? '' : 's'}`)
    : kloelT(`${results.length} recente${results.length === 1 ? '' : 's'}`);
  const ariaLabel = isConversationMode
    ? kloelT(`Buscar conversas`)
    : kloelT(`Buscar na plataforma`);
  const placeholder = isConversationMode
    ? kloelT(`Buscar no conteúdo das conversas...`)
    : kloelT(`Buscar produtos, clientes, vendas, cursos...`);
  const emptyTitle = hasQuery
    ? isConversationMode
      ? kloelT(`Nenhuma conversa encontrada`)
      : kloelT(`Nenhum resultado encontrado`)
    : kloelT(`Nenhuma conversa recente`);
  const emptyCopy = searchError && hasActionableQuery
    ? kloelT(`Não foi possível consultar a busca real agora. Tente novamente.`)
    : hasQuery
      ? isConversationMode
        ? kloelT(`Nada apareceu para \u201C${query.trim()}\u201D. Tenta outro termo ou uma palavra que esteja no conteúdo da conversa.`)
        : kloelT(`Nada apareceu para \u201C${query.trim()}\u201D. Tenta outro termo.`)
      : kloelT(`Assim que você conversar com a Kloel, os históricos aparecem aqui para busca imediata.`);

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
          aria-label={ariaLabel}
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
              placeholder={placeholder}
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
            {searchError && hasActionableQuery && results.length > 0 && (
              <div className="kloel-search-group" role="status">
                {kloelT(`Busca real indisponível. Mostrando histórico local.`)}
              </div>
            )}
            {results.length === 0 ? (
              <div className="kloel-search-empty">
                <div className="kloel-search-result-icon" aria-hidden="true">
                  <Search size={18} aria-hidden="true" />
                </div>
                <div className="kloel-search-empty-title">{emptyTitle}</div>
                <div className="kloel-search-empty-copy">{emptyCopy}</div>
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
                        onSelect={() => openResult(item)}
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
