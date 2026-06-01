'use client';

import { useConversationHistory } from '@/hooks/useConversationHistory';
import { searchKloelGlobal } from '@/lib/api/kloel-search';
import { searchKloelThreads } from '@/lib/kloel-conversations';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type ConversationSearchResult,
  groupConversationSearchResults,
} from './conversation-search-utils';
import {
  mapGlobalSearchPayload,
  mapRecentConversation,
  mapSearchPayload,
} from './command-palette-utils';

export type CommandPaletteMode = 'full' | 'conversations';

/** Use command palette args shape. */
export interface UseCommandPaletteArgs {
  /** Open property. */
  open?: boolean | undefined;
  /** Initial search property. */
  initialSearch?: string | undefined;
  /** Search mode property. */
  mode?: CommandPaletteMode | undefined;
}

/** Use command palette. */
export function useCommandPalette({ open, initialSearch, mode = 'full' }: UseCommandPaletteArgs) {
  const { conversations, loadAllConversations, setActiveConversation } = useConversationHistory();

  const [query, setQuery] = useState(initialSearch || '');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [remoteResults, setRemoteResults] = useState<ConversationSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefsRef = useRef<Array<HTMLButtonElement | null>>([]);

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

  // Reset the palette whenever it (re)opens or the seed query changes. The
  // resets run in a microtask (not synchronously in the effect body) to satisfy
  // react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) {
        return;
      }
      setQuery(initialSearch || '');
      setSelectedIndex(0);
      setRemoteResults([]);
      setIsSearching(false);
      setSearchError(null);
    });
    return () => {
      cancelled = true;
    };
  }, [initialSearch, open]);

  useEffect(() => {
    if (!(open && mode === 'conversations')) {
      return;
    }

    let cancelled = false;
    void loadAllConversations().catch((err: unknown) => {
      if (cancelled) {
        return;
      }
      setSearchError(err instanceof Error ? err.message : 'conversation_history_failed');
    });

    return () => {
      cancelled = true;
    };
  }, [loadAllConversations, mode, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 32);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // A remote search only runs for queries of 2+ chars; for shorter queries the
  // stale remote state is ignored during render rather than reset in an effect
  // (react-hooks/set-state-in-effect).
  const isQueryActionable = open === true && query.trim().length >= 2;

  useEffect(() => {
    if (!isQueryActionable) {
      return;
    }

    const normalizedQuery = query.trim();
    let cancelled = false;

    // State updates run inside async callbacks (never synchronously in the
    // effect body) to satisfy react-hooks/set-state-in-effect.
    const startTimer = window.setTimeout(() => {
      if (!cancelled) {
        setIsSearching(true);
        setRemoteResults([]);
        setSearchError(null);
      }
    }, 0);

    const timer = window.setTimeout(async () => {
      try {
        const results =
          mode === 'conversations'
            ? (await searchKloelThreads(normalizedQuery, 20)).map((result) =>
                mapSearchPayload(result),
              )
            : (await searchKloelGlobal(normalizedQuery, 20)).results.map((result) =>
                mapGlobalSearchPayload(result),
              );
        if (cancelled) {
          return;
        }
        setRemoteResults(results);
        setSearchError(null);
      } catch (err) {
        if (cancelled) {
          return;
        }
        setRemoteResults([]);
        setSearchError(err instanceof Error ? err.message : 'search_failed');
      } finally {
        if (!cancelled) {
          setIsSearching(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      window.clearTimeout(timer);
    };
  }, [isQueryActionable, mode, query]);

  // Ignore stale remote state when the query is not actionable.
  const effectiveRemoteResults = useMemo(
    () => (isQueryActionable ? remoteResults : []),
    [isQueryActionable, remoteResults],
  );
  const effectiveIsSearching = isQueryActionable && isSearching;

  const results = useMemo(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return recentResults;
    }
    const primary = effectiveRemoteResults.length > 0 ? effectiveRemoteResults : localMatches;
    const seen = new Set(primary.map((item) => item.id));
    const extras = localMatches.filter((item) => !seen.has(item.id));
    return [...primary, ...extras].slice(0, 20);
  }, [localMatches, query, recentResults, effectiveRemoteResults]);

  // Clamp during render instead of syncing into state via an effect
  // (react-hooks/set-state-in-effect). `selectedIndex` is still the raw stored
  // cursor; `clampedSelectedIndex` is what consumers read/scroll to.
  const clampedSelectedIndex =
    results.length === 0 ? 0 : Math.min(selectedIndex, results.length - 1);

  useEffect(() => {
    const selectedNode = itemRefsRef.current[clampedSelectedIndex];
    selectedNode?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [clampedSelectedIndex]);

  const groupedResults = useMemo(() => groupConversationSearchResults(results), [results]);

  return {
    query,
    setQuery,
    selectedIndex: clampedSelectedIndex,
    setSelectedIndex,
    isSearching: effectiveIsSearching,
    searchError,
    results,
    groupedResults,
    inputRef,
    itemRefsRef,
    setActiveConversation,
  };
}
