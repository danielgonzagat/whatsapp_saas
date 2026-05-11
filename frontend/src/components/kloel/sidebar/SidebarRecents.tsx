'use client';
import { kloelT } from '@/lib/i18n/t';
import { useConversationHistory } from '@/hooks/useConversationHistory';
import { apiFetch } from '@/lib/api';
import { KLOEL_CHAT_ROUTE } from '@/lib/kloel-dashboard-context';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConversationsIcon } from './ConversationsIcon';

interface SidebarRecentsProps {
  expanded: boolean;
}

interface ConversationExportSource {
  id: string;
  title: string;
  updatedAt?: string;
  lastMessagePreview?: string;
}

function extractThreadMessages(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload as Array<Record<string, unknown>>;
  }
  const wrapped = payload as { data?: unknown };
  return Array.isArray(wrapped?.data) ? (wrapped.data as Array<Record<string, unknown>>) : [];
}

function serializeThreadMessages(payload: unknown) {
  const messages = [];
  for (const message of extractThreadMessages(payload)) {
    messages.push({
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    });
  }
  return messages;
}

async function fetchConversationForExport(conv: ConversationExportSource) {
  try {
    const response = await apiFetch<unknown>(`/kloel/threads/${conv.id}/messages`);
    return { ...conv, messages: serializeThreadMessages(response) };
  } catch {
    return { ...conv, messages: [] };
  }
}

/** Sidebar recents. */
export function SidebarRecents({ expanded }: SidebarRecentsProps) {
  const {
    conversations,
    setActiveConversation,
    hasMoreConversations,
    isLoadingMoreConversations,
    loadMoreConversations,
    loadAllConversations,
  } = useConversationHistory();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const [exporting, setExporting] = useState(false);
  const handleExport = useCallback(async () => {
    if (conversations.length === 0 || exporting) {
      return;
    }
    setExporting(true);
    try {
      const allConversations = await loadAllConversations();
      // Fetch full messages for each conversation from backend
      const full = await Promise.all(allConversations.map(fetchConversationForExport));
      const data = JSON.stringify(full, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kloel-conversas-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, [conversations.length, exporting, loadAllConversations]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !expanded || !hasMoreConversations) {
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          void loadMoreConversations();
        }
      },
      { root: sentinel.parentElement, rootMargin: '96px 0px', threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [expanded, hasMoreConversations, loadMoreConversations]);

  if (!expanded || conversations.length === 0) {
    return null;
  }

  const activeConversationId =
    pathname === KLOEL_CHAT_ROUTE || pathname === '/dashboard'
      ? searchParams.get('conversationId')
      : null;

  return (
    <div style={{ marginTop: 16, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          padding: '0 10px',
          marginBottom: 6,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: KLOEL_THEME.textTertiary,
            letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
          }}
        >
          {kloelT(`Recentes`)}
        </span>
        <button
          type="button"
          onClick={handleExport}
          title={kloelT(`Exportar todas as conversas`)}
          style={{
            background: 'none',
            border: 'none',
            cursor: exporting ? 'wait' : 'pointer',
            color: exporting ? KLOEL_THEME.accent : KLOEL_THEME.textSecondary,
            padding: '2px 4px',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            borderRadius: 4,
            transition: 'color .15s',
          }}
          onMouseEnter={(e) => {
            if (!exporting) {
              e.currentTarget.style.color = KLOEL_THEME.accent;
            }
          }}
          onMouseLeave={(e) => {
            if (!exporting) {
              e.currentTarget.style.color = KLOEL_THEME.textSecondary;
            }
          }}
        >
          <svg
            aria-hidden="true"
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path d={kloelT(`M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4`)} />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
      </div>
      <div
        style={{
          minHeight: 0,
          maxHeight: 'min(52vh, 520px)',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          paddingRight: 2,
        }}
      >
        {conversations.map((conv) => {
          const isActive = activeConversationId === conv.id;
          return (
            <button
              type="button"
              key={conv.id}
              onClick={() => {
                setActiveConversation(conv.id);
                router.push(`${KLOEL_CHAT_ROUTE}?conversationId=${encodeURIComponent(conv.id)}`);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                background: 'transparent',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                width: '100%',
                transition: 'all .15s',
                position: 'relative',
                textAlign: 'left',
              }}
            >
              <ConversationsIcon
                size={14}
                color={isActive ? KLOEL_THEME.accent : KLOEL_THEME.textTertiary}
                aria-hidden
              />
              <span
                style={{
                  fontSize: 12,
                  color: isActive ? KLOEL_THEME.accent : KLOEL_THEME.textSecondary,
                  fontWeight: isActive ? 600 : 400,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontFamily: "'Sora', sans-serif",
                }}
              >
                {conv.title}
              </span>
            </button>
          );
        })}
        <div ref={sentinelRef} style={{ minHeight: 1 }} />
        {isLoadingMoreConversations ? (
          <div
            style={{
              padding: '8px 10px',
              fontSize: 11,
              color: KLOEL_THEME.textTertiary,
              fontFamily: "'Sora', sans-serif",
            }}
          >
            {kloelT(`Carregando...`)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
