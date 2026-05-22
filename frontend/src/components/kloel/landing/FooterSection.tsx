'use client';

import Link from 'next/link';
import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { KloelWordmark } from '../KloelBrand';

export function FooterSection() {
  return (
    <footer style={{ padding: '36px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 14,
            fontWeight: 700,
            color: colors.text.silver,
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          <KloelWordmark color={colors.text.silver} fontSize={14} fontWeight={600} />
        </Link>
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', gap: 20 }}>
          <Link
            href="/terms"
            style={{ fontSize: 11, color: colors.text.dim, textDecoration: 'none' }}
          >
            {kloelT('Termos')}
          </Link>
          <Link
            href="/privacy"
            style={{ fontSize: 11, color: colors.text.dim, textDecoration: 'none' }}
          >
            {kloelT('Privacidade')}
          </Link>
        </div>
      </div>
    </footer>
  );
}
