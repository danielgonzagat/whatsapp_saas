'use client';
import { useCallback } from 'react';
import { useConversationHistory } from '@/hooks/useConversationHistory';
import { useRouter } from 'next/navigation';

interface SidebarRecentsProps {
  expanded: boolean;
}

export function SidebarRecents({ expanded }: SidebarRecentsProps) {
  const { conversations, activeConv, setActiveConversation } = useConversationHistory();
  const router = useRouter();

  const handleExport = useCallback(() => {
    if (conversations.length === 0) return;
    const data = JSON.stringify(conversations, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kloel-conversas-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, [conversations]);

  if (!expanded || conversations.length === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ padding: '0 10px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#3A3A3F', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
          Recentes
        </span>
        <button
          onClick={handleExport}
          title="Exportar conversas"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3A3A3F', padding: 2, display: 'flex', alignItems: 'center' }}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
      </div>
      {conversations.slice(0, 8).map((conv) => {
        const isActive = activeConv === conv.id;
        return (
          <button
            key={conv.id}
            onClick={() => {
              setActiveConversation(conv.id);
              router.push('/');
            }}
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
