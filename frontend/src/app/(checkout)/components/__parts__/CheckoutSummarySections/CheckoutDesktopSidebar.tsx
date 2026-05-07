'use client';

import { kloelT } from '@/lib/i18n/t';
import { Star } from '../../checkout-theme-shared';
import { CouponRow } from './CouponRow';
import { QuantityControl } from './QuantityControl';
import { SummaryProductRow } from './SummaryProductRow';
import { SummaryTotals } from './SummaryTotals';
import { STAR_SLOTS } from './helpers';
import type { SummaryProps } from './types';

/** Checkout desktop sidebar. */
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
