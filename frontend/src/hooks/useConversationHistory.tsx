'use client';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/components/kloel/auth/auth-provider';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { mutate } from 'swr';

interface Conversation {
  id: string;
  title: string;
  updatedAt?: string | undefined;
  lastMessagePreview?: string | undefined;
}

interface ConversationApiPayload {
  items?: unknown;
  total?: unknown;
  nextCursor?: unknown;
  hasMore?: unknown;
  [key: string]: unknown;
}

interface ThreadPage {
  items: Conversation[];
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
}

const CONVERSATION_PAGE_SIZE = 20;

interface ConversationHistoryContextType {
  conversations: Conversation[];
  activeConv: string | null;
  hasMoreConversations: boolean;
  isLoadingMoreConversations: boolean;
  totalConversations: number | null;
  lastError: Error | null;
  addConversation: (title?: string) => Promise<string | null>;
  updateConversationTitle: (id: string, title: string) => void;
  deleteConversation: (id: string) => void;
  setActiveConversation: (id: string | null) => void;
  upsertConversation: (conversation: Conversation) => void;
  refreshConversations: () => Promise<void>;
  loadMoreConversations: () => Promise<void>;
  loadAllConversations: () => Promise<Conversation[]>;
  clearAll: () => void;
}

const ConversationHistoryContext = createContext<ConversationHistoryContextType>({
  conversations: [],
  activeConv: null,
  hasMoreConversations: false,
  isLoadingMoreConversations: false,
  totalConversations: null,
  lastError: null,
  addConversation: async () => null,
  updateConversationTitle: () => {},
  deleteConversation: () => {},
  setActiveConversation: () => {},
  upsertConversation: () => {},
  refreshConversations: async () => {},
  loadMoreConversations: async () => {},
  loadAllConversations: async () => [],
  clearAll: () => {},
});

function isValidConversationId(value?: string | null): boolean {
  const normalized = String(value || '').trim();
  return Boolean(normalized) && !normalized.startsWith('local_');
}

function normalizeConversation(conversation: Conversation): Conversation {
  return {
    id: conversation.id,
    title: String(conversation.title || 'Nova conversa').trim() || 'Nova conversa',
    updatedAt: conversation.updatedAt,
    lastMessagePreview: String(conversation.lastMessagePreview || '').trim(),
  };
}

