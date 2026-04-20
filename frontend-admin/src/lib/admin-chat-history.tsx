'use client';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { adminChatApi, type AdminChatSessionView } from '@/lib/api/admin-chat-api';
import { useAdminSession } from '@/lib/auth/admin-session-context';

const CACHE_KEY_SESSIONS = 'kloel-admin:chat-sessions';
const CACHE_KEY_ACTIVE = 'kloel-admin:chat-active';

/** Admin chat session summary shape. */
export interface AdminChatSessionSummary {
  /** Id property. */
  id: string;
  /** Title property. */
  title: string;
  /** Updated at property. */
  updatedAt: string;
  /** Last message preview property. */
  lastMessagePreview: string;
  /** Message count property. */
  messageCount: number;
  /** Raw property. */
  raw: AdminChatSessionView;
}

interface AdminChatHistoryContextValue {
  sessions: AdminChatSessionSummary[];
  activeSessionId: string | null;
  setActiveSessionId: (sessionId: string | null) => void;
  refreshSessions: () => Promise<void>;
  upsertSession: (session: AdminChatSessionView) => void;
  getSessionById: (sessionId: string) => AdminChatSessionSummary | null;
}

const AdminChatHistoryContext = createContext<AdminChatHistoryContextValue | null>(null);

function readCache<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeCache<T>(key: string, value: T) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function deriveSessionTitle(session: AdminChatSessionView): string {
  const explicitTitle = String(session.title || '').trim();
  if (explicitTitle) {
    return explicitTitle;
  }

  const firstUserMessage = session.messages.find((message) => message.role === 'USER');
  const preview = String(firstUserMessage?.content || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!preview) {
    return 'Nova conversa';
  }
  return preview.length > 48 ? `${preview.slice(0, 45)}...` : preview;
}

function deriveSessionPreview(session: AdminChatSessionView): string {
  const lastVisibleMessage = [...session.messages]
    .reverse()
    .find((message) => message.role === 'USER' || message.role === 'ASSISTANT');
  const preview = String(lastVisibleMessage?.content || '')
    .replace(/\s+/g, ' ')
    .trim();
  return preview || 'Abra a conversa para retomar o contexto.';
}

function mapSession(session: AdminChatSessionView): AdminChatSessionSummary {
  return {
    id: session.id,
    title: deriveSessionTitle(session),
    updatedAt: session.lastUsedAt || session.createdAt,
    lastMessagePreview: deriveSessionPreview(session),
    messageCount: session.messages.length,
    raw: session,
  };
}

function sortSessions(items: AdminChatSessionSummary[]) {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left.updatedAt || 0).getTime();
    const rightTime = new Date(right.updatedAt || 0).getTime();
    return rightTime - leftTime;
  });
}

/** Admin chat history provider. */
export function AdminChatHistoryProvider({ children }: { children: ReactNode }) {
  const { admin } = useAdminSession();
  const [sessions, setSessions] = useState<AdminChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionIdRaw] = useState<string | null>(null);
  const sessionsRef = useRef<AdminChatSessionSummary[]>([]);

  useEffect(() => {
    const cachedSessions = readCache<AdminChatSessionSummary[]>(CACHE_KEY_SESSIONS, []);
    sessionsRef.current = cachedSessions;
    setSessions(cachedSessions);
    setActiveSessionIdRaw(readCache<string | null>(CACHE_KEY_ACTIVE, null));
  }, []);

  const persistSessions = useCallback((nextSessions: AdminChatSessionSummary[]) => {
    const normalized = sortSessions(nextSessions).slice(0, 50);
    sessionsRef.current = normalized;
    setSessions(normalized);
    writeCache(CACHE_KEY_SESSIONS, normalized);
  }, []);

  const refreshSessions = useCallback(async () => {
    if (!admin) {
      return;
    }
    try {
      const payload = await adminChatApi.listSessions();
      persistSessions(payload.map(mapSession));
    } catch {
      // Keep cached sessions when the API is temporarily unavailable.
    }
  }, [admin, persistSessions]);

  useEffect(() => {
    if (!admin) {
      persistSessions([]);
      setActiveSessionIdRaw(null);
      return;
    }
    void refreshSessions();
  }, [admin, persistSessions, refreshSessions]);

  useEffect(() => {
    if (!admin) {
      return;
    }

    const handleWindowFocus = () => {
      void refreshSessions();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshSessions();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [admin, refreshSessions]);

  useEffect(() => {
    writeCache(CACHE_KEY_ACTIVE, activeSessionId);
  }, [activeSessionId]);

  const setActiveSessionId = useCallback((sessionId: string | null) => {
    setActiveSessionIdRaw(sessionId);
  }, []);

  const upsertSession = useCallback((session: AdminChatSessionView) => {
    const mapped = mapSession(session);
    setSessions((current) => {
      const next = sortSessions([
        mapped,
        ...current.filter((entry) => entry.id !== mapped.id),
      ]).slice(0, 50);
      sessionsRef.current = next;
      writeCache(CACHE_KEY_SESSIONS, next);
      return next;
    });
    setActiveSessionIdRaw(mapped.id);
  }, []);

  const getSessionById = useCallback(
    (sessionId: string) => sessionsRef.current.find((session) => session.id === sessionId) || null,
    [],
  );

  const value = useMemo<AdminChatHistoryContextValue>(
    () => ({
      sessions,
      activeSessionId,
      setActiveSessionId,
      refreshSessions,
      upsertSession,
      getSessionById,
    }),
    [activeSessionId, getSessionById, refreshSessions, sessions, setActiveSessionId, upsertSession],
  );

  return (
    <AdminChatHistoryContext.Provider value={value}>{children}</AdminChatHistoryContext.Provider>
  );
}

/** Use admin chat history. */
export function useAdminChatHistory() {
  const context = useContext(AdminChatHistoryContext);
  if (!context) {
    throw new Error('useAdminChatHistory must be used within <AdminChatHistoryProvider>.');
  }
  return context;
}
