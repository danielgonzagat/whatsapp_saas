'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { CheckoutDisplayTestimonial } from '@/lib/public-checkout-contract';
import { ChDown, ChUp, Mn, PAYMENT_BADGES, Pl, Star, Tag } from './checkout-theme-shared';
import type { CheckoutVisualTheme } from './checkout-theme-tokens';

const STAR_SLOTS = ['one', 'two', 'three', 'four', 'five'] as const;

type SummaryProps = {
  theme: CheckoutVisualTheme;
  summaryOpen: boolean;
  setSummaryOpen: Dispatch<SetStateAction<boolean>>;
  qty: number;
  setQty: Dispatch<SetStateAction<number>>;
  couponCode: string;
  setCouponCode: Dispatch<SetStateAction<string>>;
  couponApplied: boolean;
  discount: number;
  subtotal: number;
  shippingInCents: number;
  totalWithInterest: number;
  productName: string;
  productImage?: string;
  unitPriceInCents: number;
  testimonials: CheckoutDisplayTestimonial[];
  fmtBrl: (value: number) => string;
  onApplyCoupon: () => void;
};

type FooterProps = {
  theme: CheckoutVisualTheme;
  brandName: string;
  footerPrimary: string;
  footerSecondary: string;
  footerLegal: string;
};

