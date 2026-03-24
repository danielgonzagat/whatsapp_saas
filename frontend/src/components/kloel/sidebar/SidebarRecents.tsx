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
        fontFamily: "'Outfit', sans-serif",
        fontSize: 11,
        fontWeight: 600,
        color: '#5C5A6E',
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
            transition: 'all 200ms',
            color: '#5C5A6E',
            fontSize: 12,
            fontFamily: "'DM Sans', sans-serif",
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#E8E6F0'; e.currentTarget.style.background = '#181828'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#5C5A6E'; e.currentTarget.style.background = 'none'; }}
        >
          {conv.contactName || conv.phone || `Conversa ${i + 1}`}
        </button>
      ))}
    </div>
  );
}
