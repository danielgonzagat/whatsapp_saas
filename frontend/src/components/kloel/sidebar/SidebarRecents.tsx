'use client';
import { useConversationHistory } from '@/hooks/useConversationHistory';
import { apiFetch } from '@/lib/api';
import { KLOEL_CHAT_ROUTE } from '@/lib/kloel-dashboard-context';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { ConversationsIcon } from './ConversationsIcon';

interface SidebarRecentsProps {
  expanded: boolean;
}

export function SidebarRecents({ expanded }: SidebarRecentsProps) {
  const { conversations, setActiveConversation } = useConversationHistory();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [exporting, setExporting] = useState(false);
  const handleExport = useCallback(async () => {
    if (conversations.length === 0 || exporting) return;
    setExporting(true);
    try {
      // Fetch full messages for each conversation from backend
      const full = await Promise.all(
        conversations.map(async (conv) => {
          try {
            const msgs = await apiFetch<unknown>(`/kloel/threads/${conv.id}/messages`);
            const payload: Array<Record<string, unknown>> = Array.isArray(msgs)
              ? (msgs as Array<Record<string, unknown>>)
              : Array.isArray((msgs as { data?: unknown })?.data)
                ? (msgs as { data: Array<Record<string, unknown>> }).data
                : [];
            return {
              ...conv,
              messages: payload.map((m) => ({
                role: m.role,
                content: m.content,
                createdAt: m.createdAt,
              })),
            };
          } catch {
            return { ...conv, messages: [] };
          }
        }),
      );
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
  }, [conversations, exporting]);

  if (!expanded || conversations.length === 0) return null;

  const activeConversationId =
    pathname === KLOEL_CHAT_ROUTE || pathname === '/dashboard'
      ? searchParams.get('conversationId')
      : null;

  return (
    <div style={{ marginTop: 16 }}>
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
          Recentes
        </span>
        <button
          type="button"
          onClick={handleExport}
          title="Exportar todas as conversas"
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
            if (!exporting) e.currentTarget.style.color = KLOEL_THEME.accent;
          }}
          onMouseLeave={(e) => {
            if (!exporting) e.currentTarget.style.color = KLOEL_THEME.textSecondary;
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
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
      </div>
      {conversations.slice(0, 8).map((conv) => {
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
    </div>
  );
}
