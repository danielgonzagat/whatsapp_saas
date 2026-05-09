'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

export function LivePulse() {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          background: '#10B981',
          animation: prefersReducedMotion ? 'none' : 'pulse 2s ease infinite',
        }}
      />
      <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 11, color: colors.text.muted }}>
        {kloelT('Plataforma')}{' '}
        <span style={{ color: '#10B981', fontWeight: 600 }}>operacional</span>{' '}
        {kloelT('— vendas automáticas 24/7')}
      </span>
    </div>
  );
}
