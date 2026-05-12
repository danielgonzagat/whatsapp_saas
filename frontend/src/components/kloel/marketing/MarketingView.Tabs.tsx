'use client';

import { KLOEL_THEME } from '@/lib/kloel-theme';
import { IC, EMBER, MONO, SORA } from './MarketingShared';

const TABS = Object.freeze([
  { id: 'conversas', label: 'Conversas', icon: IC.zap },
  { id: 'whatsapp', label: 'WhatsApp', icon: IC.wa },
  { id: 'instagram', label: 'Instagram', icon: IC.ig },
  { id: 'tiktok', label: 'TikTok', icon: IC.tt },
  { id: 'facebook', label: 'Facebook', icon: IC.fb },
  { id: 'email', label: 'Email', icon: IC.em },
  { id: 'sms', label: 'SMS', icon: IC.send, soon: true },
]);

interface MarketingTabsProps {
  tab: string;
  isMobile: boolean;
  onSwitchTab: (id: string) => void;
}

export function MarketingTabs({ tab, isMobile, onSwitchTab }: MarketingTabsProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        marginBottom: 24,
        overflowX: 'auto',
        paddingBottom: 8,
        maxWidth: 1240,
        marginInline: 'auto',
      }}
    >
      {TABS.map((t) => (
        <button
          type="button"
          key={t.id}
          onClick={() => onSwitchTab(t.id)}
          style={{
            fontFamily: SORA,
            fontSize: isMobile ? 11 : 12,
            padding: isMobile ? '8px 12px' : '8px 14px',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'transparent',
            color: tab === t.id ? EMBER : KLOEL_THEME.textSecondary,
            transition: 'all .2s',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center' }}>{t.icon(14)}</span>
          {t.label}
          {t.soon && (
            <span
              style={{
                fontSize: 8,
                color: 'var(--app-text-tertiary)',
                fontFamily: MONO,
                marginLeft: 2,
              }}
            >
              soon
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
