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
          borderRadius: 4,
          background: colors.semantic.success,
          animation: prefersReducedMotion ? 'none' : 'pulse 2s ease infinite',
        }}
      />
      <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 11, color: colors.text.muted }}>
        {kloelT('Plataforma')}{' '}
        <span style={{ color: colors.semantic.success, fontWeight: 600 }}>operacional</span>{' '}
        {kloelT('— vendas automáticas 24/7')}
      </span>
    </div>
  );
}
