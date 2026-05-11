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
import {
  adminChatApi,
  type AdminChatSessionListPage,
  type AdminChatSessionView,
} from '@/lib/api/admin-chat-api';
import { useAdminSession } from '@/lib/auth/admin-session-context';

const SESSION_CACHE_SLOT = 'kloel-admin:chat-sessions';
const ACTIVE_SESSION_CACHE_SLOT = 'kloel-admin:chat-active';

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
  refreshSessions: (workspaceId?: string) => Promise<void>;
  upsertSession: (session: AdminChatSessionView) => void;
  getSessionById: (sessionId: string) => AdminChatSessionSummary | null;
  createServerSession: (workspaceId: string, title?: string) => Promise<AdminChatSessionSummary | null>;
  updateServerSession: (id: string, workspaceId: string, title: string) => Promise<void>;
  deleteServerSession: (id: string, workspaceId: string) => Promise<void>;
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

function writeSessionCache<T>(key: string, value: T) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function readSessionCache<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback;
  }
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
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
    const cachedSessions = readCache<AdminChatSessionSummary[]>(SESSION_CACHE_SLOT, []);
    sessionsRef.current = cachedSessions;
    setSessions(cachedSessions);
  }, []);

  useEffect(() => {
    setActiveSessionIdRaw(readSessionCache<string | null>(ACTIVE_SESSION_CACHE_SLOT, null));
  }, []);

  const setActiveSessionId = useCallback((sessionId: string | null) => {
    setActiveSessionIdRaw(sessionId);
    writeSessionCache(ACTIVE_SESSION_CACHE_SLOT, sessionId);
  }, []);

  const persistSessions = useCallback((nextSessions: AdminChatSessionSummary[]) => {
    const normalized = sortSessions(nextSessions).slice(0, 50);
    sessionsRef.current = normalized;
    setSessions(normalized);
    writeSessionCache(SESSION_CACHE_SLOT, normalized);
  }, []);

  const refreshSessions = useCallback(async (workspaceId?: string) => {
    if (!admin) {
      return;
    }
    try {
      const payload = await adminChatApi.listSessions(
        workspaceId ? { workspaceId } : undefined,
      );
      if (Array.isArray(payload)) {
        persistSessions(payload.map(mapSession));
      } else {
        persistSessions((payload as AdminChatSessionListPage).items.map(mapSession));
      }
    } catch {
      // Keep cached sessions when the API is temporarily unavailable.
    }
  }, [admin, persistSessions]);

  const refresh = useCallback(() => {
    void refreshSessions();
  }, [refreshSessions]);

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

    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [admin, refresh]);

  useEffect(() => {
    writeSessionCache(ACTIVE_SESSION_CACHE_SLOT, activeSessionId);
  }, [activeSessionId]);

  const upsertSession = useCallback((session: AdminChatSessionView) => {
    const mapped = mapSession(session);
    setSessions((current) => {
      const next = sortSessions([
        mapped,
        ...current.filter((entry) => entry.id !== mapped.id),
      ]).slice(0, 50);
      sessionsRef.current = next;
      writeSessionCache(SESSION_CACHE_SLOT, next);
      return next;
    });
    setActiveSessionIdRaw(mapped.id);
  }, []);

  const createServerSession = useCallback(
    async (workspaceId: string, title?: string) => {
      if (!admin) return null;
      try {
        const view = await adminChatApi.createSession(
          title !== undefined ? { workspaceId, title } : { workspaceId },
        );
        const mapped = mapSession(view);
        setSessions((current) => {
          const next = sortSessions([
            mapped,
            ...current.filter((entry) => entry.id !== mapped.id),
          ]).slice(0, 50);
          sessionsRef.current = next;
          writeSessionCache(SESSION_CACHE_SLOT, next);
          return next;
        });
        setActiveSessionIdRaw(mapped.id);
        return mapped;
      } catch {
        return null;
      }
    },
    [admin],
  );

  const updateServerSession = useCallback(
    async (id: string, workspaceId: string, title: string) => {
      if (!admin) return;
      try {
        const view = await adminChatApi.updateSession(id, { workspaceId, title });
        const mapped = mapSession(view);
        setSessions((current) => {
          const next = sortSessions([
            mapped,
            ...current.filter((entry) => entry.id !== mapped.id),
          ]).slice(0, 50);
          sessionsRef.current = next;
          writeSessionCache(SESSION_CACHE_SLOT, next);
          return next;
        });
      } catch {
        void refreshSessions(workspaceId);
      }
    },
    [admin, refreshSessions],
  );

  const deleteServerSession = useCallback(
    async (id: string, workspaceId: string) => {
      if (!admin) return;
      try {
        await adminChatApi.deleteSession(id, workspaceId);
        setSessions((current) => {
          const next = current.filter((entry) => entry.id !== id);
          sessionsRef.current = next;
          writeSessionCache(SESSION_CACHE_SLOT, next);
          return next;
        });
      } catch {
        void refreshSessions(workspaceId);
      }
    },
    [admin, refreshSessions],
  );

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
      createServerSession,
      updateServerSession,
      deleteServerSession,
    }),
    [
      activeSessionId,
      getSessionById,
      refreshSessions,
      sessions,
      setActiveSessionId,
      upsertSession,
      createServerSession,
      updateServerSession,
      deleteServerSession,
    ],
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
