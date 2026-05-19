'use client';

import { kloelT } from '@/lib/i18n/t';
import {
  CH_CONFIG,
  SORA,
  MONO,
  BG_CARD,
  BORDER,
} from './MarketingShared';
import type { ChannelRealData } from './MarketingTypes';

export function RevenueBarChart({ channelDataMap }: { channelDataMap: Record<string, ChannelRealData> }) {
  const bars = Object.entries(CH_CONFIG).map(([key, ch]) => {
    const data = channelDataMap[ch.backendKey];
    return { key, label: ch.label, color: ch.color, sales: data?.sales ?? 0 };
  });
  const maxSales = Math.max(1, ...bars.map((b) => b.sales));

  return (
    <div
      style={{ background: BG_CARD, borderRadius: 6, padding: 16, border: `1px solid ${BORDER}` }}
    >
      <div
        style={{
          fontFamily: SORA,
          fontSize: 10,
          color: 'var(--app-text-tertiary)',
          marginBottom: 14,
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
        }}
      >
        {kloelT(`Receita por Canal`)}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 120 }}>
        {bars.map((b) => (
          <div
            key={b.key}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ fontFamily: MONO, fontSize: 11, color: b.color }}>{b.sales}</span>
            <div
              style={{
                width: '100%',
                maxWidth: 40,
                background: `${b.color}30`,
                borderRadius: '4px 4px 0 0',
                height: Math.max(4, (b.sales / maxSales) * 90),
                transition: 'height .5s',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: b.color,
                  opacity: 0.6,
                  borderRadius: '4px 4px 0 0',
                }}
              />
            </div>
            <span
              style={{
                fontFamily: SORA,
                fontSize: 9,
                color: 'var(--app-text-secondary)',
                textAlign: 'center',
              }}
            >
              {b.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
