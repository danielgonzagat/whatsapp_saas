'use client';

import { kloelT } from '@/lib/i18n/t';
import { PAYMENT_BADGES } from '../../checkout-theme-shared';
import type { FooterProps } from './types';

/** Checkout footer. */
export function CheckoutFooter({
  theme,
  brandName,
  footerPrimary,
  footerSecondary,
  footerLegal,
}: FooterProps) {
  return (
    <footer
      style={{
        background: theme.pageBackground,
        borderTop: `1px solid ${theme.divider}`,
        padding: '40px 24px',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{ fontSize: 14, color: theme.mutedText, marginBottom: 14 }}>
          {kloelT(`Formas de pagamento`)}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginBottom: 24,
          }}
        >
          {PAYMENT_BADGES.map((badge) => (
            <span
              key={badge}
              style={{
                padding: '6px 14px',
                background: theme.paymentBadgeBackground,
                border: `1px solid ${theme.paymentBadgeBorder}`,
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                color: theme.paymentBadgeText,
              }}
            >
              {badge}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 13, color: theme.mutedText, marginBottom: 4 }}>
          {footerPrimary || `${brandName}: pay.kloel.com`}
        </div>
        {footerSecondary ? (
          <div style={{ fontSize: 13, color: theme.mutedText, marginBottom: 4 }}>
            {footerSecondary}
          </div>
        ) : null}
        <div style={{ fontSize: 13, color: theme.mutedText, marginBottom: 20 }}>{footerLegal}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill={theme.mutedText} aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path
              d={kloelT(`M7 11V7a5 5 0 0110 0v4`)}
              fill="none"
              stroke={theme.mutedText}
              strokeWidth="2"
            />
          </svg>
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: theme.text,
                letterSpacing: '0.1em',
                lineHeight: 1.1,
              }}
            >
              PAGAMENTO
            </div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 400,
                color: theme.mutedText,
                letterSpacing: '0.1em',
                lineHeight: 1.5,
              }}
            >
              {kloelT(`100% SEGURO`)}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
