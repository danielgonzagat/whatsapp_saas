'use client';
import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
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

const STORAGE_KEY_CONVERSATIONS = 'kloel:conversations';
const STORAGE_KEY_ACTIVE_CONV = 'kloel:activeConv';

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable
  }
}

export function ConversationHistoryProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>(
    () => loadFromStorage<Conversation[]>(STORAGE_KEY_CONVERSATIONS, [])
  );
  const [activeConv, setActiveConv] = useState<string | null>(
    () => loadFromStorage<string | null>(STORAGE_KEY_ACTIVE_CONV, null)
  );

  // Sync with backend on mount
  useEffect(() => {
    apiFetch('/kloel/threads').then((res: any) => {
      if (Array.isArray(res) && res.length > 0) {
        const mapped = res.map((t: any) => ({ id: t.id, title: t.title, updatedAt: t.updatedAt }));
        setConversations(mapped);
        saveToStorage(STORAGE_KEY_CONVERSATIONS, mapped);
      }
    }).catch(() => {
      // Backend unavailable — use localStorage cache
    });
  }, []);

  // Persist to localStorage whenever conversations change
  useEffect(() => {
    saveToStorage(STORAGE_KEY_CONVERSATIONS, conversations);
  }, [conversations]);

  useEffect(() => {
    saveToStorage(STORAGE_KEY_ACTIVE_CONV, activeConv);
  }, [activeConv]);

  const addConversation = useCallback(async (title?: string): Promise<string | null> => {
    try {
      const res: any = await apiFetch('/kloel/threads', { method: 'POST', body: { title: title || 'Nova conversa' } });
      if (res?.id) {
        const conv = { id: res.id, title: res.title || 'Nova conversa', updatedAt: res.updatedAt };
        setConversations(prev => [conv, ...prev].slice(0, 50));
        return res.id;
      }
    } catch {
      // Fallback: local-only
      const localId = 'local_' + Date.now();
      setConversations(prev => [{ id: localId, title: title || 'Nova conversa' }, ...prev].slice(0, 50));
      return localId;
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
      localStorage.removeItem(STORAGE_KEY_CONVERSATIONS);
      localStorage.removeItem(STORAGE_KEY_ACTIVE_CONV);
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
