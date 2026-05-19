'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { BrandDivider } from './BrandDivider';
import { HeroLoop } from './HeroLoop';

export function HeroSection() {
  return (
    <section
      className="landing-hero-section"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        padding: '0 24px',
      }}
    >
      <div style={{ maxWidth: 820, width: '100%', zIndex: 2 }}>
        <HeroLoop />
      </div>
      <p
        className="landing-hero-sub"
        style={{
          position: 'relative',
          zIndex: 2,
          fontSize: 16,
          color: colors.text.muted,
          marginTop: 44,
          textAlign: 'center',
          maxWidth: 460,
        }}
      >
        {kloelT('A IA que responde, negocia e fecha vendas por você.')}
        <br />
        <span style={{ color: colors.text.dim }}>{kloelT('6 canais. 24/7. R$0/mês.')}</span>
      </p>
      <div style={{ position: 'absolute', bottom: '8%', left: 0, width: '100%', zIndex: 1 }}>
        <BrandDivider />
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 28,
          left: '50%',
          transform: 'translateX(-50%)',
          animation: 'pulse 2.5s ease infinite',
          color: colors.text.dim,
          zIndex: 2,
        }}
      >
        <svg
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </section>
  );
}
