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
  updatedAt?: string;
  lastMessagePreview?: string;
}

interface ConversationHistoryContextType {
  conversations: Conversation[];
  activeConv: string | null;
  hasMoreConversations: boolean;
  isLoadingMoreConversations: boolean;
  totalConversations: number | null;
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

const CONVERSATIONS_CACHE_SLOT = 'kloel:conversations';
const ACTIVE_CONVERSATION_CACHE_SLOT = 'kloel:activeConv';
const CONVERSATION_PAGE_SIZE = 20;

interface ThreadPage {
  items: Conversation[];
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
}

function readCache<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable
  }
}

function isValidConversationId(value?: string | null): boolean {
  const normalized = String(value || '').trim();
  return Boolean(normalized) && !normalized.startsWith('local_');
}

/** Conversation history provider. */
export function ConversationHistoryProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] = useState(false);
  const [totalConversations, setTotalConversations] = useState<number | null>(null);
  const [cacheHydrated, setCacheHydrated] = useState(false);
  const didSyncRef = useRef(false);

  const applyConversations = useCallback((nextConversations: Conversation[]) => {
    const normalized = nextConversations
      .filter((conversation) => isValidConversationId(conversation?.id))
      .map((conversation) => ({
        id: conversation.id,
        title: String(conversation.title || 'Nova conversa').trim() || 'Nova conversa',
        updatedAt: conversation.updatedAt,
        lastMessagePreview: String(conversation.lastMessagePreview || '').trim(),
      }))
      .sort((a, b) => {
        const aTime = new Date(a.updatedAt || 0).getTime();
        const bTime = new Date(b.updatedAt || 0).getTime();
        return bTime - aTime;
      });

    setConversations(normalized);
    writeCache(CONVERSATIONS_CACHE_SLOT, normalized);
    setActiveConv((current) =>
      current && !normalized.some((conversation) => conversation.id === current) ? null : current,
    );
  }, []);

  const mergeConversations = useCallback((nextConversations: Conversation[]) => {
    setConversations((prev) => {
      const byId = new Map<string, Conversation>();
      for (const conversation of [...prev, ...nextConversations]) {
        if (!isValidConversationId(conversation.id)) {
          continue;
        }
        byId.set(conversation.id, {
          id: conversation.id,
          title: String(conversation.title || 'Nova conversa').trim() || 'Nova conversa',
          updatedAt: conversation.updatedAt,
          lastMessagePreview: String(conversation.lastMessagePreview || '').trim(),
        });
      }
      const merged = Array.from(byId.values()).sort((a, b) => {
        const aTime = new Date(a.updatedAt || 0).getTime();
        const bTime = new Date(b.updatedAt || 0).getTime();
        return bTime - aTime;
      });
      writeCache(CONVERSATIONS_CACHE_SLOT, merged);
      return merged;
    });
  }, []);

  const refreshConversations = useCallback(async () => {
    if (!isAuthenticated) {
      return;
    }
    try {
      const res = await apiFetch<ThreadPage>(`/kloel/threads?limit=${CONVERSATION_PAGE_SIZE}`);
      const page = res?.data;
      const threads: Conversation[] = Array.isArray(page?.items) ? page.items : [];
      const mapped = threads.map((t) => ({
        id: t.id,
        title: t.title,
        updatedAt: t.updatedAt,
        lastMessagePreview: t.lastMessagePreview,
      }));
      applyConversations(mapped);
      setNextCursor(page?.nextCursor ?? null);
      setHasMoreConversations(Boolean(page?.hasMore));
      setTotalConversations(typeof page?.total === 'number' ? page.total : mapped.length);
    } catch {
      // Keep cached conversations when backend is temporarily unavailable
    }
  }, [applyConversations, isAuthenticated]);

  const loadMoreConversations = useCallback(async () => {
    if (!isAuthenticated || !hasMoreConversations || isLoadingMoreConversations || !nextCursor) {
      return;
    }
    setIsLoadingMoreConversations(true);
    try {
      const res = await apiFetch<ThreadPage>(
        `/kloel/threads?limit=${CONVERSATION_PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`,
      );
      const page = res?.data;
      const threads = Array.isArray(page?.items) ? page.items : [];
      mergeConversations(threads);
      setNextCursor(page?.nextCursor ?? null);
      setHasMoreConversations(Boolean(page?.hasMore));
      setTotalConversations(typeof page?.total === 'number' ? page.total : null);
    } catch {
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
      return conversations;
    }
    const all: Conversation[] = [];
    let cursor: string | null = null;
    let keepGoing = true;
    while (keepGoing) {
      const query: string = cursor
        ? `/kloel/threads?limit=50&cursor=${encodeURIComponent(cursor)}`
        : '/kloel/threads?limit=50';
      const res: { data?: ThreadPage } = await apiFetch<ThreadPage>(query);
      const page: ThreadPage | undefined = res.data;
      const items = Array.isArray(page?.items) ? page.items : [];
      all.push(...items);
      cursor = page?.nextCursor ?? null;
      keepGoing = Boolean(page?.hasMore && cursor);
    }
    mergeConversations(all);
    setNextCursor(null);
    setHasMoreConversations(false);
    setTotalConversations(all.length);
    return all;
  }, [conversations, isAuthenticated, mergeConversations]);

  useEffect(() => {
    const cachedConversations = readCache<Conversation[]>(CONVERSATIONS_CACHE_SLOT, []).filter(
      (conversation) => isValidConversationId(conversation?.id),
    );
    const cachedActiveConversation = readCache<string | null>(ACTIVE_CONVERSATION_CACHE_SLOT, null);

    setConversations(cachedConversations);
    setActiveConv(
      cachedActiveConversation && isValidConversationId(cachedActiveConversation)
        ? cachedActiveConversation
        : null,
    );
    setCacheHydrated(true);
  }, []);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!isAuthenticated) {
      didSyncRef.current = false;
      setConversations([]);
      setActiveConv(null);
      setNextCursor(null);
      setHasMoreConversations(false);
      setTotalConversations(null);
      try {
        localStorage.removeItem(CONVERSATIONS_CACHE_SLOT);
        localStorage.removeItem(ACTIVE_CONVERSATION_CACHE_SLOT);
      } catch {}
      return;
    }

    if (didSyncRef.current) {
      return;
    }
    didSyncRef.current = true;

    void refreshConversations();
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

  // Update cache whenever conversations change (write-through cache)
  useEffect(() => {
    if (!cacheHydrated) {
      return;
    }
    writeCache(CONVERSATIONS_CACHE_SLOT, conversations);
  }, [cacheHydrated, conversations]);

  useEffect(() => {
    if (!cacheHydrated) {
      return;
    }
    writeCache(ACTIVE_CONVERSATION_CACHE_SLOT, activeConv);
  }, [activeConv, cacheHydrated]);

  const addConversation = useCallback(async (title?: string): Promise<string | null> => {
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
    } catch {
      // Backend unavailable — cannot create conversation without persistence
    }
    return null;
  }, []);

  const updateConversationTitle = useCallback((id: string, title: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    apiFetch(`/kloel/threads/${id}`, { method: 'PUT', body: { title } })
      .then(() => {
        mutate((key: string) => typeof key === 'string' && key.startsWith('/kloel/threads'));
      })
      .catch(() => {});
  }, []);

  const deleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setActiveConv((current) => (current === id ? null : current));
    apiFetch(`/kloel/threads/${id}`, { method: 'DELETE' })
      .then(() => {
        mutate((key: string) => typeof key === 'string' && key.startsWith('/kloel/threads'));
      })
      .catch(() => {});
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

      writeCache(CONVERSATIONS_CACHE_SLOT, next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setConversations([]);
    setActiveConv(null);
    try {
      localStorage.removeItem(CONVERSATIONS_CACHE_SLOT);
      localStorage.removeItem(ACTIVE_CONVERSATION_CACHE_SLOT);
    } catch {}
  }, []);

  return (
    <ConversationHistoryContext.Provider
      value={{
        conversations,
        activeConv,
        hasMoreConversations,
        isLoadingMoreConversations,
        totalConversations,
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
