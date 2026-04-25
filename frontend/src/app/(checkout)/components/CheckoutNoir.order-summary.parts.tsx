'use client';

/**
 * CheckoutNoir.order-summary.parts.tsx
 *
 * Thin re-export layer.  All component implementations live in
 * checkout-shared-parts.tsx (one canonical copy).  This file only provides:
 *  - The theme-specific color/input type aliases (NoirColors, NoirInputTheme)
 *  - Wrapper functions that adapt NoirColors → CheckoutVisualTheme props
 *
 * DO NOT add component logic here.
 */

import {
  CouponRow,
  PricingBreakdown,
  ProductThumb,
  QtyControl,
  TestimonialCard,
} from './checkout-shared-parts';
import type { CheckoutTestimonial } from './checkout-shared-parts';
import type { CheckoutThemeInputTokens } from './checkout-theme-shared';

// ---------------------------------------------------------------------------
// Noir-specific type aliases (kept for backward compatibility)
// ---------------------------------------------------------------------------
export interface NoirColors {
  void: string;
  surface: string;
  surface2: string;
  border: string;
  border2: string;
  text: string;
  text2: string;
  text3: string;
  accent: string;
  accent2: string;
  green: string;
}

export type NoirInputTheme = CheckoutThemeInputTokens;

export type NoirTestimonial = CheckoutTestimonial;

// ---------------------------------------------------------------------------
// Adapter helpers: map NoirColors → the minimal theme slices each component needs
// ---------------------------------------------------------------------------

function noirProductTheme(C: NoirColors) {
  return { mutedCardBackground: C.surface2, mutedText: C.text2 };
}

function noirCouponTheme(C: NoirColors, inputTheme: NoirInputTheme) {
  return { text: C.text, accent: C.accent, input: inputTheme };
}

function noirPricingTheme(C: NoirColors) {
  return {
    text: C.text,
    mutedText: C.text2,
    accent: C.accent,
    successText: C.green,
    totalAccent: C.accent,
    cardBorder: C.border2,
  };
}

function noirQtyTheme(C: NoirColors) {
  return { text: C.text, mutedText: C.text3, mutedCardBackground: C.surface2 };
}

function noirTestimonialTheme(C: NoirColors) {
  return {
    cardBackground: C.surface,
    cardBorder: C.border,
    mutedCardBackground: C.surface2,
    mutedText: C.text3,
    softMutedText: C.text2,
    text: C.text,
  };
}

// ---------------------------------------------------------------------------
// Public components — same names/props as before
// ---------------------------------------------------------------------------

export function NoirProductThumb({
  productImage,
  productName,
  size,
  C,
}: {
  productImage: string | null;
  productName: string;
  size: number;
  C: NoirColors;
}) {
  return (
    <ProductThumb
      productImage={productImage}
      productName={productName}
      size={size}
      theme={noirProductTheme(C)}
    />
  );
}

export function NoirCouponRow({
  couponCode,
  setCouponCode,
  couponError,
  applyCoupon,
  C,
  inputTheme,
}: {
  couponCode: string;
  setCouponCode: (v: string) => void;
  couponError: string | null;
  applyCoupon: () => Promise<void>;
  C: NoirColors;
  inputTheme: NoirInputTheme;
}) {
  return (
    <CouponRow
      couponCode={couponCode}
      setCouponCode={setCouponCode}
      couponError={couponError}
      applyCoupon={applyCoupon}
      theme={noirCouponTheme(C, inputTheme)}
    />
  );
}

export function NoirPricingBreakdown({
  subtotal,
  shippingInCents,
  couponApplied,
  discount,
  payMethod,
  pricing,
  totalWithInterest,
  C,
}: {
  subtotal: number;
  shippingInCents: number;
  couponApplied: boolean;
  discount: number;
  payMethod: string;
  pricing: { installmentInterestInCents: number };
  totalWithInterest: number;
  C: NoirColors;
}) {
  return (
    <PricingBreakdown
      subtotal={subtotal}
      shippingInCents={shippingInCents}
      couponApplied={couponApplied}
      discount={discount}
      payMethod={payMethod}
      pricing={pricing}
      totalWithInterest={totalWithInterest}
      theme={noirPricingTheme(C)}
    />
  );
}

export function NoirQtyControl({
  qty,
  setQty,
  C,
  size,
}: {
  qty: number;
  setQty: (fn: (prev: number) => number) => void;
  C: NoirColors;
  size: 'sm' | 'lg';
}) {
  return <QtyControl qty={qty} setQty={setQty} theme={noirQtyTheme(C)} size={size} />;
}

export function NoirTestimonialCard({
  testimonial,
  C,
}: {
  testimonial: NoirTestimonial;
  C: NoirColors;
}) {
  return <TestimonialCard testimonial={testimonial} theme={noirTestimonialTheme(C)} />;
}
