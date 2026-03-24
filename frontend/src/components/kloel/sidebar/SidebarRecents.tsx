'use client';

import { useConversations } from '@/hooks/useInbox';

interface SidebarRecentsProps {
  expanded: boolean;
}

export function SidebarRecents({ expanded }: SidebarRecentsProps) {
  const { conversations, isLoading } = useConversations();

  // Show last 5 conversations
  const recent = (conversations || []).slice(0, 5);

  if (!expanded || recent.length === 0) return null;

  return (
    <div style={{ padding: '8px 12px' }}>
      <span style={{
        fontFamily: "'Sora', sans-serif",
        fontSize: 10,
        fontWeight: 600,
        color: '#3A3A3F',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        display: 'block',
        marginBottom: 8,
        paddingLeft: 10,
      }}>
        RECENTES
      </span>
      {recent.map((conv: any, i: number) => (
        <button
          key={conv.id || i}
          style={{
            width: '100%',
            padding: '6px 10px',
            background: 'none',
            border: 'none',
            borderRadius: 6,
            textAlign: 'left',
            cursor: 'pointer',
            transition: 'all 150ms ease',
            color: '#3A3A3F',
            fontSize: 12,
            fontFamily: "'Sora', sans-serif",
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#E0DDD8'; e.currentTarget.style.background = '#111113'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#3A3A3F'; e.currentTarget.style.background = 'none'; }}
        >
          {conv.contactName || conv.phone || `Conversa ${i + 1}`}
        </button>
      ))}
    </div>
  );
}
