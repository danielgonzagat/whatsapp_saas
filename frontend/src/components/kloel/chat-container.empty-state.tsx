'use client';

import { kloelT } from '@/lib/i18n/t';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { KloelMushroomVisual } from './KloelBrand';

interface EmptyStateGreetingHeaderProps {
  isAuthenticated: boolean;
  userName?: string | null;
}

export function EmptyStateGreetingHeader({
  isAuthenticated,
  userName,
}: EmptyStateGreetingHeaderProps) {
  return (
    <div style={{ marginBottom: 32, textAlign: 'center' }}>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center' }}>
        <KloelMushroomVisual
          size={56}
          traceColor={KLOEL_THEME.textPrimary}
          spores="none"
          ariaHidden
        />
      </div>
      <h1
        style={{
          margin: '0 0 12px',
          fontFamily: "'Sora', var(--font-serif), sans-serif",
          fontSize: 'clamp(2rem, 4vw, 2.5rem)',
          fontWeight: 600,
          lineHeight: 1.05,
          letterSpacing: '-0.03em',
          color: KLOEL_THEME.textPrimary,
        }}
      >
        {isAuthenticated && userName
          ? `De volta ao trabalho, ${userName}?`
          : 'Como posso ajudar seu negócio hoje?'}
      </h1>
      <p style={{ fontSize: 18, color: KLOEL_THEME.textSecondary }}>
        {kloelT(`Pergunte qualquer coisa sobre seus produtos, vendas, leads ou configure o Kloel.`)}
      </p>
    </div>
  );
}
