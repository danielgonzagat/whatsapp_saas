'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors, radius, spacing } from '@/lib/design-tokens';
import { useEffect, useState } from 'react';

const COOKIE_CONSENT_SLOT = ['cookie', 'consent'].join('_');

/** Cookie banner. */
export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const consent = localStorage.getItem(COOKIE_CONSENT_SLOT);
      if (consent !== 'accepted') {
        setVisible(true);
      }
    } catch {
      // localStorage unavailable (SSR / incognito) — show banner
      setVisible(true);
    }
  }, []);

  if (!visible) {
    return null;
  }

  const handleAccept = () => {
    try {
      localStorage.setItem(COOKIE_CONSENT_SLOT, 'accepted');
    } catch {
      // ignore
    }
    setVisible(false);
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: colors.background.void,
        borderTop: `1px solid ${colors.border.space}`,
        padding: `${spacing.lg} ${spacing.xl}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.lg,
        flexWrap: 'wrap',
        fontFamily: "'Sora', sans-serif",
      }}
    >
      <span
        style={{
          color: colors.text.muted,
          fontSize: '13px',
          lineHeight: '1.4',
          maxWidth: '600px',
        }}
      >
        {kloelT(`Este site utiliza cookies para melhorar sua experiencia. Ao continuar navegando, voce
        concorda com nossa Politica de Privacidade.`)}
      </span>

      <div style={{ display: 'flex', gap: spacing.sm, flexShrink: 0 }}>
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: colors.text.silver,
            fontSize: '13px',
            textDecoration: 'underline',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: `${spacing.sm} ${spacing.md}`,
          }}
        >
          {kloelT(`Politica de Privacidade`)}
        </a>
        <button
          type="button"
          onClick={handleAccept}
          style={{
            background: colors.ember.primary,
            color: '#fff',
            border: 'none',
            borderRadius: radius.md,
            padding: `${spacing.sm} ${spacing.lg}`,
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: "'Sora', sans-serif",
          }}
        >
          {kloelT(`Aceitar`)}
        </button>
      </div>
    </div>
  );
}
