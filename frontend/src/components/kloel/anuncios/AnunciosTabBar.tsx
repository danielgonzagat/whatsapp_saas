'use client';

import { IC, EMBER, SORA } from './AnunciosShared';
import { colors } from '@/lib/design-tokens';
import type { TabId } from './anuncios-types';

export const TABS: { id: TabId; label: string; iconKey: string; activeColor: string }[] = [
  { id: 'visao', label: 'War Room', iconKey: 'zap', activeColor: EMBER },
  { id: 'meta', label: 'Meta Ads', iconKey: 'meta', activeColor: '#1877F2' },
  { id: 'google', label: 'Google Ads', iconKey: 'gads', activeColor: '#4285F4' },
  { id: 'tiktok', label: 'TikTok Ads', iconKey: 'tads', activeColor: '#FF0050' },
  { id: 'track', label: 'Rastreamento', iconKey: 'link', activeColor: EMBER },
  { id: 'rules', label: 'Regras IA', iconKey: 'shield', activeColor: EMBER },
];

export const ROUTES: Record<TabId, string> = {
  visao: '/anuncios',
  meta: '/anuncios/meta',
  google: '/anuncios/google',
  tiktok: '/anuncios/tiktok',
  track: '/anuncios/rastreamento',
  rules: '/anuncios/regras',
};

export function AnunciosTabBar({
  tab,
  isMobile,
  onSelect,
}: {
  tab: string;
  isMobile: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 2,
        borderBottom: '1px solid colors.border.space',
        padding: isMobile ? '0 12px' : '0 16px',
        overflowX: 'auto' as const,
      }}
    >
      {TABS.map((t) => {
        const active = tab === t.id;
        const icon = IC[t.iconKey];
        return (
          <button
            type="button"
            key={t.id}
            onClick={() => onSelect(t.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: isMobile ? '10px 12px' : '10px 16px',
              border: 'none',
              background: 'none',
              color: active ? t.activeColor : colors.text.muted,
              borderBottom: active ? `2px solid ${t.activeColor}` : '2px solid transparent',
              cursor: 'pointer',
              fontSize: isMobile ? 12 : 13,
              fontFamily: SORA,
              whiteSpace: 'nowrap' as const,
              transition: 'color 150ms ease',
            }}
          >
            {icon(14)}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
