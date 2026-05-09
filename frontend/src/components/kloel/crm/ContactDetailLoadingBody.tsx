'use client';

import { kloelT } from '@/lib/i18n/t';

const C = {
  elevated: 'var(--bg-elevated, #19191C)',
  border: 'var(--border-space, #222226)',
  muted: 'var(--text-muted, #6E6E73)',
} as const;

function LoadingStrip({
  width = '100%',
  height = 12,
  marginBottom = 0,
}: {
  width?: string | number;
  height?: string | number;
  marginBottom?: number;
}) {
  return (
    <div
      style={{
        width,
        height,
        marginBottom,
        borderRadius: 6,
        background:
          'linear-gradient(90deg, rgba(25,25,28,0.98) 0%, rgba(41,41,46,1) 50%, rgba(25,25,28,0.98) 100%)',
      }}
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: C.muted,
          margin: '0 0 10px',
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

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
