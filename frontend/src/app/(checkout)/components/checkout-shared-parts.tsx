'use client';

/**
 * checkout-shared-parts.tsx
 *
 * Canonical implementations of all checkout order-summary sub-components that are
 * structurally identical between CheckoutNoir and CheckoutBlanc.
 * Each component accepts a CheckoutVisualTheme (from checkout-theme-tokens.ts)
 * so there is exactly ONE copy of each primitive.
 *
 * Payment primitives (CardPaymentFields, PixDetails, BoletoDetails) live in
 * checkout-shared-payment-parts.tsx.
 */

import { kloelT } from '@/lib/i18n/t';
import { UI } from '@/lib/ui-tokens';
import type * as React from 'react';
import { Bc, Cc, Mn, Pl, Px, Star, Tag as SharedTag, clampQty, fmt } from './checkout-theme-shared';
import type { CheckoutThemeInputTokens } from './checkout-theme-shared';
import type { CheckoutVisualTheme } from './checkout-theme-tokens';
import { ProductThumb } from './__companions__/ProductThumb';

export { Bc, Cc, Px, ProductThumb };

export interface CheckoutTestimonial {
  name: string;
  stars: number;
  text: string;
  avatar: string;
}

const STAR_SLOTS = ['one', 'two', 'three', 'four', 'five'] as const;

export function CouponRow({
  couponCode,
  setCouponCode,
  couponError,
  applyCoupon,
  theme,
}: {
  couponCode: string;
  setCouponCode: (v: string) => void;
  couponError: string | null;
  applyCoupon: () => Promise<void>;
  theme: Pick<CheckoutVisualTheme, 'text' | 'accent' | 'input'> & {
    input: Pick<CheckoutThemeInputTokens, 'background' | 'border' | 'tagStroke'>;
  };
}) {
  return (
    <>
      <div style={{ fontSize: 15, fontWeight: 600, color: theme.text, marginBottom: 10 }}>
        {kloelT(`Tem um cupom?`)}
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'center' }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 14px',
            border: `1px solid ${theme.input.border}`,
            borderRadius: UI.radiusMd,
            background: theme.input.background,
            minWidth: 0,
          }}
        >
          <SharedTag stroke={theme.input.tagStroke} />
          <input
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
            placeholder={kloelT(`Código do cupom`)}
            style={{
              flex: 1,
              padding: '12px 0',
              border: 'none',
              fontSize: 14,
              outline: 'none',
              background: 'transparent',
              color: theme.text,
              fontFamily: "'DM Sans',sans-serif",
              minWidth: 0,
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => void applyCoupon()}
          style={{
            background: 'none',
            border: 'none',
            color: theme.accent,
            fontSize: 15,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {kloelT(`Aplicar`)}
        </button>
      </div>
      {couponError ? (
        <div style={{ fontSize: 12, color: UI.error, marginBottom: 10 }}>{couponError}</div>
      ) : null}
    </>
  );
}

export function PricingBreakdown({
  subtotal,
  shippingInCents,
  couponApplied,
  discount,
  payMethod,
  pricing,
  totalWithInterest,
  theme,
}: {
  subtotal: number;
  shippingInCents: number;
  couponApplied: boolean;
  discount: number;
  payMethod: string;
  pricing: { installmentInterestInCents: number };
  totalWithInterest: number;
  theme: Pick<
    CheckoutVisualTheme,
    'text' | 'mutedText' | 'accent' | 'successText' | 'totalAccent' | 'cardBorder'
  >;
}) {
  return (
    <div
      style={{
        background: 'rgba(128,128,128,0.06)',
        borderRadius: UI.radiusMd,
        padding: '16px 18px',
        borderLeft: `3px solid ${theme.accent}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 15,
          fontWeight: 700,
          color: theme.text,
          marginBottom: 8,
        }}
      >
        <span>{kloelT(`Produtos`)}</span>
        <span>{fmt.brl(subtotal)}</span>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 15,
          fontWeight: 700,
          color: theme.text,
          marginBottom: 8,
        }}
      >
        <span>{kloelT(`Frete`)}</span>
        <span>{shippingInCents === 0 ? 'Grátis' : fmt.brl(shippingInCents)}</span>
      </div>
      {couponApplied ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 15,
            color: theme.successText,
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          <span>{kloelT(`Desconto`)}</span>
          <span>-{fmt.brl(discount)}</span>
        </div>
      ) : null}
      {payMethod === 'card' && pricing.installmentInterestInCents > 0 ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 15,
            color: theme.accent,
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          <span>{kloelT(`Juros do parcelamento`)}</span>
          <span>{fmt.brl(pricing.installmentInterestInCents)}</span>
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
          {fmt.brl(totalWithInterest)}
        </span>
      </div>
    </div>
  );
}

export function QtyControl({
  qty,
  setQty,
  theme,
  size,
}: {
  qty: number;
  setQty: (fn: (prev: number) => number) => void;
  theme: Pick<CheckoutVisualTheme, 'text' | 'mutedText' | 'mutedCardBackground'>;
  size: 'sm' | 'lg';
}) {
  const padding = size === 'lg' ? '10px 22px' : '8px 18px';
  const spanPadding = size === 'lg' ? '10px 24px' : '8px 20px';
  const spanFontSize = size === 'lg' ? 17 : 16;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        background: theme.mutedCardBackground,
        borderRadius: UI.radiusMd,
        overflow: 'hidden',
        width: size === 'sm' ? 'fit-content' : undefined,
      }}
    >
      <button
        type="button"
        onClick={() => setQty((v) => clampQty(v - 1))}
        style={{
          padding,
          background: 'transparent',
          border: 'none',
          color: theme.mutedText,
          fontSize: size === 'lg' ? 18 : undefined,
          display: size === 'sm' ? 'flex' : undefined,
          alignItems: size === 'sm' ? 'center' : undefined,
        }}
      >
        <Mn />
      </button>
      <span
        style={{ padding: spanPadding, fontSize: spanFontSize, fontWeight: 700, color: theme.text }}
      >
        {qty}
      </span>
      <button
        type="button"
        onClick={() => setQty((v) => clampQty(v + 1))}
        style={{
          padding,
          background: 'transparent',
          border: 'none',
          color: theme.mutedText,
          fontSize: size === 'lg' ? 18 : undefined,
          display: size === 'sm' ? 'flex' : undefined,
          alignItems: size === 'sm' ? 'center' : undefined,
        }}
      >
        <Pl />
      </button>
    </div>
  );
}

export function TestimonialCard({
  testimonial,
  theme,
}: {
  testimonial: CheckoutTestimonial;
  theme: Pick<
    CheckoutVisualTheme,
    'cardBackground' | 'cardBorder' | 'mutedCardBackground' | 'mutedText' | 'softMutedText' | 'text'
  >;
}) {
  const { name, stars, text, avatar } = testimonial;
  return (
    <div
      style={{
        background: theme.cardBackground,
        border: `1px solid ${theme.cardBorder}`,
        borderRadius: UI.radiusMd,
        padding: '16px 18px',
        marginTop: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: UI.radiusFull,
            background: theme.mutedCardBackground,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 700,
            color: theme.mutedText,
            flexShrink: 0,
          }}
        >
          {avatar}
        </div>
        <div>
          <div style={{ display: 'flex', gap: 2, marginBottom: 2 }}>
            {STAR_SLOTS.slice(0, stars).map((slot) => (
              <Star key={`${name}-${slot}`} />
            ))}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{name}</div>
        </div>
      </div>
      <p style={{ fontSize: 13, color: theme.softMutedText, lineHeight: 1.5 }}>{text}</p>
    </div>
  );
}
