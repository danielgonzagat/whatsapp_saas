'use client';
import { useConversationHistory } from '@/hooks/useConversationHistory';

interface SidebarRecentsProps {
  expanded: boolean;
}

export function SidebarRecents({ expanded }: SidebarRecentsProps) {
  const { conversations, activeConv } = useConversationHistory();

  if (!expanded || conversations.length === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ padding: '0 10px', marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#3A3A3F', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
          Recentes
        </span>
      </div>
      {conversations.slice(0, 8).map((conv) => {
        const isActive = activeConv === conv.id;
        return (
          <button
            key={conv.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
              background: isActive ? 'rgba(232,93,48,0.06)' : 'transparent',
              border: 'none', borderRadius: 6, cursor: 'pointer', width: '100%',
              transition: 'all .15s', position: 'relative', textAlign: 'left',
            }}
          >
            {isActive && (
              <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 2, height: 14, background: '#E85D30', borderRadius: 1 }} />
            )}
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={isActive ? '#E85D30' : '#3A3A3F'} strokeWidth={1.5} strokeLinecap="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span style={{
              fontSize: 12, color: isActive ? '#E0DDD8' : '#6E6E73',
              fontWeight: isActive ? 500 : 400,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontFamily: "'Sora', sans-serif",
            }}>
              {conv.title}
            </span>
          </button>
        );
      })}
    </div>
  );
}
