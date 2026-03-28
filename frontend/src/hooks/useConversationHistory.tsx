'use client';
import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

interface Conversation {
  id: number;
  title: string;
}

interface ConversationHistoryContextType {
  conversations: Conversation[];
  activeConv: number | null;
  addConversation: (id: number, title: string) => void;
  updateConversationTitle: (id: number, title: string) => void;
  setActiveConversation: (id: number | null) => void;
  clearAll: () => void;
}

const ConversationHistoryContext = createContext<ConversationHistoryContextType>({
  conversations: [],
  activeConv: null,
  addConversation: () => {},
  updateConversationTitle: () => {},
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
    // Storage full or unavailable — silently ignore
  }
}

export function ConversationHistoryProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>(
    () => loadFromStorage<Conversation[]>(STORAGE_KEY_CONVERSATIONS, [])
  );
  const [activeConv, setActiveConv] = useState<number | null>(
    () => loadFromStorage<number | null>(STORAGE_KEY_ACTIVE_CONV, null)
  );

  // Persist conversations whenever they change
  useEffect(() => {
    saveToStorage(STORAGE_KEY_CONVERSATIONS, conversations);
  }, [conversations]);

  // Persist active conversation whenever it changes
  useEffect(() => {
    saveToStorage(STORAGE_KEY_ACTIVE_CONV, activeConv);
  }, [activeConv]);

  const addConversation = useCallback((id: number, title: string) => {
    setConversations(prev => {
      if (prev.some(c => c.id === id)) return prev;
      return [{ id, title }, ...prev].slice(0, 20);
    });
  }, []);

  const updateConversationTitle = useCallback((id: number, title: string) => {
    setConversations(prev =>
      prev.map(c => c.id === id ? { ...c, title } : c)
    );
  }, []);

  const setActiveConversation = useCallback((id: number | null) => {
    setActiveConv(id);
  }, []);

  const clearAll = useCallback(() => {
    setConversations([]);
    setActiveConv(null);
    try {
      localStorage.removeItem(STORAGE_KEY_CONVERSATIONS);
      localStorage.removeItem(STORAGE_KEY_ACTIVE_CONV);
    } catch {
      // Ignore storage errors
    }
  }, []);

  return (
    <ConversationHistoryContext.Provider value={{ conversations, activeConv, addConversation, updateConversationTitle, setActiveConversation, clearAll }}>
      {children}
    </ConversationHistoryContext.Provider>
  );
}

export function useConversationHistory() {
  return useContext(ConversationHistoryContext);
}
