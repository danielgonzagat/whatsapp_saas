'use client';

import { kloelT } from '@/lib/i18n/t';
import { SORA } from './ContaConstants';

export function ContaInfoSection() {
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
        {kloelT(`Saiba mais`)}
      </h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {[
          { label: 'Termos de uso', url: '/terms' },
          { label: 'Politica de privacidade', url: '/privacy' },
          { label: 'Documentacao', url: '/terms' },
          { label: 'Contato', url: 'mailto:suporte@kloel.com' },
        ].map((link) => (
          <a
            key={link.label}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: '14px 18px',
              textDecoration: 'none',
              color: 'var(--app-text-primary)',
              fontSize: 13,
              fontFamily: SORA,
            }}
          >
            {link.label}
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--app-text-secondary)"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                d={kloelT(`M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6`)}
              />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        ))}
      </div>
    </div>
  );
}