function sortConversations(items: Conversation[]): Conversation[] {
  return [...items].sort((a, b) => {
    const aTime = new Date(a.updatedAt || 0).getTime();
    const bTime = new Date(b.updatedAt || 0).getTime();
    return bTime - aTime;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isConversationPayload(value: unknown): value is Conversation {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    isOptionalString(value.updatedAt) &&
    isOptionalString(value.lastMessagePreview)
  );
}

function unwrapConversationPayload(response: unknown): unknown {
  if (isRecord(response) && typeof response.error === 'string' && response.error.length > 0) {
    throw new Error(response.error);
  }
  if (isRecord(response) && 'data' in response) {
    return response.data;
  }
  return response;
}

function readThreadPage(response: unknown): ThreadPage {
  const payload = unwrapConversationPayload(response);
  if (Array.isArray(payload)) {
    if (!payload.every(isConversationPayload)) {
      throw new Error('Invalid Kloel thread payload');
    }
    return { items: payload, total: payload.length, nextCursor: null, hasMore: false };
  }
  if (!isRecord(payload)) {
    throw new Error('Invalid Kloel thread payload');
  }
  if (
    !Array.isArray(payload.items) ||
    !payload.items.every(isConversationPayload) ||
    typeof payload.total !== 'number' ||
    !Number.isFinite(payload.total) ||
    !(payload.nextCursor === null || payload.nextCursor === undefined || typeof payload.nextCursor === 'string') ||
    typeof payload.hasMore !== 'boolean'
  ) {
    throw new Error('Invalid Kloel thread payload');
  }
  return {
    items: payload.items,
    total: payload.total,
    nextCursor: typeof payload.nextCursor === 'string' ? payload.nextCursor : null,
    hasMore: payload.hasMore,
  };
}

/** Conversation history provider. */
export function ConversationHistoryProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] = useState(false);
  const [totalConversations, setTotalConversations] = useState<number | null>(null);
  const [lastError, setLastError] = useState<Error | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const didSyncRef = useRef(false);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  const applyConversations = useCallback((nextConversations: Conversation[]) => {
    const normalized = sortConversations(
      nextConversations
        .filter((conversation) => isValidConversationId(conversation?.id))
        .map(normalizeConversation),
    );

    setConversations(normalized);
    setActiveConv((current) =>
      current && !normalized.some((conversation) => conversation.id === current) ? null : current,
    );
  }, []);

  const mergeConversations = useCallback((incoming: Conversation[]) => {
    setConversations((prev) => {
      const existing = new Map(prev.map((c) => [c.id, c]));
      for (const conv of incoming) {
        if (!isValidConversationId(conv?.id)) {
          continue;
        }
        existing.set(conv.id, normalizeConversation(conv));
      }
      return sortConversations(Array.from(existing.values()));
    });
  }, []);

  const refreshConversations = useCallback(async () => {
    if (!isAuthenticated) {
      return;
    }
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const refreshPromise = (async () => {
      try {
        const res = await apiFetch<ConversationApiPayload>(
          `/kloel/threads?limit=${CONVERSATION_PAGE_SIZE}`,
        );
        const page = readThreadPage(res);
        applyConversations(page.items);
        setNextCursor(page?.nextCursor ?? null);
        setHasMoreConversations(Boolean(page?.hasMore));
        setTotalConversations(typeof page?.total === 'number' ? page.total : page.items.length);
        setLastError(null);
      } catch (error) {
        setLastError(error instanceof Error ? error : new Error(String(error || 'kloel_threads_failed')));
        // Keep current conversations when backend is temporarily unavailable.
      }
    })();

    refreshInFlightRef.current = refreshPromise;
    try {
      await refreshPromise;
    } finally {
      if (refreshInFlightRef.current === refreshPromise) {
        refreshInFlightRef.current = null;
      }
    }
  }, [applyConversations, isAuthenticated]);

  const loadMoreConversations = useCallback(async () => {
    if (!isAuthenticated || !hasMoreConversations || isLoadingMoreConversations || !nextCursor) {
      return;
    }
    setIsLoadingMoreConversations(true);
    try {
      const res = await apiFetch<ConversationApiPayload>(
        `/kloel/threads?limit=${CONVERSATION_PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`,
      );
      const page = readThreadPage(res);
      mergeConversations(page.items);
      setNextCursor(page?.nextCursor ?? null);
      setHasMoreConversations(Boolean(page?.hasMore));
      setTotalConversations(typeof page?.total === 'number' ? page.total : null);
      setLastError(null);
    } catch (error) {
      setLastError(error instanceof Error ? error : new Error(String(error || 'kloel_threads_failed')));
      // Keep the current list; the sentinel can retry on the next scroll.
    } finally {
      setIsLoadingMoreConversations(false);
    }
  }, [
    hasMoreConversations,
    isAuthenticated,
    isLoadingMoreConversations,
    mergeConversations,
    nextCursor,
  ]);

  const loadAllConversations = useCallback(async (): Promise<Conversation[]> => {
    if (!isAuthenticated) {
      return [];
    }
    try {
      const all: Conversation[] = [];
      let cursor: string | null = null;
      let keepGoing = true;
      while (keepGoing) {
        const query: string = cursor
          ? `/kloel/threads?limit=50&cursor=${encodeURIComponent(cursor)}`
          : '/kloel/threads?limit=50';
        const res = await apiFetch<ConversationApiPayload>(query);
        const page = readThreadPage(res);
        all.push(...page.items);
        cursor = page?.nextCursor ?? null;
        keepGoing = Boolean(page?.hasMore && cursor);
      }
      mergeConversations(all);
      setNextCursor(null);
      setHasMoreConversations(false);
      setTotalConversations(all.length);
      setLastError(null);
      return all;
    } catch (error) {
      const historyError = error instanceof Error ? error : new Error(String(error || 'kloel_threads_failed'));
      setLastError(historyError);
      throw historyError;
    }
  }, [isAuthenticated, mergeConversations]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!isAuthenticated) {
      didSyncRef.current = false;
      queueMicrotask(() => {
        setConversations([]);
        setActiveConv(null);
      });
      return;
    }

    if (didSyncRef.current) {
      return;
    }
    didSyncRef.current = true;

    queueMicrotask(() => {
      void refreshConversations();
    });
  }, [isAuthenticated, isLoading, refreshConversations]);

  useEffect(() => {
    const handleVisibilityRefresh = () => {
      if (!isAuthenticated || isLoading) {
        return;
      }
      if (document.visibilityState !== 'visible') {
        return;
      }
      void refreshConversations();
    };
    const handleWindowFocus = () => {
      if (!isAuthenticated || isLoading) {
        return;
      }
      void refreshConversations();
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityRefresh);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityRefresh);
    };
  }, [isAuthenticated, isLoading, refreshConversations]);

  const addConversation = useCallback(async (title?: string): Promise<string | null> => {
    setLastError(null);
    try {
      const res = await apiFetch<Partial<Conversation>>('/kloel/threads', {
        method: 'POST',
        body: { title: title || 'Nova conversa' },
      });
      const payload = res?.data;
      if (payload?.id && isValidConversationId(payload.id)) {
        const conv: Conversation = {
          id: payload.id,
          title: payload.title || 'Nova conversa',
          updatedAt: payload.updatedAt,
          lastMessagePreview: payload.lastMessagePreview,
        };
        setConversations((prev) => [conv, ...prev]);
        return payload.id;
      }
      throw new Error('Payload de conversa criado invalido.');
    } catch (error) {
      setLastError(error instanceof Error ? error : new Error(String(error || 'kloel_thread_create_failed')));
    }
    return null;
  }, []);

  const updateConversationTitle = useCallback((id: string, title: string) => {
    setLastError(null);
    apiFetch(`/kloel/threads/${id}`, { method: 'PUT', body: { title } })
      .then((res) => {
        if (res.error) {
          throw new Error(res.error);
        }
        setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
        mutate((key: string) => typeof key === 'string' && key.startsWith('/kloel/threads'));
      })
      .catch((error: unknown) => {
        setLastError(error instanceof Error ? error : new Error(String(error || 'kloel_thread_rename_failed')));
      });
  }, []);

  const deleteConversation = useCallback((id: string) => {
    setLastError(null);
    apiFetch(`/kloel/threads/${id}`, { method: 'DELETE' })
      .then((res) => {
        if (res.error) {
          throw new Error(res.error);
        }
        setConversations((prev) => prev.filter((c) => c.id !== id));
        setActiveConv((current) => (current === id ? null : current));
        mutate((key: string) => typeof key === 'string' && key.startsWith('/kloel/threads'));
      })
      .catch((error: unknown) => {
        setLastError(error instanceof Error ? error : new Error(String(error || 'kloel_thread_delete_failed')));
      });
  }, []);

  const setActiveConversation = useCallback((id: string | null) => {
    setActiveConv(id);
  }, []);

  const upsertConversation = useCallback((conversation: Conversation) => {
    setConversations((prev) => {
      const next = [
        {
          id: conversation.id,
          title: String(conversation.title || 'Nova conversa').trim() || 'Nova conversa',
          updatedAt: conversation.updatedAt || new Date().toISOString(),
          lastMessagePreview: String(conversation.lastMessagePreview || '').trim(),
        },
        ...prev.filter((entry) => entry.id !== conversation.id),
      ];

      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setConversations([]);
    setActiveConv(null);
  }, []);

  return (
    <ConversationHistoryContext.Provider
      value={{
        conversations,
        activeConv,
        hasMoreConversations,
        isLoadingMoreConversations,
        totalConversations,
        lastError,
        addConversation,
        updateConversationTitle,
        deleteConversation,
        setActiveConversation,
        upsertConversation,
        refreshConversations,
        loadMoreConversations,
        loadAllConversations,
        clearAll,
      }}
    >
      {children}
    </ConversationHistoryContext.Provider>
  );
}

/** Use conversation history. */
export function useConversationHistory() {
  return useContext(ConversationHistoryContext);
}
