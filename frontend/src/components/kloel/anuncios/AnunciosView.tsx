'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContextualEmptyState } from '@/components/kloel/EmptyStates';
import { Megaphone, Target, BarChart3, ShieldCheck } from 'lucide-react';

// ── Design tokens ──
const BG_CARD = '#111113';
const BORDER = '#222226';
const EMBER = '#E85D30';

// ── Tabs ──
const TABS = [
  { id: 'visao', label: 'War Room', icon: Megaphone, route: '/anuncios' },
  { id: 'meta', label: 'Meta Ads', icon: Target, route: '/anuncios/meta' },
  { id: 'google', label: 'Google Ads', icon: BarChart3, route: '/anuncios/google' },
  { id: 'tiktok', label: 'TikTok Ads', icon: Target, route: '/anuncios/tiktok' },
  { id: 'track', label: 'Rastreamento', icon: Target, route: '/anuncios/rastreamento' },
  { id: 'rules', label: 'Regras IA', icon: ShieldCheck, route: '/anuncios/regras' },
];

export default function AnunciosView({ defaultTab = 'visao' }: { defaultTab?: string }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(defaultTab);

  const switchTab = (tabId: string) => {
    setActiveTab(tabId);
    const tab = TABS.find((t) => t.id === tabId);
    if (tab) router.push(tab.route);
  };

  return (
    <div style={{ fontFamily: "'Sora', sans-serif", color: '#e0e0e0', minHeight: '100vh' }}>
      {/* Tab Navigation */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: `1px solid ${BORDER}`,
          padding: '0 16px',
          overflowX: 'auto',
        }}
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 16px',
                border: 'none',
                background: 'none',
                color: isActive ? EMBER : '#888',
                borderBottom: isActive ? `2px solid ${EMBER}` : '2px solid transparent',
                cursor: 'pointer',
                fontSize: 13,
                fontFamily: "'Sora', sans-serif",
                whiteSpace: 'nowrap',
                transition: 'color 0.15s',
              }}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content: Empty State */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 'calc(100vh - 200px)',
          padding: 32,
          background: BG_CARD,
        }}
      >
        <ContextualEmptyState context="anuncios" size="lg" />
      </div>
    </div>
  );
}
