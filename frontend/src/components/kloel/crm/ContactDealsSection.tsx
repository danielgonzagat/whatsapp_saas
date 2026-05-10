'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';

interface Deal {
  _id?: string;
  id?: string;
  title?: string;
  value?: number;
  stage?: string | { id?: string; name?: string };
  currency?: string;
}

interface ContactDealsSectionProps {
  deals: Deal[];
}

const C = {
  elevated: colors.background.elevated,
  border: colors.border.space,
  accent: colors.ember.primary,
  text: colors.text.silver,
  muted: colors.text.muted,
  mono: "var(--font-jetbrains), 'JetBrains Mono', monospace",
} as const;

export function ContactDealsSection({ deals }: ContactDealsSectionProps) {
  if (deals.length === 0) {
    return (
      <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
        {kloelT('Nenhum deal associado.')}
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {deals.map((deal) => (
        <div
          key={deal._id ?? deal.id ?? deal.title}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: C.elevated,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '10px 12px',
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {deal.title ?? 'Sem titulo'}
            </div>
            {deal.stage && (
              <div style={{ fontSize: 11, color: C.muted }}>
                {typeof deal.stage === 'string' ? deal.stage : (deal.stage.name ?? '')}
              </div>
            )}
          </div>
          {deal.value != null && (
            <span
              style={{
                fontFamily: C.mono,
                fontSize: 13,
                color: C.accent,
                fontWeight: 600,
              }}
            >
              {deal.currency ?? 'R$'} {deal.value.toLocaleString('pt-BR')}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
