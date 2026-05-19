'use client';

import { kloelT } from '@/lib/i18n/t';
import { SORA, EMBER } from './ContaConstants';

export function ContaReferralSection() {
  return (
    <div>
      <h2
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: 'var(--app-text-primary)',
          margin: '0 0 16px',
          fontFamily: SORA,
        }}
      >
        {kloelT(`Presentear Kloel`)}
      </h2>
      <div
        style={{
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          padding: 24,
        }}
      >
        <p
          style={{ fontSize: 13, color: 'var(--app-text-secondary)', margin: '0 0 16px' }}
        >
          {kloelT(`Compartilhe seu link de indicacao e ganhe beneficios quando seus amigos se
          cadastrarem.`)}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            aria-label="Link de indicacao"
            readOnly
            value={`${process.env.NEXT_PUBLIC_SITE_URL || 'https://kloel.com'}/ref/seu-codigo`}
            style={{
              flex: 1,
              background: 'var(--app-bg-primary)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: '10px 14px',
              color: 'var(--app-text-primary)',
              fontSize: 13,
              fontFamily: SORA,
            }}
          />
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(
                `${process.env.NEXT_PUBLIC_SITE_URL || 'https://kloel.com'}/ref/seu-codigo`,
              );
            }}
            style={{
              padding: '10px 18px',
              background: EMBER,
              color: 'var(--app-text-on-accent)',
              border: 'none',
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: SORA,
            }}
          >
            {kloelT(`Copiar`)}
          </button>
        </div>
      </div>
    </div>
  );
}
