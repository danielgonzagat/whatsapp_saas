'use client';

/**
 * CheckoutBlanc.order-summary.parts.tsx
 *
 * Thin re-export layer.  All component implementations live in
 * checkout-shared-parts.tsx (one canonical copy).  This file only provides:
 *  - The theme-specific color/input type aliases (BlancColors, BlancInputTheme)
 *  - Wrapper functions that adapt BlancColors → CheckoutVisualTheme props
 *
 * DO NOT add component logic here.
 */

import {
  CouponRow as SharedCouponRow,
  PricingBreakdown as SharedPricingBreakdown,
  ProductThumb as SharedProductThumb,
  QtyControl as SharedQtyControl,
  TestimonialCard as SharedTestimonialCard,
} from './checkout-shared-parts';
import type { CheckoutTestimonial } from './checkout-shared-parts';
import type { CheckoutThemeInputTokens } from './checkout-theme-shared';

// ---------------------------------------------------------------------------
// Blanc-specific type aliases (kept for backward compatibility)
// ---------------------------------------------------------------------------
export interface BlancColors {
  accent: string;
  accent2: string;
  bg: string;
  card: string;
  text: string;
  muted: string;
}

export type BlancInputTheme = CheckoutThemeInputTokens;

export type BlancTestimonial = CheckoutTestimonial;

// ---------------------------------------------------------------------------
// Public components — same names/props as before
// ---------------------------------------------------------------------------

export function ProductThumb({
  productImage,
  productName,
  size,
  muted,
}: {
  productImage: string | null;
  productName: string;
  size: number;
  muted: string;
}) {
  return (
    <SharedProductThumb
      productImage={productImage}
      productName={productName}
      size={size}
      theme={{ mutedCardBackground: muted, mutedText: muted }}
    />
  );
}

export function CouponRow({
  couponCode,
  setCouponCode,
  couponError,
  applyCoupon,
  inputTheme,
}: {
  couponCode: string;
  setCouponCode: (v: string) => void;
  couponError: string | null;
  applyCoupon: () => Promise<void>;
  inputTheme: BlancInputTheme;
}) {
  return (
    <SharedCouponRow
      couponCode={couponCode}
      setCouponCode={setCouponCode}
      couponError={couponError}
      applyCoupon={applyCoupon}
      theme={{
        text: inputTheme.text,
        accent: inputTheme.focusBorder,
        input: inputTheme,
      }}
    />
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
  accentColor,
}: {
  subtotal: number;
  shippingInCents: number;
  couponApplied: boolean;
  discount: number;
  payMethod: string;
  pricing: { installmentInterestInCents: number };
  totalWithInterest: number;
  accentColor: string;
}) {
  return (
    <SharedPricingBreakdown
      subtotal={subtotal}
      shippingInCents={shippingInCents}
      couponApplied={couponApplied}
      discount={discount}
      payMethod={payMethod}
      pricing={pricing}
      totalWithInterest={totalWithInterest}
      theme={{
        text: accentColor,
        mutedText: accentColor,
        accent: accentColor,
        successText: accentColor,
        totalAccent: accentColor,
        cardBorder: accentColor,
      }}
    />
  );
}

export function QtyControl({
  qty,
  setQty,
  textColor,
  controlColor,
  size,
}: {
  qty: number;
  setQty: (fn: (prev: number) => number) => void;
  textColor: string;
  controlColor: string;
  size: 'sm' | 'lg';
}) {
  return (
    <SharedQtyControl
      qty={qty}
      setQty={setQty}
      theme={{ text: textColor, mutedText: controlColor, mutedCardBackground: controlColor }}
      size={size}
    />
  );
}

export function BlancTestimonialCard({ testimonial }: { testimonial: BlancTestimonial }) {
  return (
    <SharedTestimonialCard
      testimonial={testimonial}
      theme={{
        cardBackground: '#ffffff',
        cardBorder: 'rgba(0,0,0,0.08)',
        mutedCardBackground: 'rgba(0,0,0,0.06)',
        mutedText: '#6E6E73',
        softMutedText: '#6E6E73',
        text: '#1a1a1a',
      }}
    />
  );
}
