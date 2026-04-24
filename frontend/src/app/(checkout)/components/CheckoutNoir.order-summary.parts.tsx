'use client';

import { kloelT } from '@/lib/i18n/t';
import { UI } from '@/lib/ui-tokens';
import Image from 'next/image';
import { Mn, Pl, Star, Tag as SharedTag, clampQty, fmt } from './checkout-theme-shared';

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

export interface NoirInputTheme {
  background: string;
  border: string;
  text: string;
  radius: number;
  focusBorder: string;
  focusShadow: string;
  tagStroke: string;
  editStroke: string;
}

export interface NoirTestimonial {
  name: string;
  stars: number;
  text: string;
  avatar: string;
}

const NOIR_STAR_SLOTS = ['one', 'two', 'three', 'four', 'five'] as const;

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
  if (productImage) {
    return (
      <Image
        src={productImage}
        alt={productName}
        unoptimized
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: UI.radiusMd,
          objectFit: 'cover',
          display: 'block',
          flexShrink: 0,
          background: C.surface2,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: UI.radiusMd,
        background: C.surface2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: C.text2,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      {kloelT(`Produto`)}
    </div>
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
    <>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 10 }}>
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
            border: `1px solid ${C.border2}`,
            borderRadius: UI.radiusMd,
            background: C.surface2,
            minWidth: 0,
          }}
        >
          <SharedTag stroke={inputTheme.tagStroke} />
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
              color: C.text,
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
            color: C.accent,
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
    <div
      style={{
        background: 'rgba(255,255,255,0.03)',
        borderRadius: UI.radiusMd,
        padding: '16px 18px',
        borderLeft: `3px solid ${C.accent}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 15,
          fontWeight: 700,
          color: C.text,
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
          color: C.text,
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
            color: C.green,
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
            color: C.accent,
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
        <span style={{ fontSize: 15, color: C.accent, fontWeight: 400 }}>{kloelT(`Total`)}</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: C.accent }}>
          {fmt.brl(totalWithInterest)}
        </span>
      </div>
    </div>
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
  const padding = size === 'lg' ? '10px 22px' : '8px 18px';
  const spanPadding = size === 'lg' ? '10px 24px' : '8px 20px';
  const spanFontSize = size === 'lg' ? 17 : 16;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        background: C.surface2,
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
          color: C.text3,
          fontSize: size === 'lg' ? 18 : undefined,
          display: size === 'sm' ? 'flex' : undefined,
          alignItems: size === 'sm' ? 'center' : undefined,
        }}
      >
        <Mn />
      </button>
      <span
        style={{ padding: spanPadding, fontSize: spanFontSize, fontWeight: 700, color: C.text }}
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
          color: C.text3,
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

export function NoirTestimonialCard({
  testimonial,
  C,
}: {
  testimonial: NoirTestimonial;
  C: NoirColors;
}) {
  const { name, stars, text, avatar } = testimonial;
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
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
            background: C.surface2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 700,
            color: C.text3,
            flexShrink: 0,
          }}
        >
          {avatar}
        </div>
        <div>
          <div style={{ display: 'flex', gap: 2, marginBottom: 2 }}>
            {NOIR_STAR_SLOTS.slice(0, stars).map((slot) => (
              <Star key={`${name}-${slot}`} />
            ))}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{name}</div>
        </div>
      </div>
      <p style={{ fontSize: 13, color: C.text2, lineHeight: 1.5 }}>{text}</p>
    </div>
  );
}
