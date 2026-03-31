'use client';
import { useCallback, useState } from 'react';
import { useConversationHistory } from '@/hooks/useConversationHistory';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';

interface SidebarRecentsProps {
  expanded: boolean;
}

export function SidebarRecents({ expanded }: SidebarRecentsProps) {
  const { conversations, activeConv, setActiveConversation } = useConversationHistory();
  const router = useRouter();

  const [exporting, setExporting] = useState(false);
  const handleExport = useCallback(async () => {
    if (conversations.length === 0 || exporting) return;
    setExporting(true);
    try {
      // Fetch full messages for each conversation from backend
      const full = await Promise.all(conversations.map(async (conv) => {
        try {
          const msgs: any = await apiFetch(`/kloel/threads/${conv.id}/messages`);
          return { ...conv, messages: Array.isArray(msgs) ? msgs.map((m: any) => ({ role: m.role, content: m.content, createdAt: m.createdAt })) : [] };
        } catch { return { ...conv, messages: [] }; }
      }));
      const data = JSON.stringify(full, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kloel-conversas-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } finally { setExporting(false); }
  }, [conversations, exporting]);

  if (!expanded || conversations.length === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ padding: '0 10px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#3A3A3F', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
          Recentes
        </span>
        <button
          onClick={handleExport}
          title="Exportar todas as conversas"
          style={{ background: 'none', border: 'none', cursor: exporting ? 'wait' : 'pointer', color: exporting ? '#E85D30' : '#6E6E73', padding: '2px 4px', display: 'flex', alignItems: 'center', gap: 4, borderRadius: 4, transition: 'color .15s' }}
          onMouseEnter={e => { if (!exporting) (e.currentTarget.style.color = '#E85D30'); }}
          onMouseLeave={e => { if (!exporting) (e.currentTarget.style.color = '#6E6E73'); }}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
      </div>
      {conversations.slice(0, 8).map((conv) => {
        const isActive = activeConv === conv.id;
        return (
          <button
            key={conv.id}
            onClick={() => {
              setActiveConversation(conv.id);
              router.push('/dashboard');
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