export function CheckoutMobileSummary(props: SummaryProps) {
  const {
    theme,
    summaryOpen,
    setSummaryOpen,
    qty,
    setQty,
    couponCode,
    setCouponCode,
    couponApplied,
    discount,
    subtotal,
    shippingInCents,
    totalWithInterest,
    productName,
    productImage,
    unitPriceInCents,
    fmtBrl,
    onApplyCoupon,
  } = props;

  return (
    <div
      className="ck-mobile-only"
      style={{ maxWidth: 1200, margin: '16px auto 0', padding: '0 16px' }}
    >
      <div
        style={{
          background: theme.cardBackground,
          borderRadius: 12,
          border: `1px solid ${theme.cardBorder}`,
          boxShadow: theme.cardShadow,
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          onClick={() => setSummaryOpen((value) => !value)}
          style={summaryToggle(theme)}
        >
          <div>
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.01em' }}>
              RESUMO ({qty})
            </span>
            <br />
            <span style={{ fontSize: 12, color: theme.mutedText, fontWeight: 400 }}>
              Informações da sua compra
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: theme.mutedText }}>
              {fmtBrl(totalWithInterest)}
            </span>
            {summaryOpen ? <ChUp /> : <ChDown />}
          </div>
        </button>
        {summaryOpen ? (
          <div style={{ padding: '0 20px 20px' }}>
            <SummaryProductRow
              theme={theme}
              productImage={productImage}
              productName={productName}
              unitPriceInCents={unitPriceInCents}
              fmtBrl={fmtBrl}
            />
            <QuantityControl theme={theme} qty={qty} setQty={setQty} />
            <CouponRow
              theme={theme}
              couponCode={couponCode}
              setCouponCode={setCouponCode}
              onApplyCoupon={onApplyCoupon}
            />
            <SummaryTotals
              theme={theme}
              couponApplied={couponApplied}
              discount={discount}
              subtotal={subtotal}
              shippingInCents={shippingInCents}
              totalWithInterest={totalWithInterest}
              fmtBrl={fmtBrl}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function CheckoutDesktopSidebar(props: SummaryProps) {
  const {
    theme,
    qty,
    setQty,
    couponCode,
    setCouponCode,
    couponApplied,
    discount,
    subtotal,
    shippingInCents,
    totalWithInterest,
    productName,
    productImage,
    unitPriceInCents,
    testimonials,
    fmtBrl,
    onApplyCoupon,
  } = props;

  return (
    <div className="ck-col ck-desktop-only" style={{ flex: '1 1 28%', minWidth: 260 }}>
      <div
        style={{
          background: theme.cardBackground,
          border: `1px solid ${theme.cardBorder}`,
          borderRadius: 12,
          padding: '24px 20px',
          boxShadow: theme.cardShadow,
        }}
      >
        <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20, color: theme.text }}>
          RESUMO
        </h3>
        <CouponRow
          theme={theme}
          couponCode={couponCode}
          setCouponCode={setCouponCode}
          onApplyCoupon={onApplyCoupon}
        />
        <SummaryTotals
          theme={theme}
          couponApplied={couponApplied}
          discount={discount}
          subtotal={subtotal}
          shippingInCents={shippingInCents}
          totalWithInterest={totalWithInterest}
          fmtBrl={fmtBrl}
        />
        <SummaryProductRow
          theme={theme}
          productImage={productImage}
          productName={productName}
          unitPriceInCents={unitPriceInCents}
          fmtBrl={fmtBrl}
        />
        <QuantityControl theme={theme} qty={qty} setQty={setQty} compact />
      </div>
      {testimonials.map((testimonial) => (
        <div
          key={`${testimonial.name}-${testimonial.avatar}`}
          style={{
            background: theme.cardBackground,
            border: `1px solid ${theme.cardBorder}`,
            borderRadius: 12,
            padding: '16px 18px',
            marginTop: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 16,
                background: theme.summaryBackground,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 700,
                color: theme.mutedText,
                flexShrink: 0,
              }}
            >
              {testimonial.avatar}
            </div>
            <div>
              <div style={{ display: 'flex', gap: 2, marginBottom: 2 }}>
                {STAR_SLOTS.slice(0, testimonial.stars).map((slot) => (
                  <Star key={`${testimonial.name}-${slot}`} />
                ))}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>
                {testimonial.name}
              </div>
            </div>
          </div>
          <p style={{ fontSize: 13, color: theme.mutedText, lineHeight: 1.5 }}>
            {testimonial.text}
          </p>
        </div>
      ))}
    </div>
  );
}

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
          Formas de pagamento
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
            <path d="M7 11V7a5 5 0 0110 0v4" fill="none" stroke={theme.mutedText} strokeWidth="2" />
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
              100% SEGURO
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

function SummaryProductRow({
  theme,
  productImage,
  productName,
  unitPriceInCents,
  fmtBrl,
}: {
  theme: CheckoutVisualTheme;
  productImage?: string;
  productName: string;
  unitPriceInCents: number;
  fmtBrl: (value: number) => string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
      {productImage ? (
        // biome-ignore lint/performance/noImgElement: dynamic product image from merchant-configured URL, no need to optimize via next/image
        <img
          src={productImage}
          alt={productName}
          width={72}
          height={72}
          style={{
            width: 72,
            height: 72,
            objectFit: 'cover',
            borderRadius: 8,
            border: `1px solid ${theme.cardBorder}`,
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 8,
            background: theme.summaryBackground,
            border: `1px solid ${theme.cardBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: 22,
            fontWeight: 700,
            color: theme.mutedText,
          }}
        >
          {productName.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 400,
            color: theme.mutedText,
            lineHeight: 1.4,
            marginBottom: 4,
          }}
        >
          {productName}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>
          {fmtBrl(unitPriceInCents)}
        </div>
      </div>
    </div>
  );
}

function QuantityControl({
  theme,
  qty,
  setQty,
  compact = false,
}: {
  theme: CheckoutVisualTheme;
  qty: number;
  setQty: Dispatch<SetStateAction<number>>;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: compact ? 'flex-start' : 'center',
        marginBottom: compact ? 0 : 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: theme.quantityBackground,
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          onClick={() => setQty((value) => Math.max(1, value - 1))}
          style={quantityButton(theme)}
        >
          <Mn />
        </button>
        <span
          style={{
            padding: compact ? '8px 20px' : '10px 24px',
            fontSize: compact ? 16 : 17,
            fontWeight: 700,
            color: theme.quantityText,
          }}
        >
          {qty}
        </span>
        <button
          type="button"
          onClick={() => setQty((value) => value + 1)}
          style={quantityButton(theme)}
        >
          <Pl />
        </button>
      </div>
    </div>
  );
}

function CouponRow({
  theme,
  couponCode,
  setCouponCode,
  onApplyCoupon,
}: {
  theme: CheckoutVisualTheme;
  couponCode: string;
  setCouponCode: Dispatch<SetStateAction<string>>;
  onApplyCoupon: () => void;
}) {
  return (
    <>
      <div style={{ fontSize: 15, fontWeight: 600, color: theme.text, marginBottom: 10 }}>
        Tem um cupom?
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 14px',
            border: `1px solid ${theme.cardBorder}`,
            borderRadius: 16,
            background: theme.cardBackground,
            minWidth: 0,
          }}
        >
          <Tag stroke={theme.input.tagStroke} />
          <input
            value={couponCode}
            onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
            placeholder="Código do cupom"
            style={{
              flex: 1,
              padding: '12px 0',
              border: 'none',
              fontSize: 14,
              outline: 'none',
              background: 'transparent',
              color: theme.text,
              fontFamily: "'DM Sans', sans-serif",
              minWidth: 0,
            }}
          />
        </div>
        <button
          type="button"
          onClick={onApplyCoupon}
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
          Adicionar
        </button>
      </div>
    </>
  );
}

function SummaryTotals({
  theme,
  couponApplied,
  discount,
  subtotal,
  shippingInCents,
  totalWithInterest,
  fmtBrl,
}: {
  theme: CheckoutVisualTheme;
  couponApplied: boolean;
  discount: number;
  subtotal: number;
  shippingInCents: number;
  totalWithInterest: number;
  fmtBrl: (value: number) => string;
}) {
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
        <span>Produtos</span>
        <span>{fmtBrl(subtotal)}</span>
      </div>
      <div style={summaryLine(theme)}>
        <span>Frete</span>
        <span>{shippingInCents === 0 ? 'Grátis' : fmtBrl(shippingInCents)}</span>
      </div>
      {couponApplied ? (
        <div style={{ ...summaryLine(theme), color: theme.successText }}>
          <span>Desconto</span>
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
        <span style={{ fontSize: 15, color: theme.totalAccent, fontWeight: 400 }}>Total</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: theme.totalAccent }}>
          {fmtBrl(totalWithInterest)}
        </span>
      </div>
    </div>
  );
}

function summaryToggle(theme: CheckoutVisualTheme) {
  return {
    width: '100%',
    padding: '16px 20px',
    background: 'transparent',
    border: 'none',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: theme.text,
  } satisfies React.CSSProperties;
}

function summaryLine(theme: CheckoutVisualTheme) {
  return {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 15,
    fontWeight: 700,
    color: theme.text,
    marginBottom: 8,
  } satisfies React.CSSProperties;
}

function quantityButton(theme: CheckoutVisualTheme) {
  return {
    padding: '8px 18px',
    background: 'transparent',
    border: 'none',
    color: theme.mutedText,
    display: 'flex',
    alignItems: 'center',
  } satisfies React.CSSProperties;
}
