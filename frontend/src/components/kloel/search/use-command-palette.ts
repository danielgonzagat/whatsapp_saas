'use client';

import { useConversationHistory } from '@/hooks/useConversationHistory';
import { searchKloelThreads } from '@/lib/kloel-conversations';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type ConversationSearchResult,
  groupConversationSearchResults,
} from './conversation-search-utils';
import { mapRecentConversation, mapSearchPayload } from './command-palette-utils';

export interface UseCommandPaletteArgs {
  open: boolean;
  initialSearch?: string;
}

export function useCommandPalette({ open, initialSearch }: UseCommandPaletteArgs) {
  const { conversations, setActiveConversation } = useConversationHistory();

  const [query, setQuery] = useState(initialSearch || '');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [remoteResults, setRemoteResults] = useState<ConversationSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefsRef = useRef<Array<HTMLButtonElement | null>>([]);

  const recentResults = useMemo(
    () => conversations.slice(0, 20).map((conversation) => mapRecentConversation(conversation)),
    [conversations],
  );

  const localMatches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return recentResults;
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
        if (!cancelled) setIsSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  const results = useMemo(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return recentResults;
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
    const selectedNode = itemRefsRef.current[selectedIndex];
    selectedNode?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIndex]);

  const groupedResults = useMemo(() => groupConversationSearchResults(results), [results]);

  return {
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
  };
}
