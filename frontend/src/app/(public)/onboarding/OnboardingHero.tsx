'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors, radius } from '@/lib/design-tokens';

export function OnboardingHero() {
  return (
    <div
      className="hidden lg:flex lg:w-1/2"
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.background.void,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 380,
          padding: '0 32px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 64,
            height: 3,
            borderRadius: radius.full,
            background: colors.ember.primary,
            margin: '0 auto 32px',
          }}
        />
        <h2
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 32,
            fontWeight: 700,
            color: colors.text.silver,
            lineHeight: 1.15,
            marginBottom: 16,
            letterSpacing: '0.02em',
          }}
        >
          {kloelT(`A melhor plataforma de Marketing Artificial`)}
        </h2>
        <p
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 15,
            color: colors.text.muted,
            lineHeight: 1.6,
          }}
        >
          {kloelT(`Kloel é muito mais que uma plataforma de marketing digital. É onde a inteligência
          artificial se adapta ao seu negócio para vender, atender e converter automaticamente.`)}
        </p>
      </div>
    </div>
  );
}
