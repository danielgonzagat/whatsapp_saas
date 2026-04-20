'use client';

import { IC } from '@/components/canvas/CanvasIcons';
import { CreateModal } from '@/components/canvas/CreateModal';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';

const S = "var(--font-sora), 'Sora', sans-serif";

const TABS = [
  { id: 'inicio', label: 'Inicio', path: '/canvas/inicio' },
  { id: 'projetos', label: 'Projetos', path: '/canvas/projetos' },
  { id: 'modelos', label: 'Modelos', path: '/canvas/modelos' },
];

export default function CanvasLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);

  /* Hide tabs on editor page */
  const isEditor = pathname?.startsWith('/canvas/editor');
  if (isEditor) {
    return <>{children}</>;
  }

  const activeTab = TABS.find((t) => pathname?.startsWith(t.path))?.id || 'inicio';

  return (
    <div
      style={{
        background: 'var(--app-bg-primary)',
        minHeight: '100vh',
        fontFamily: S,
        color: 'var(--app-text-primary)',
      }}
    >
      <style>{`
        @keyframes fu{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fi{from{opacity:0}to{opacity:1}}
        @keyframes mi{from{opacity:0;transform:scale(0.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes pE{0%,100%{box-shadow:0 0 12px rgba(232,93,48,0.2)}50%{box-shadow:0 0 22px rgba(232,93,48,0.35)}}
        .sb::-webkit-scrollbar{width:4px}
        .sb::-webkit-scrollbar-track{background:transparent}
        .sb::-webkit-scrollbar-thumb{background:#2A2A2E;border-radius:2px}
      `}</style>

      {/* Sub-tabs */}
      <div
        style={{
          borderBottom: '1px solid #1C1C1F',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 24px',
          height: 44,
        }}
      >
        {TABS.map((t) => (
          <button
            type="button"
            key={t.id}
            onClick={() => router.push(t.path)}
            style={{
              padding: '0 16px',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === t.id ? '2px solid #E85D30' : '2px solid transparent',
              color: activeTab === t.id ? '#E0DDD8' : '#6E6E73',
              fontSize: 13,
              fontWeight: activeTab === t.id ? 600 : 400,
              fontFamily: S,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 16px',
            background: '#E85D30',
            border: 'none',
            borderRadius: 4,
            color: 'var(--app-text-on-accent)',
            fontSize: 12,
            fontWeight: 700,
            fontFamily: S,
            cursor: 'pointer',
            animation: 'pE 3s ease-in-out infinite',
          }}
        >
          {IC.plus(13)} Criar
        </button>
      </div>

      {children}

      <CreateModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
