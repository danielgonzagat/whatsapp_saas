'use client';

import Link from 'next/link';
import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { buildAuthUrl } from '@/lib/subdomains';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';
import { KloelBrandLockup } from '../KloelBrand';

export function LandingHeader() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const currentHost = typeof window !== 'undefined' ? window.location.host : undefined;

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: 'rgba(10,10,12,.92)',
        backdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${colors.border.void}`,
      }}
    >
      <div
        className="landing-header-inner"
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          display: 'flex',
          height: 52,
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
        }}
      >
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: colors.text.silver,
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          <KloelBrandLockup
            markSize={20}
            fontSize={15}
            fontWeight={600}
            animated={!prefersReducedMotion}
            spores={prefersReducedMotion ? 'none' : 'animated'}
          />
        </Link>
        <div
          className="landing-header-actions"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Link
            className="landing-header-login"
            href={buildAuthUrl('/login?forceAuth=1', currentHost)}
            style={{
              fontSize: 12,
              color: colors.text.muted,
              textDecoration: 'none',
              padding: '7px 12px',
            }}
          >
            {kloelT('Entrar')}
          </Link>
          <Link
            className="landing-header-cta"
            href={buildAuthUrl('/register?forceAuth=1', currentHost)}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: colors.background.void,
              background: colors.text.silver,
              padding: '7px 16px',
              borderRadius: 6,
              textDecoration: 'none',
            }}
          >
            {kloelT('Ativar minha IA')}
          </Link>
        </div>
      </div>
    </header>
  );
}
