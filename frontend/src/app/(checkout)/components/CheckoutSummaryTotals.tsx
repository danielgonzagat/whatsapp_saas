'use client';

import { kloelT } from '@/lib/i18n/t';
import type { CheckoutVisualTheme } from './checkout-theme-tokens';
import { summaryLine } from './checkout-summary-helpers';

export function CheckoutSummaryTotals({
  theme,
  couponApplied,
  discount,
  subtotal,
  shippingInCents,
  requiresShipping,
  totalWithInterest,
  fmtBrl,
}: {
  theme: CheckoutVisualTheme;
  couponApplied: boolean;
  discount: number;
  subtotal: number;
  shippingInCents: number;
  requiresShipping?: boolean;
  totalWithInterest: number;
  fmtBrl: (value: number) => string;
}) {
  const deliveryLabel = requiresShipping === false ? kloelT('Entrega') : kloelT('Frete');
  const deliveryValue = requiresShipping === false
    ? kloelT('Digital')
    : shippingInCents === 0
      ? 'Grátis'
      : fmtBrl(shippingInCents);

  return (
    <div
      style={{
        background: theme.summaryBackground,
        borderRadius: 12,
        padding: '16px 18px',
        marginBottom: 20,
        borderLeft: `3px solid ${theme.totalAccent}`,
      }}
    >
      <div style={summaryLine(theme)}>
        <span>{kloelT(`Produtos`)}</span>
        <span>{fmtBrl(subtotal)}</span>
      </div>
      <div style={summaryLine(theme)}>
        <span>{deliveryLabel}</span>
        <span>{deliveryValue}</span>
      </div>
      {couponApplied ? (
        <div style={{ ...summaryLine(theme), color: theme.successText }}>
          <span>{kloelT(`Desconto`)}</span>
          <span>-{fmtBrl(discount)}</span>
        </div>
      ) : null}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 4,
        }}
      >
        <span style={{ fontSize: 15, color: theme.totalAccent, fontWeight: 400 }}>
          {kloelT(`Total`)}
        </span>
        <span style={{ fontSize: 20, fontWeight: 700, color: theme.totalAccent }}>
          {fmtBrl(totalWithInterest)}
        </span>
      </div>
    </div>
  );
}
