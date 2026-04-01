'use client';
import { createContext, useContext, useState, useCallback, useEffect, ReactNode, useRef } from 'react';
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
  clearAll: () => void;
}

const ConversationHistoryContext = createContext<ConversationHistoryContextType>({
  conversations: [],
  activeConv: null,
  addConversation: async () => null,
  updateConversationTitle: () => {},
  deleteConversation: () => {},
  setActiveConversation: () => {},
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

export function ConversationHistoryProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [cacheHydrated, setCacheHydrated] = useState(false);
  const didSyncRef = useRef(false);

  useEffect(() => {
    setConversations(readCache<Conversation[]>(CACHE_KEY_CONVERSATIONS, []));
    setActiveConv(readCache<string | null>(CACHE_KEY_ACTIVE_CONV, null));
    setCacheHydrated(true);
  }, []);

  // Sync from backend on mount — backend is the source of truth
  useEffect(() => {
    if (didSyncRef.current) return;
    didSyncRef.current = true;

    apiFetch('/kloel/threads').then((res: any) => {
      if (Array.isArray(res)) {
        const mapped = res.map((t: any) => ({ id: t.id, title: t.title, updatedAt: t.updatedAt }));
        setConversations(mapped);
        writeCache(CACHE_KEY_CONVERSATIONS, mapped);
      }
    }).catch(() => {
      // Backend unavailable — keep cached conversations for read-only display
    });
  }, []);

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
      if (res?.id) {
        const conv = { id: res.id, title: res.title || 'Nova conversa', updatedAt: res.updatedAt };
        setConversations(prev => [conv, ...prev].slice(0, 50));
        return res.id;
      }
    } catch {
      // Backend unavailable — cannot create conversation without persistence
    }
    return null;
  }, []);

  const updateConversationTitle = useCallback((id: string, title: string) => {
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title } : c));
    apiFetch(`/kloel/threads/${id}`, { method: 'PUT', body: { title } }).catch(() => {});
  }, []);

  const deleteConversation = useCallback((id: string) => {
    setConversations(prev => prev.filter(c => c.id !== id));
    apiFetch(`/kloel/threads/${id}`, { method: 'DELETE' }).catch(() => {});
  }, []);

  const setActiveConversation = useCallback((id: string | null) => {
    setActiveConv(id);
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
    <ConversationHistoryContext.Provider value={{ conversations, activeConv, addConversation, updateConversationTitle, deleteConversation, setActiveConversation, clearAll }}>
      {children}
    </ConversationHistoryContext.Provider>
  );
}

export function useConversationHistory() {
  return useContext(ConversationHistoryContext);
}
