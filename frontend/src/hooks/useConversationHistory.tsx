'use client';
import { createContext, useContext, useState, useCallback, useEffect, ReactNode, useRef } from 'react';
import { mutate as globalMutate } from 'swr';
import { apiFetch } from '@/lib/api';

interface Conversation {
  id: string;
  title: string;
  updatedAt?: string;
}

interface ConversationHistoryContextType {
  conversations: Conversation[];
  activeConv: string | null;
  addConversation: (title?: string) => Promise<string | null>;
  updateConversationTitle: (id: string, title: string) => void;
  deleteConversation: (id: string) => void;
  setActiveConversation: (id: string | null) => void;
  upsertConversation: (conversation: Conversation) => void;
  refreshConversations: () => Promise<void>;
  clearAll: () => void;
}

const ConversationHistoryContext = createContext<ConversationHistoryContextType>({
  conversations: [],
  activeConv: null,
  addConversation: async () => null,
  updateConversationTitle: () => {},
  deleteConversation: () => {},
  setActiveConversation: () => {},
  upsertConversation: () => {},
  refreshConversations: async () => {},
  clearAll: () => {},
});

const CACHE_KEY_CONVERSATIONS = 'kloel:conversations';
const CACHE_KEY_ACTIVE_CONV = 'kloel:activeConv';

function readCache<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
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

export function ConversationHistoryProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [cacheHydrated, setCacheHydrated] = useState(false);
  const didSyncRef = useRef(false);

  const applyConversations = useCallback((nextConversations: Conversation[]) => {
    const normalized = nextConversations
      .filter((conversation) => isValidConversationId(conversation?.id))
      .map((conversation) => ({
        id: conversation.id,
        title: String(conversation.title || 'Nova conversa').trim() || 'Nova conversa',
        updatedAt: conversation.updatedAt,
      }))
      .sort((a, b) => {
        const aTime = new Date(a.updatedAt || 0).getTime();
        const bTime = new Date(b.updatedAt || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, 50);

    setConversations(normalized);
    writeCache(CACHE_KEY_CONVERSATIONS, normalized);
    setActiveConv((current) =>
      current && !normalized.some((conversation) => conversation.id === current)
        ? null
        : current,
    );
  }, []);

  const refreshConversations = useCallback(async () => {
    try {
      const res: any = await apiFetch('/kloel/threads');
      const threads = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      const mapped = threads.map((t: any) => ({
        id: t.id,
        title: t.title,
        updatedAt: t.updatedAt,
      }));
      applyConversations(mapped);
    } catch {
      // Keep cached conversations when backend is temporarily unavailable
    }
  }, [applyConversations]);

  useEffect(() => {
    const cachedConversations = readCache<Conversation[]>(CACHE_KEY_CONVERSATIONS, []).filter(
      (conversation) => isValidConversationId(conversation?.id),
    );
    const cachedActiveConversation = readCache<string | null>(
      CACHE_KEY_ACTIVE_CONV,
      null,
    );

    setConversations(cachedConversations);
    setActiveConv(
      cachedActiveConversation && isValidConversationId(cachedActiveConversation)
        ? cachedActiveConversation
        : null,
    );
    setCacheHydrated(true);
  }, []);

  // Sync from backend on mount — backend is the source of truth
  useEffect(() => {
    if (didSyncRef.current) return;
    didSyncRef.current = true;

    void refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    const handleVisibilityRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshConversations();
    };
    const handleWindowFocus = () => {
      void refreshConversations();
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityRefresh);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityRefresh);
    };
  }, [refreshConversations]);

  // Update cache whenever conversations change (write-through cache)
  useEffect(() => {
    if (!cacheHydrated) return;
    writeCache(CACHE_KEY_CONVERSATIONS, conversations);
  }, [cacheHydrated, conversations]);

  useEffect(() => {
    if (!cacheHydrated) return;
    writeCache(CACHE_KEY_ACTIVE_CONV, activeConv);
  }, [activeConv, cacheHydrated]);

  const addConversation = useCallback(async (title?: string): Promise<string | null> => {
    try {
      const res: any = await apiFetch('/kloel/threads', { method: 'POST', body: { title: title || 'Nova conversa' } });
      const payload = res?.data && typeof res.data === 'object' ? res.data : res;
      if (payload?.id && isValidConversationId(payload.id)) {
        const conv = { id: payload.id, title: payload.title || 'Nova conversa', updatedAt: payload.updatedAt };
        setConversations(prev => [conv, ...prev].slice(0, 50));
        return payload.id;
      }
    } catch {
      // Backend unavailable — cannot create conversation without persistence
    }
    return null;
  }, []);

  const updateConversationTitle = useCallback((id: string, title: string) => {
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title } : c));
    apiFetch(`/kloel/threads/${id}`, { method: 'PUT', body: { title } }).then(() => {
      globalMutate((key: string) => typeof key === 'string' && key.startsWith('/kloel/threads'));
    }).catch(() => {});
  }, []);

  const deleteConversation = useCallback((id: string) => {
    setConversations(prev => prev.filter(c => c.id !== id));
    apiFetch(`/kloel/threads/${id}`, { method: 'DELETE' }).then(() => {
      globalMutate((key: string) => typeof key === 'string' && key.startsWith('/kloel/threads'));
    }).catch(() => {});
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
        },
        ...prev.filter((entry) => entry.id !== conversation.id),
      ].slice(0, 50);

      writeCache(CACHE_KEY_CONVERSATIONS, next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setConversations([]);
    setActiveConv(null);
    try {
      localStorage.removeItem(CACHE_KEY_CONVERSATIONS);
      localStorage.removeItem(CACHE_KEY_ACTIVE_CONV);
    } catch {}
  }, []);

  return (
    <ConversationHistoryContext.Provider value={{ conversations, activeConv, addConversation, updateConversationTitle, deleteConversation, setActiveConversation, upsertConversation, refreshConversations, clearAll }}>
      {children}
    </ConversationHistoryContext.Provider>
  );
}

export function useConversationHistory() {
  return useContext(ConversationHistoryContext);
}
