'use client';
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

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

export function ConversationHistoryProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<number | null>(null);

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
