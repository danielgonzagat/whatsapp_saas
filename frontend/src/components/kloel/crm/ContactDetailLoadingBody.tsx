'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { LoadingStrip, Section } from './crm-drawer-parts';

const C = {
  elevated: colors.background.elevated,
  border: colors.border.space,
} as const;

export function ContactDetailLoadingBody() {
  return (
    <>
      <Section title={kloelT('Informacoes')}>
        <LoadingStrip width="72%" height={13} marginBottom={10} />
        <LoadingStrip width="58%" height={13} />
      </Section>

      <Section title={kloelT('Tags')}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <LoadingStrip width={88} height={26} />
          <LoadingStrip width={106} height={26} />
          <LoadingStrip width={74} height={26} />
        </div>
        <LoadingStrip width="100%" height={34} />
      </Section>

      <Section title={kloelT('Score & Sentimento')}>
        <LoadingStrip width="100%" height={10} marginBottom={12} />
        <LoadingStrip width="100%" height={8} marginBottom={12} />
        <LoadingStrip width="48%" height={20} />
      </Section>

      <Section title={kloelT('Neuro IA')}>
        <LoadingStrip width={132} height={34} marginBottom={12} />
        <LoadingStrip width="100%" height={58} />
      </Section>

      <Section title={kloelT('Deals')}>
        {[0, 1].map((index) => (
          <div
            key={`deal-skeleton-${index}`}
            style={{
              background: C.elevated,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: '10px 12px',
              marginBottom: 8,
            }}
          >
            <LoadingStrip width={index === 0 ? '62%' : '48%'} height={13} marginBottom={8} />
            <LoadingStrip width="32%" height={11} />
          </div>
        ))}
      </Section>
    </>
  );
}
